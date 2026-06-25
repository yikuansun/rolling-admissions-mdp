/**
 * Monte Carlo simulation engine for the Rolling Admissions MDP (v3).
 *
 * Implements the stochastic transition dynamics:
 * 1. Arrival Phase (Poisson + Multinomial)
 * 2. Decision Phase (apply policy action K + grant extensions G)
 * 3. Stochastic Response Phase (waitlist dropouts + offer responses + extension requests)
 * 4. Clock tick (offers age down, waitlist tenure advances)
 */

import type { ModelParameters, State, Action, PeriodRecord, SimulationResult, Policy, PolicyFn } from './types';
import { IntTensor2D, IntTensor3D } from './tensor';
import { samplePoisson, sampleBinomial, sampleMultinomial } from './random';
import { compilePolicyFn } from './policy';

// ─── State helpers ──────────────────────────────────────────────────────────

/** Create an initial (all-zeros) state for the given parameters. */
export function createInitialState(params: ModelParameters): State {
  return {
    M: new IntTensor2D(params.r, params.A),
    N: new IntTensor3D(params.r, params.A, params.tauMax),
    O: new IntTensor3D(params.r, params.A, params.W),
    R: new IntTensor2D(params.r, params.A),
  };
}

/** Clone a state (fast typed array copy). */
export function cloneState(s: State): State {
  return {
    M: s.M.clone(),
    N: s.N.clone(),
    O: s.O.clone(),
    R: s.R.clone(),
  };
}

/** Compute remaining capacity. */
export function remainingCapacity(state: State, C: number): number {
  return C - state.M.sum();
}

// ─── Period simulation ──────────────────────────────────────────────────────

/**
 * Simulate a single period transition (mutates `state` in place).
 * @returns Number of extensions granted this period.
 */
export function simulatePeriodInPlace(state: State, t: number, action: Action, params: ModelParameters, autoGrantExtensions: boolean): number {
  const { r, A, W, tauMax } = params;

  // --- 1. Arrival Phase ---
  const totalArrivals = samplePoisson(params.lambda.get(t));

  if (totalArrivals > 0) {
    const bucketCount = r * A;
    const probs = new Float64Array(bucketCount);
    for (let i = 0; i < r; i++) {
      for (let a = 0; a < A; a++) {
        probs[i * A + a] = params.pi.get(i, a, t);
      }
    }
    const arrivals = sampleMultinomialGeneral(totalArrivals, probs);
    for (let i = 0; i < r; i++) {
      for (let a = 0; a < A; a++) {
        const count = arrivals[i * A + a];
        if (count > 0) state.N.add(i, a, 0, count);
      }
    }
  }

  // --- 2. Decision Phase ---

  // 2a. Apply action K: move students from waitlist to offers at max window
  for (let i = 0; i < r; i++) {
    for (let a = 0; a < A; a++) {
      for (let tau = 0; tau < tauMax; tau++) {
        const k = action.get(i, a, tau);
        if (k <= 0) continue;
        const available = state.N.get(i, a, tau);
        const actual = Math.min(k, available);
        if (actual <= 0) continue;
        state.N.add(i, a, tau, -actual);
        state.O.add(i, a, W - 1, actual);
      }
    }
  }

  // 2b. Grant extensions G: move from R to O at max window
  let extensionsGranted = 0;
  if (autoGrantExtensions) {
    for (let i = 0; i < r; i++) {
      for (let a = 0; a < A; a++) {
        const requests = state.R.get(i, a);
        if (requests > 0) {
          state.O.add(i, a, W - 1, requests);
          extensionsGranted += requests;
        }
      }
    }
  }
  // Clear R (consumed this period regardless of grant decision)
  state.R.fill(0);

  // --- 3. Stochastic Response Phase ---

  // 3a. Waitlist dropouts + tenure advancement
  const nextN = new IntTensor3D(r, A, tauMax);
  for (let i = 0; i < r; i++) {
    for (let a = 0; a < A; a++) {
      for (let tau = 0; tau < tauMax; tau++) {
        const count = state.N.get(i, a, tau);
        if (count <= 0) continue;
        const survivalProb = 1 - params.delta.get(i, a, t, tau);
        const survived = sampleBinomial(count, survivalProb);
        if (survived > 0 && tau + 1 < tauMax) {
          nextN.add(i, a, tau + 1, survived);
        }
      }
    }
  }

  // 3b. Outstanding offer responses
  const nextO = new IntTensor3D(r, A, W);
  const nextR = new IntTensor2D(r, A); // extension requests for next period

  for (let i = 0; i < r; i++) {
    for (let a = 0; a < A; a++) {
      for (let w = 0; w < W; w++) {
        const count = state.O.get(i, a, w);
        if (count <= 0) continue;

        const thetaVal = params.theta.get(i, a, t, w);
        const muVal = params.mu.get(i, a, t, w);
        const residual = Math.max(0, 1 - thetaVal - muVal);

        const [accepts, _rejects, undecidedOrExt] = sampleMultinomial(count, [thetaVal, muVal, residual]);

        // Accepts → matriculated
        if (accepts > 0) {
          state.M.add(i, a, accepts);
        }

        if (w === 0) {
          // Expiring offers (w=0 means 1 period remaining):
          // undecidedOrExt = extension requests (ε probability)
          if (undecidedOrExt > 0) {
            nextR.add(i, a, undecidedOrExt);
          }
          // No undecided carry-forward for w=0
        } else {
          // Mid-cycle: undecided age down to w-1
          if (undecidedOrExt > 0) {
            nextO.add(i, a, w - 1, undecidedOrExt);
          }
        }
      }
    }
  }

  // --- 4. Commit next-period state ---
  state.N.data.set(nextN.data);
  state.O.data.set(nextO.data);
  state.R.data.set(nextR.data);

  return extensionsGranted;
}

// ─── Full simulation run ────────────────────────────────────────────────────

export function runSimulation(params: ModelParameters, policy: Policy): SimulationResult {
  const { T, r, A, C } = params;
  const policyFn = compilePolicyFn(policy);
  const autoGrant = policy.kind === 'matrix' ? policy.autoGrantExtensions : true;
  let state = createInitialState(params);
  const periods: PeriodRecord[] = [];
  let totalExtensionsGranted = 0;

  for (let t = 0; t < T; t++) {
    // Snapshot state before
    const M_before = state.M.data.slice();
    const N_before = state.N.data.slice();
    const O_before = state.O.data.slice();
    const R_before = state.R.data.slice();

    // Evaluate policy
    const action = policyFn(state, t, params);

    // Clamp action to feasible set
    const cap = remainingCapacity(state, C);
    clampActionInPlace(action, state, cap, params);

    const actionData = action.data.slice();

    // Simulate period (mutates state)
    const extGranted = simulatePeriodInPlace(state, t, action, params, autoGrant);
    totalExtensionsGranted += extGranted;

    periods.push({
      period: t,
      M_before,
      N_before,
      O_before,
      R_before,
      action: actionData,
      extensionsGranted: extGranted,
      M_after: state.M.data.slice(),
      N_after: state.N.data.slice(),
      O_after: state.O.data.slice(),
      R_after: state.R.data.slice(),
    });
  }

  // Compute objective
  const totalMatriculated = state.M.sum();
  const seatsRemaining = C - totalMatriculated;

  let qualityValue = 0;
  for (let i = 0; i < r; i++) {
    const qi = (i + 1) / r;
    for (let a = 0; a < A; a++) {
      qualityValue += state.M.get(i, a) * qi;
    }
  }

  let diversityPenalty = 0;
  if (totalMatriculated > 0) {
    for (let a = 0; a < A; a++) {
      let attrCount = 0;
      for (let i = 0; i < r; i++) attrCount += state.M.get(i, a);
      const share = attrCount / totalMatriculated;
      diversityPenalty += share * share;
    }
    diversityPenalty *= params.phi;
  }

  const overbooked = Math.max(0, totalMatriculated - C);
  const overbookingPenalty = params.psi * overbooked * overbooked;
  const totalValue = qualityValue - diversityPenalty - overbookingPenalty;

  const matriculatedByTier = new Array(r).fill(0);
  for (let i = 0; i < r; i++) {
    for (let a = 0; a < A; a++) matriculatedByTier[i] += state.M.get(i, a);
  }

  const matriculatedByAttribute = new Array(A).fill(0);
  for (let a = 0; a < A; a++) {
    for (let i = 0; i < r; i++) matriculatedByAttribute[a] += state.M.get(i, a);
  }

  return {
    periods,
    totalValue,
    qualityValue,
    diversityPenalty,
    overbookingPenalty,
    seatsRemaining,
    totalMatriculated,
    matriculatedByTier,
    matriculatedByAttribute,
    totalExtensionsGranted,
  };
}

// ─── Action clamping ────────────────────────────────────────────────────────

function clampActionInPlace(action: Action, state: State, capacity: number, params: ModelParameters): void {
  const { r, A, tauMax } = params;
  let totalOffers = 0;

  for (let i = 0; i < r; i++) {
    for (let a = 0; a < A; a++) {
      for (let tau = 0; tau < tauMax; tau++) {
        const k = action.get(i, a, tau);
        const available = state.N.get(i, a, tau);
        const clamped = Math.min(Math.max(k, 0), available);
        action.set(i, a, tau, clamped);
        totalOffers += clamped;
      }
    }
  }

  if (totalOffers > capacity) {
    let remaining = Math.max(capacity, 0);
    for (let i = r - 1; i >= 0; i--) {
      for (let a = 0; a < A; a++) {
        for (let tau = 0; tau < tauMax; tau++) {
          const k = action.get(i, a, tau);
          const actual = Math.min(k, remaining);
          action.set(i, a, tau, actual);
          remaining -= actual;
        }
      }
    }
  }
}

// ─── Monte Carlo ────────────────────────────────────────────────────────────

export function runMonteCarloSimulations(
  params: ModelParameters,
  policy: Policy,
  numRuns: number
): SimulationResult[] {
  const results: SimulationResult[] = [];
  for (let i = 0; i < numRuns; i++) {
    results.push(runSimulation(params, policy));
  }
  return results;
}

// ─── General multinomial sampler ────────────────────────────────────────────

function sampleMultinomialGeneral(n: number, probs: Float64Array): Int32Array {
  const k = probs.length;
  const result = new Int32Array(k);
  if (n <= 0) return result;

  let remaining = n;
  let probRemaining = 1.0;

  for (let j = 0; j < k - 1; j++) {
    if (remaining <= 0) break;
    const p = probRemaining > 0 ? probs[j] / probRemaining : 0;
    const count = sampleBinomial(remaining, Math.min(p, 1));
    result[j] = count;
    remaining -= count;
    probRemaining -= probs[j];
  }
  result[k - 1] = remaining;

  return result;
}

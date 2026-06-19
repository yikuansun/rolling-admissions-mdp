/**
 * Monte Carlo simulation engine for the Rolling Admissions MDP (v2).
 *
 * Uses flat typed-array tensors for high-performance computation.
 * Implements the stochastic transition dynamics:
 * 1. Arrival Phase (Poisson + Multinomial)
 * 2. Decision Phase (apply policy action)
 * 3. Stochastic Response Phase (waitlist dropouts + offer responses)
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
  };
}

/** Clone a state (fast typed array copy). */
export function cloneState(s: State): State {
  return {
    M: s.M.clone(),
    N: s.N.clone(),
    O: s.O.clone(),
  };
}

/** Compute remaining capacity. */
export function remainingCapacity(state: State, C: number): number {
  return C - state.M.sum();
}

// ─── Period simulation ──────────────────────────────────────────────────────

/**
 * Simulate a single period transition (mutates `state` in place for performance).
 * Returns the state after transition.
 */
export function simulatePeriodInPlace(state: State, t: number, action: Action, params: ModelParameters): void {
  const { r, A, W, tauMax } = params;

  // --- 1. Arrival Phase ---
  // Sample total arrivals from Poisson(lambda(t))
  const totalArrivals = samplePoisson(params.lambda.get(t));

  if (totalArrivals > 0) {
    // Distribute arrivals across (i, a) buckets via multinomial
    // Build cumulative probabilities for this period
    const bucketCount = r * A;
    const probs = new Float64Array(bucketCount);
    for (let i = 0; i < r; i++) {
      for (let a = 0; a < A; a++) {
        probs[i * A + a] = params.pi.get(i, a, t);
      }
    }

    // Sample multinomial
    const arrivals = sampleMultinomialGeneral(totalArrivals, probs);

    // Add arrivals to waitlist at τ=0 (tenure index 0 = tenure 1)
    for (let i = 0; i < r; i++) {
      for (let a = 0; a < A; a++) {
        const count = arrivals[i * A + a];
        if (count > 0) {
          state.N.add(i, a, 0, count);
        }
      }
    }
  }

  // --- 2. Decision Phase ---
  // Apply action: move students from waitlist to offers at max window
  for (let i = 0; i < r; i++) {
    for (let a = 0; a < A; a++) {
      for (let tau = 0; tau < tauMax; tau++) {
        const k = action.get(i, a, tau);
        if (k <= 0) continue;
        const available = state.N.get(i, a, tau);
        const actual = Math.min(k, available);
        if (actual <= 0) continue;
        state.N.add(i, a, tau, -actual);
        state.O.add(i, a, W - 1, actual); // W-1 = max window slot
      }
    }
  }

  // --- 3. Stochastic Response Phase ---

  // 3a. Waitlist dropouts + tenure advancement
  // We need a temporary buffer for the next-period waitlist
  const nextN = new IntTensor3D(r, A, tauMax);

  for (let i = 0; i < r; i++) {
    for (let a = 0; a < A; a++) {
      for (let tau = 0; tau < tauMax; tau++) {
        const count = state.N.get(i, a, tau);
        if (count <= 0) continue;
        const survivalProb = 1 - params.delta.get(i, a, t, tau);
        const survived = sampleBinomial(count, survivalProb);
        // Survived students advance to tau+1 (if within bounds)
        if (survived > 0 && tau + 1 < tauMax) {
          nextN.add(i, a, tau + 1, survived);
        }
        // Students at tauMax-1 that survive are dropped (auto-expiration)
      }
    }
  }

  // 3b. Outstanding offer responses
  const nextO = new IntTensor3D(r, A, W);

  for (let i = 0; i < r; i++) {
    for (let a = 0; a < A; a++) {
      for (let w = 0; w < W; w++) {
        const count = state.O.get(i, a, w);
        if (count <= 0) continue;

        // w index: 0 = 1 period remaining, w = w+1 periods remaining
        const periodsRemaining = w + 1;
        const thetaVal = params.theta.get(i, a, t, w);
        const muVal = params.mu.get(i, a, t, w);

        const [accepts, _rejects, undecided] = sampleMultinomial(count, [thetaVal, muVal, 1 - thetaVal - muVal]);

        // Accepts go to matriculated
        if (accepts > 0) {
          state.M.add(i, a, accepts);
        }

        // Undecided age down: move to w-1 slot
        if (undecided > 0 && w > 0) {
          nextO.add(i, a, w - 1, undecided);
        }
        // If w=0 (last period), undecided = 0 due to boundary constraint
      }
    }
  }

  // --- 4. Commit next-period state ---
  // Replace N and O with the computed next-period values
  state.N.data.set(nextN.data);
  state.O.data.set(nextO.data);
}

// ─── Full simulation run ────────────────────────────────────────────────────

/**
 * Run a full simulation from t=0 to t=T.
 */
export function runSimulation(params: ModelParameters, policy: Policy): SimulationResult {
  const { T, r, A, C } = params;
  const policyFn = compilePolicyFn(policy);
  let state = createInitialState(params);
  const periods: PeriodRecord[] = [];

  for (let t = 0; t < T; t++) {
    // Snapshot state before
    const M_before = state.M.data.slice();
    const N_before = state.N.data.slice();
    const O_before = state.O.data.slice();

    // Evaluate policy
    const action = policyFn(state, t, params);

    // Clamp action to feasible set
    const cap = remainingCapacity(state, C);
    clampActionInPlace(action, state, cap, params);

    const actionData = action.data.slice();

    // Simulate period (mutates state)
    simulatePeriodInPlace(state, t, action, params);

    periods.push({
      period: t,
      M_before,
      N_before,
      O_before,
      action: actionData,
      M_after: state.M.data.slice(),
      N_after: state.N.data.slice(),
      O_after: state.O.data.slice(),
    });
  }

  // Compute objective
  const totalMatriculated = state.M.sum();
  const seatsRemaining = C - totalMatriculated;

  // Quality value
  let qualityValue = 0;
  for (let i = 0; i < r; i++) {
    const qi = (i + 1) / r;
    for (let a = 0; a < A; a++) {
      qualityValue += state.M.get(i, a) * qi;
    }
  }

  // Diversity penalty (HHI)
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

  // Overbooking penalty
  const overbooked = Math.max(0, totalMatriculated - C);
  const overbookingPenalty = params.psi * overbooked * overbooked;

  const totalValue = qualityValue - diversityPenalty - overbookingPenalty;

  // Aggregate stats
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
  };
}

// ─── Action clamping ────────────────────────────────────────────────────────

/** Clamp action in place to be feasible given current state and capacity. */
function clampActionInPlace(action: Action, state: State, capacity: number, params: ModelParameters): void {
  const { r, A, tauMax } = params;
  let totalOffers = 0;

  // First pass: clamp each cell to available waitlist
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

  // If total exceeds capacity, scale down (prioritize higher tiers)
  if (totalOffers > capacity) {
    let remaining = Math.max(capacity, 0);
    // Iterate from highest tier down
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
    // Zero out anything not reached (lower tiers)
    if (remaining <= 0) {
      // Already handled by the loop above cutting off
    }
  }
}

// ─── Monte Carlo ────────────────────────────────────────────────────────────

/**
 * Run multiple Monte Carlo simulations and return all results.
 */
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

/**
 * Sample from Multinomial(n, probs) where probs has arbitrary length.
 * Returns Int32Array of counts.
 */
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
  result[k - 1] = remaining; // Last bucket gets the remainder

  return result;
}

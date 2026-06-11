/**
 * Monte Carlo simulation engine for the Rolling Admissions MDP.
 *
 * Implements the stochastic transition dynamics described in the paper:
 * 1. Arrival Phase
 * 2. Decision Phase (apply policy action)
 * 3. Stochastic Response Phase (waitlist dropouts + offer responses)
 * 4. Clock tick (offers age down)
 */

import type { ModelParameters, State, Action, PeriodRecord, SimulationResult, Policy, PolicyFn } from './types';
import { sampleBinomial, sampleMultinomial } from './random';
import { compilePolicyFn } from './policy';

/** Deep-clone a state object. */
function cloneState(s: State): State {
  return {
    m: [...s.m],
    n: [...s.n],
    O: s.O.map(row => [...row]),
  };
}

/** Create an initial (all-zeros) state for the given parameters. */
export function createInitialState(params: ModelParameters): State {
  const m = new Array(params.r).fill(0);
  const n = new Array(params.r).fill(0);
  const O = Array.from({ length: params.r }, () => new Array(params.W).fill(0));
  return { m, n, O };
}

/** Compute remaining capacity from state. */
export function remainingCapacity(state: State, C: number): number {
  const totalMatriculated = state.m.reduce((a, b) => a + b, 0);
  return C - totalMatriculated;
}

/** Compute total outstanding offers. */
function totalOutstanding(state: State): number {
  let total = 0;
  for (const row of state.O) {
    for (const v of row) total += v;
  }
  return total;
}

/**
 * Simulate a single period transition.
 * @param state State at the beginning of period t (will not be mutated).
 * @param t Period index (0-based).
 * @param action Action vector for this period.
 * @param params Model parameters.
 * @returns The state at the beginning of period t+1.
 */
export function simulatePeriod(state: State, t: number, action: Action, params: ModelParameters): State {
  const { r, W, C } = params;
  const next: State = cloneState(state);

  // --- 1. Arrival Phase ---
  const arrivalRoll = Math.random();
  let cumProb = 0;
  for (let i = 0; i < r; i++) {
    cumProb += params.p[i][t];
    if (arrivalRoll < cumProb) {
      next.n[i] += 1;
      break;
    }
  }

  // --- 2. Decision Phase ---
  // Apply action: move k[i] students from waitlist to offers with max window
  for (let i = 0; i < r; i++) {
    const k = Math.min(action[i], next.n[i]); // clamp to available waitlist
    next.n[i] -= k;
    next.O[i][W - 1] += k; // W-1 is the index for "W periods remaining"
  }

  // --- 3. Stochastic Response Phase ---

  // 3a. Waitlist dropouts
  for (let i = 0; i < r; i++) {
    const survived = sampleBinomial(next.n[i], 1 - params.lambda[i][t]);
    next.n[i] = survived;
  }

  // 3b. Outstanding offer responses
  // We need to track accepts to update matriculation, and undecided to age down.
  // Temp storage for undecided counts (to age down after)
  const undecided: number[][] = Array.from({ length: r }, () => new Array(W).fill(0));

  for (let i = 0; i < r; i++) {
    for (let w = 0; w < W; w++) {
      const count = next.O[i][w];
      if (count === 0) continue;

      // w index: 0 = 1 period remaining, 1 = 2 periods remaining, ..., W-1 = W periods remaining
      // Paper uses w as "periods remaining" 1-indexed, so paper's w = our (w+1)
      const periodsRemaining = w + 1;
      const theta = params.theta[i][t][periodsRemaining - 1]; // accept prob
      const mu = params.mu[i][t][periodsRemaining - 1]; // reject prob

      const [accepts, _rejects, undec] = sampleMultinomial(count, [theta, mu, 1 - theta - mu]);
      next.m[i] += accepts;
      undecided[i][w] = undec;
    }
  }

  // --- 4. Clock Tick: age down undecided offers ---
  for (let i = 0; i < r; i++) {
    for (let w = 0; w < W; w++) {
      if (w === 0) {
        // Offers with 1 period remaining that are undecided should be 0
        // (boundary constraint: theta + mu = 1 when w=1, so undecided[i][0] should be 0)
        next.O[i][w] = 0;
      } else {
        // Undecided offers with (w+1) periods remaining become offers with w periods remaining
        next.O[i][w - 1] = undecided[i][w];
      }
    }
    // Highest window slot is cleared (new offers only come from decisions)
    next.O[i][W - 1] = 0;
  }

  return next;
}

/**
 * Run a full simulation from t=0 to t=T using a policy (rule-based or fixed).
 */
export function runSimulation(params: ModelParameters, policy: Policy): SimulationResult {
  const { T, r, C } = params;
  const policyFn = compilePolicyFn(policy);
  let state = createInitialState(params);
  const periods: PeriodRecord[] = [];

  for (let t = 0; t < T; t++) {
    const stateBefore = cloneState(state);

    // Evaluate policy against current state
    const action = policyFn(state, t, params);

    // Clamp action to feasible set
    const cap = remainingCapacity(state, C);
    const clampedAction = clampAction(action, state, cap);

    const stateAfter = simulatePeriod(state, t, clampedAction, params);
    periods.push({ period: t, stateBefore, action: clampedAction, stateAfter });
    state = stateAfter;
  }

  const totalMatriculated = state.m.reduce((a, b) => a + b, 0);
  const seatsRemaining = C - totalMatriculated;
  let totalValue = 0;
  for (let i = 0; i < r; i++) {
    const qi = (i + 1) / r;
    totalValue += state.m[i] * qi;
  }

  return {
    periods,
    finalState: state,
    totalValue,
    seatsRemaining,
    totalMatriculated,
    matriculatedByTier: [...state.m],
  };
}

/** Clamp an action vector to be feasible given current state and capacity. */
function clampAction(action: Action, state: State, capacity: number): Action {
  const clamped = action.map((k, i) => Math.min(k, state.n[i]));
  let totalOffers = clamped.reduce((a, b) => a + b, 0);

  // If total exceeds capacity, scale down proportionally (greedy from highest tier)
  if (totalOffers > capacity) {
    const result = new Array(clamped.length).fill(0);
    let remaining = capacity;
    // Prioritize higher tiers
    for (let i = clamped.length - 1; i >= 0; i--) {
      result[i] = Math.min(clamped[i], remaining);
      remaining -= result[i];
    }
    return result;
  }

  return clamped;
}

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

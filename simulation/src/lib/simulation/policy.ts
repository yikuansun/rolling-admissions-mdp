/**
 * Policy evaluation: converts Policy definitions into executable PolicyFn functions.
 */

import type { ModelParameters, State, Action, Policy, PolicyFn, MatrixPolicy, TierPeriodParams } from './types';
import { IntTensor3D } from './tensor';
import { remainingCapacity } from './engine';

/**
 * Evaluate a matrix (per-period) policy at period t.
 * For each tier (highest first), check if conditions are met and extend offers.
 */
function evaluateMatrixPolicy(policy: MatrixPolicy, state: State, t: number, params: ModelParameters): Action {
  const { r, A, tauMax, C } = params;
  const action = new IntTensor3D(r, A, tauMax);
  const cap = remainingCapacity(state, C);

  // Evaluate from highest tier first (priority)
  for (let i = r - 1; i >= 0; i--) {
    const tierParams = policy.tiers[i];
    if (!tierParams) continue;

    const minWaitlist = tierParams.minWaitlist[t] ?? 0;
    const minCapacity = tierParams.minCapacity[t] ?? 0;
    const offersToExtend = tierParams.offersToExtend[t] ?? 0;

    if (offersToExtend <= 0) continue;
    if (cap < minCapacity) continue;

    // Apply to all attribute combinations
    for (let a = 0; a < A; a++) {
      const totalWaitlist = state.N.sumSlice(i, a);
      if (totalWaitlist < minWaitlist) continue;

      // Distribute offers from lowest tenure first
      let toOffer = Math.min(offersToExtend, totalWaitlist);
      for (let tau = 0; tau < tauMax && toOffer > 0; tau++) {
        const available = state.N.get(i, a, tau);
        const take = Math.min(toOffer, available);
        action.set(i, a, tau, take);
        toOffer -= take;
      }
    }
  }

  return action;
}

/**
 * Convert a Policy definition into a PolicyFn that the engine can call each period.
 */
export function compilePolicyFn(policy: Policy): PolicyFn {
  if (policy.kind === 'matrix') {
    return (state: State, t: number, params: ModelParameters): Action => {
      return evaluateMatrixPolicy(policy, state, t, params);
    };
  }

  // Fallback: no action
  return (_state, _t, params) => new IntTensor3D(params.r, params.A, params.tauMax);
}

/** Create a default matrix policy (offer 1 per tier if waitlist >= 1 and cap >= 1). */
export function createDefaultMatrixPolicy(r: number, T: number): MatrixPolicy {
  const tiers: TierPeriodParams[] = [];
  for (let i = 0; i < r; i++) {
    tiers.push({
      minWaitlist: new Array(T).fill(1),
      minCapacity: new Array(T).fill(1),
      offersToExtend: new Array(T).fill(1),
    });
  }
  return { kind: 'matrix', tiers, autoGrantExtensions: true };
}

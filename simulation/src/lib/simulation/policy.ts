/**
 * Policy evaluation: converts Policy definitions into executable PolicyFn functions.
 */

import type { ModelParameters, State, Action, Policy, PolicyFn, PolicyRule, RulePolicy } from './types';
import { IntTensor3D } from './tensor';
import { remainingCapacity } from './engine';

/**
 * Evaluate a rule-based policy against the current state.
 * Rules are evaluated in order. For each (tier, attribute) bucket,
 * the first matching rule determines the action.
 */
function evaluateRulePolicy(rules: PolicyRule[], state: State, params: ModelParameters): Action {
  const { r, A, tauMax, C } = params;
  const action = new IntTensor3D(r, A, tauMax);
  const cap = remainingCapacity(state, C);

  // Track which (tier, attr) buckets have been matched
  const matched = new Uint8Array(r * A);

  for (const rule of rules) {
    const { tier, attribute, minWaitlist, minCapacity, offersToExtend } = rule;
    if (tier < 0 || tier >= r) continue;
    if (cap < minCapacity) continue;

    // Determine which attributes this rule applies to
    const attrStart = attribute === -1 ? 0 : attribute;
    const attrEnd = attribute === -1 ? A : attribute + 1;

    for (let a = attrStart; a < attrEnd; a++) {
      if (a < 0 || a >= A) continue;
      const matchIdx = tier * A + a;
      if (matched[matchIdx]) continue;

      // Sum waitlist across all tenures for this (tier, attr) bucket
      const totalWaitlist = state.N.sumSlice(tier, a);
      if (totalWaitlist < minWaitlist) continue;

      // Rule fires: distribute offers from lowest tenure first
      matched[matchIdx] = 1;
      let toOffer = Math.min(offersToExtend, totalWaitlist);
      for (let tau = 0; tau < tauMax && toOffer > 0; tau++) {
        const available = state.N.get(tier, a, tau);
        const take = Math.min(toOffer, available);
        action.set(tier, a, tau, take);
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
  if (policy.kind === 'rules') {
    const { rules } = policy;
    return (state: State, t: number, params: ModelParameters): Action => {
      return evaluateRulePolicy(rules, state, params);
    };
  }

  // Fallback: no action
  return (_state, _t, params) => new IntTensor3D(params.r, params.A, params.tauMax);
}

/** Create a default rule-based policy for quick start. */
export function createDefaultRulePolicy(r: number): RulePolicy {
  const rules: PolicyRule[] = [];
  // Default: for each tier (highest first), offer 1 if waitlist >= 1 and capacity >= 1
  for (let i = r - 1; i >= 0; i--) {
    rules.push({
      tier: i,
      attribute: -1, // any attribute
      minWaitlist: 1,
      minCapacity: 1,
      offersToExtend: 1,
    });
  }
  return { kind: 'rules', rules };
}

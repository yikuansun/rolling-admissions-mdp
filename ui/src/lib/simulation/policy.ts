/**
 * Policy evaluation: converts Policy definitions into executable PolicyFn functions.
 */

import type { ModelParameters, State, Action, Policy, PolicyFn, PolicyRule, RulePolicy } from './types';
import { remainingCapacity } from './engine';

/**
 * Evaluate a rule-based policy against the current state.
 * Rules are evaluated in order. For each tier, the first matching rule determines the action.
 * If no rule matches for a tier, the action is 0.
 */
function evaluateRulePolicy(rules: PolicyRule[], state: State, params: ModelParameters): Action {
  const { r, C } = params;
  const action = new Array(r).fill(0);
  const matched = new Array(r).fill(false);
  const cap = remainingCapacity(state, C);

  for (const rule of rules) {
    const { tier, minWaitlist, minCapacity, offersToExtend } = rule;
    if (tier < 0 || tier >= r) continue;
    if (matched[tier]) continue; // first match wins for this tier

    if (state.n[tier] >= minWaitlist && cap >= minCapacity) {
      action[tier] = Math.min(offersToExtend, state.n[tier]);
      matched[tier] = true;
    }
  }

  return action;
}

/**
 * Convert a Policy definition into a PolicyFn that the engine can call each period.
 */
export function compilePolicyFn(policy: Policy): PolicyFn {
  if (policy.kind === 'fixed') {
    const { actions } = policy;
    return (state: State, t: number, params: ModelParameters): Action => {
      return actions[t] ?? new Array(params.r).fill(0);
    };
  }

  if (policy.kind === 'rules') {
    const { rules } = policy;
    return (state: State, t: number, params: ModelParameters): Action => {
      return evaluateRulePolicy(rules, state, params);
    };
  }

  // Fallback: no action
  return (_state, _t, params) => new Array(params.r).fill(0);
}

/** Create a default rule-based policy for quick start. */
export function createDefaultRulePolicy(r: number): RulePolicy {
  const rules: PolicyRule[] = [];
  // Default: for each tier (highest first), offer 1 if waitlist >= 1 and capacity >= 1
  for (let i = r - 1; i >= 0; i--) {
    rules.push({
      tier: i,
      minWaitlist: 1,
      minCapacity: 1,
      offersToExtend: 1,
    });
  }
  return { kind: 'rules', rules };
}

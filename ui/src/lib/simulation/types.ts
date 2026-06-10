/**
 * Types for the Rolling Admissions MDP simulation.
 */

/** Model parameters that define the MDP structure. */
export interface ModelParameters {
  /** Time horizon (number of periods) */
  T: number;
  /** Number of quality tiers */
  r: number;
  /** Maximum school capacity (seats) */
  C: number;
  /** Response window length (periods to respond to an offer) */
  W: number;
  /**
   * Arrival probabilities: p[i][t] = probability a tier-i student arrives at time t.
   * Indexed as p[tier][period], both 0-based internally.
   */
  p: number[][];
  /**
   * Waitlist dropout probabilities: lambda[i][t].
   */
  lambda: number[][];
  /**
   * Offer accept probabilities: theta[i][t][w].
   * w is 1-indexed validity remaining (1..W).
   */
  theta: number[][][];
  /**
   * Offer reject probabilities: mu[i][t][w].
   */
  mu: number[][][];
}

/** The state of the system at the start of period t. */
export interface State {
  /** Matriculated students per tier: m[i] */
  m: number[];
  /** Waitlist per tier: n[i] */
  n: number[];
  /** Outstanding offers matrix: O[i][w] where w is 0-indexed (0 = 1 period remaining) */
  O: number[][];
}

/** Action vector: number of offers extended per tier. */
export type Action = number[];

/** Record of a single period's state and action. */
export interface PeriodRecord {
  period: number;
  stateBefore: State;
  action: Action;
  stateAfter: State;
}

/** Results of a single simulation run. */
export interface SimulationResult {
  periods: PeriodRecord[];
  finalState: State;
  totalValue: number;
  seatsRemaining: number;
  totalMatriculated: number;
  matriculatedByTier: number[];
}

/** Static policy: actions[t][i] = number of tier-i offers at period t. */
export type StaticPolicy = number[][];

/**
 * A single threshold-based policy rule.
 * Evaluated per tier: "If waitlist for this tier >= minWaitlist
 * AND remaining capacity >= minCapacity, offer `offersToExtend` slots."
 */
export interface PolicyRule {
  /** Tier index (0-based) */
  tier: number;
  /** Minimum waitlist count for this tier to trigger the rule */
  minWaitlist: number;
  /** Minimum remaining capacity required to trigger the rule */
  minCapacity: number;
  /** Number of offers to extend when rule fires */
  offersToExtend: number;
}

/**
 * A rule-based policy: a list of rules evaluated in priority order (first match wins per tier).
 * Rules are grouped by tier and evaluated top-to-bottom.
 */
export interface RulePolicy {
  kind: 'rules';
  /** Rules evaluated in order. Higher-priority rules come first. */
  rules: PolicyRule[];
}

/** A fixed (information-independent) policy. */
export interface FixedPolicy {
  kind: 'fixed';
  actions: StaticPolicy;
}

/** Union type for all policy representations. */
export type Policy = RulePolicy | FixedPolicy;

/**
 * A policy function that maps (state, period, params) -> action vector.
 * This is the runtime interface consumed by the engine.
 */
export type PolicyFn = (state: State, t: number, params: ModelParameters) => Action;

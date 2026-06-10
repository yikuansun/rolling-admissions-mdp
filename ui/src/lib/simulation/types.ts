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

/** Policy: actions[t][i] = number of tier-i offers at period t. */
export type Policy = number[][];

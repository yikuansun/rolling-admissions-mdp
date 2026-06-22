/**
 * Types for the Rolling Admissions MDP simulation (v2).
 *
 * Matches the updated paper with:
 * - Quality tiers (r) × Attribute combinations (A)
 * - Tenure-tracked waitlist (τ_max)
 * - Poisson arrivals with multinomial bucket assignment
 * - 4D probability tensors
 */

import type { IntTensor2D, IntTensor3D, FloatTensor1D, FloatTensor3D, FloatTensor4D } from './tensor';

// ─── Model Parameters ───────────────────────────────────────────────────────

/** Model parameters that define the MDP structure. */
export interface ModelParameters {
  /** Time horizon (number of periods) */
  T: number;
  /** Number of quality tiers */
  r: number;
  /** Number of attribute combinations */
  A: number;
  /** Maximum school capacity (seats) */
  C: number;
  /** Response window length (periods to respond to an offer) */
  W: number;
  /** Maximum waitlist tenure before automatic removal */
  tauMax: number;

  /**
   * Poisson arrival rate per period.
   * Shape: [T]
   */
  lambda: FloatTensor1D;

  /**
   * Arrival distribution probabilities: π(i, a, t).
   * Probability that an arriving student falls into bucket (i, a) at time t.
   * Shape: [r, A, T]. For each t: sum over (i, a) = 1.
   */
  pi: FloatTensor3D;

  /**
   * Waitlist dropout probability: δ(i, a, t, τ).
   * Shape: [r, A, T, tauMax]
   */
  delta: FloatTensor4D;

  /**
   * Offer accept probability: θ(i, a, t, w).
   * Shape: [r, A, T, W]
   */
  theta: FloatTensor4D;

  /**
   * Offer reject probability: μ(i, a, t, w).
   * Shape: [r, A, T, W]
   */
  mu: FloatTensor4D;

  // ─── Objective function weights ───
  /** Diversity penalty weight (HHI coefficient) */
  phi: number;
  /** Overbooking penalty weight */
  psi: number;
}

// ─── State ──────────────────────────────────────────────────────────────────

/** The state of the system at the start of period t. */
export interface State {
  /**
   * Matriculated students: M(i, a).
   * Shape: [r, A]
   */
  M: IntTensor2D;

  /**
   * Waitlist: N(i, a, τ).
   * Shape: [r, A, tauMax]
   */
  N: IntTensor3D;

  /**
   * Outstanding offers: O(i, a, w).
   * w is 0-indexed: index 0 = 1 period remaining, index W-1 = W periods remaining.
   * Shape: [r, A, W]
   */
  O: IntTensor3D;
}

// ─── Actions ────────────────────────────────────────────────────────────────

/**
 * Action tensor: K(i, a, τ) = number of offers to extend from bucket (i, a, τ).
 * Shape: [r, A, tauMax]
 */
export type Action = IntTensor3D;

// ─── Records ────────────────────────────────────────────────────────────────

/** Record of a single period's state and action (stored as plain arrays for serialization). */
export interface PeriodRecord {
  period: number;
  /** Serialized state before action */
  M_before: Int32Array;
  N_before: Int32Array;
  O_before: Int32Array;
  /** Serialized action */
  action: Int32Array;
  /** Serialized state after transition */
  M_after: Int32Array;
  N_after: Int32Array;
  O_after: Int32Array;
}

/** Results of a single simulation run. */
export interface SimulationResult {
  periods: PeriodRecord[];
  /** Total objective value Z (quality - diversity penalty - overbooking penalty) */
  totalValue: number;
  /** Quality component of the objective */
  qualityValue: number;
  /** Diversity penalty (HHI term) */
  diversityPenalty: number;
  /** Overbooking penalty */
  overbookingPenalty: number;
  /** Remaining capacity */
  seatsRemaining: number;
  /** Total matriculated */
  totalMatriculated: number;
  /** Matriculated by tier: sum over attributes */
  matriculatedByTier: number[];
  /** Matriculated by attribute: sum over tiers */
  matriculatedByAttribute: number[];
}

// ─── Policy ─────────────────────────────────────────────────────────────────

/**
 * Per-period threshold parameters for a single tier.
 * thresholds[t] = { minWaitlist, minCapacity, offersToExtend } at period t.
 */
export interface TierPeriodParams {
  minWaitlist: number[];   // length T
  minCapacity: number[];   // length T
  offersToExtend: number[]; // length T
}

/**
 * A time-dependent matrix policy.
 * For each tier, defines per-period threshold parameters.
 * Applied to all attribute combinations (attribute = -1 semantics).
 * Tiers are ordered highest-first for priority.
 */
export interface MatrixPolicy {
  kind: 'matrix';
  /** Per-tier parameters, indexed by tier (0-based). Length = r. */
  tiers: TierPeriodParams[];
}

/** Union type for policy representations. */
export type Policy = MatrixPolicy;

/**
 * A policy function that maps (state, period, params) -> action tensor.
 * This is the runtime interface consumed by the engine.
 */
export type PolicyFn = (state: State, t: number, params: ModelParameters) => Action;

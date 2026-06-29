/**
 * Historical simulation engine.
 *
 * Replays a recorded admissions cycle through a user-defined policy.
 * Deterministic where historical data exists; falls back to stochastic sampling
 * for counterfactual branches (offers made that didn't happen historically).
 */

import type { ModelParameters, State, Policy, PolicyFn, SimulationResult, PeriodRecord } from './types';
import { IntTensor2D, IntTensor3D } from './tensor';
import { createInitialState, remainingCapacity } from './engine';
import { sampleBinomial, sampleMultinomial } from './random';
import { compilePolicyFn } from './policy';

// ─── Historical Data Types ──────────────────────────────────────────────────

/** A single historical event in the admissions cycle. */
export interface HistoricalEvent {
  /** Period when the event occurred (0-based). */
  period: number;
  /** Event type. */
  type: 'arrival' | 'dropout' | 'accept' | 'reject' | 'extension_request';
  /** Quality tier (0-based). */
  tier: number;
  /** Attribute combination (0-based). */
  attribute: number;
  /** For dropouts: waitlist tenure at time of dropout (0-based). */
  tenure?: number;
  /** For offer responses: remaining window at time of response (0-based, 0 = last period). */
  windowRemaining?: number;
}

/** A complete historical admissions cycle. */
export interface HistoricalCycle {
  /** All events, sorted by period. */
  events: HistoricalEvent[];
  /** Time horizon (must match model parameters). */
  T: number;
}

// ─── Replay Engine ──────────────────────────────────────────────────────────

/**
 * Run a historical simulation: replay observed events with a user-defined policy.
 *
 * - Arrivals: taken from historical data (deterministic).
 * - Decision phase: uses the provided policy (potentially different from historical).
 * - Dropouts & offer responses: use historical data for students who existed in the
 *   real cycle. For counterfactual students (those offered under the new policy but
 *   not in history), fall back to probabilistic sampling using model parameters.
 */
export function runHistoricalSimulation(
  params: ModelParameters,
  policy: Policy,
  cycle: HistoricalCycle,
): SimulationResult {
  const { T, r, A, W, tauMax, C } = params;
  const policyFn = compilePolicyFn(policy);
  const autoGrant = policy.kind === 'matrix' ? policy.autoGrantExtensions : true;

  let state = createInitialState(params);
  const periods: PeriodRecord[] = [];
  let totalExtensionsGranted = 0;

  // Pre-index events by period for fast lookup
  const eventsByPeriod: HistoricalEvent[][] = Array.from({ length: T }, () => []);
  for (const event of cycle.events) {
    if (event.period >= 0 && event.period < T) {
      eventsByPeriod[event.period].push(event);
    }
  }

  for (let t = 0; t < T; t++) {
    const periodEvents = eventsByPeriod[t];

    // Snapshot state before
    const M_before = state.M.data.slice();
    const N_before = state.N.data.slice();
    const O_before = state.O.data.slice();
    const R_before = state.R.data.slice();

    // --- 1. Arrival Phase (historical) ---
    const arrivals = periodEvents.filter(e => e.type === 'arrival');
    for (const ev of arrivals) {
      if (ev.tier >= 0 && ev.tier < r && ev.attribute >= 0 && ev.attribute < A) {
        state.N.add(ev.tier, ev.attribute, 0, 1);
      }
    }

    // --- 2. Decision Phase (policy-driven) ---
    const action = policyFn(state, t, params);
    // Clamp action
    const cap = remainingCapacity(state, C);
    clampActionInPlace(action, state, cap, params);
    const actionData = action.data.slice();

    // Apply action K
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

    // Grant extensions
    let extGranted = 0;
    if (autoGrant) {
      for (let i = 0; i < r; i++) {
        for (let a = 0; a < A; a++) {
          const requests = state.R.get(i, a);
          if (requests > 0) {
            state.O.add(i, a, W - 1, requests);
            extGranted += requests;
          }
        }
      }
    }
    state.R.fill(0);
    totalExtensionsGranted += extGranted;

    // --- 3. Stochastic Response Phase ---

    // 3a. Dropouts: use historical where available, sample for the rest
    const historicalDropouts = periodEvents.filter(e => e.type === 'dropout');

    // Build a dropout count per (tier, attr, tenure) from history
    const dropoutCounts = new IntTensor3D(r, A, tauMax);
    for (const ev of historicalDropouts) {
      const tau = ev.tenure ?? 0;
      if (ev.tier >= 0 && ev.tier < r && ev.attribute >= 0 && ev.attribute < A && tau >= 0 && tau < tauMax) {
        dropoutCounts.add(ev.tier, ev.attribute, tau, 1);
      }
    }

    const nextN = new IntTensor3D(r, A, tauMax);
    for (let i = 0; i < r; i++) {
      for (let a = 0; a < A; a++) {
        for (let tau = 0; tau < tauMax; tau++) {
          const count = state.N.get(i, a, tau);
          if (count <= 0) continue;

          // Use historical dropouts if we have data for this bucket
          const historicalDrop = Math.min(dropoutCounts.get(i, a, tau), count);
          let survived: number;

          if (historicalDrop > 0) {
            // Apply known dropouts deterministically
            survived = count - historicalDrop;
          } else {
            // No historical dropout data for this bucket — fall back to sampling
            const survivalProb = 1 - params.delta.get(i, a, t, tau);
            survived = sampleBinomial(count, survivalProb);
          }

          if (survived > 0 && tau + 1 < tauMax) {
            nextN.add(i, a, tau + 1, survived);
          }
        }
      }
    }

    // 3b. Offer responses: historical where available, sample for counterfactual
    const historicalResponses = periodEvents.filter(
      e => e.type === 'accept' || e.type === 'reject' || e.type === 'extension_request'
    );

    // Build response counts per (tier, attr, w)
    const acceptCounts = new IntTensor3D(r, A, W);
    const rejectCounts = new IntTensor3D(r, A, W);
    const extReqCounts = new IntTensor3D(r, A, W);
    for (const ev of historicalResponses) {
      const w = ev.windowRemaining ?? 0;
      if (ev.tier < 0 || ev.tier >= r || ev.attribute < 0 || ev.attribute >= A || w < 0 || w >= W) continue;
      if (ev.type === 'accept') acceptCounts.add(ev.tier, ev.attribute, w, 1);
      else if (ev.type === 'reject') rejectCounts.add(ev.tier, ev.attribute, w, 1);
      else if (ev.type === 'extension_request') extReqCounts.add(ev.tier, ev.attribute, w, 1);
    }

    const nextO = new IntTensor3D(r, A, W);
    const nextR = new IntTensor2D(r, A);

    for (let i = 0; i < r; i++) {
      for (let a = 0; a < A; a++) {
        for (let w = 0; w < W; w++) {
          const count = state.O.get(i, a, w);
          if (count <= 0) continue;

          const histAccepts = Math.min(acceptCounts.get(i, a, w), count);
          const histRejects = Math.min(rejectCounts.get(i, a, w), count - histAccepts);
          const histExt = w === 0 ? Math.min(extReqCounts.get(i, a, w), count - histAccepts - histRejects) : 0;
          const historicallyAccountedFor = histAccepts + histRejects + histExt;
          const counterfactualCount = count - historicallyAccountedFor;

          // Apply historical responses
          if (histAccepts > 0) state.M.add(i, a, histAccepts);
          if (w === 0 && histExt > 0) nextR.add(i, a, histExt);
          if (w > 0) {
            const histUndecided = count - histAccepts - histRejects;
            if (histUndecided > 0) nextO.add(i, a, w - 1, histUndecided);
          }

          // Sample for counterfactual students
          if (counterfactualCount > 0) {
            const thetaVal = params.theta.get(i, a, t, w);
            const muVal = params.mu.get(i, a, t, w);
            const residual = Math.max(0, 1 - thetaVal - muVal);

            const [cfAccepts, _cfRejects, cfUndecided] = sampleMultinomial(
              counterfactualCount,
              [thetaVal, muVal, residual]
            );

            if (cfAccepts > 0) state.M.add(i, a, cfAccepts);

            if (w === 0) {
              if (cfUndecided > 0) nextR.add(i, a, cfUndecided);
            } else {
              if (cfUndecided > 0) nextO.add(i, a, w - 1, cfUndecided);
            }
          }
        }
      }
    }

    // --- 4. Commit ---
    state.N.data.set(nextN.data);
    state.O.data.set(nextO.data);
    state.R.data.set(nextR.data);

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

  // --- Compute objective ---
  const totalMatriculated = state.M.sum();
  const seatsRemaining = C - totalMatriculated;

  let qualityValue = 0;
  for (let i = 0; i < r; i++) {
    const qi = (i + 1) / r;
    for (let a = 0; a < A; a++) qualityValue += state.M.get(i, a) * qi;
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
  for (let i = 0; i < r; i++) for (let a = 0; a < A; a++) matriculatedByTier[i] += state.M.get(i, a);

  const matriculatedByAttribute = new Array(A).fill(0);
  for (let a = 0; a < A; a++) for (let i = 0; i < r; i++) matriculatedByAttribute[a] += state.M.get(i, a);

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

// ─── CSV Parsing ────────────────────────────────────────────────────────────

/**
 * Parse a historical events CSV into a HistoricalCycle.
 *
 * Expected CSV format:
 *   Period,Type,Tier,Attribute,Tenure,WindowRemaining
 *   1,arrival,1,1,,
 *   3,dropout,2,1,2,
 *   5,accept,3,2,,1
 *
 * Period, Tier, Attribute are 1-indexed in CSV, converted to 0-indexed internally.
 */
export function parseHistoricalCSV(csv: string): HistoricalCycle | null {
  const lines = csv.trim().split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return null;

  const events: HistoricalEvent[] = [];
  let maxPeriod = 0;

  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(',').map(c => c.trim());
    if (cells.length < 4) continue;

    const period = parseInt(cells[0]) - 1; // 1-indexed → 0-indexed
    const type = cells[1].toLowerCase() as HistoricalEvent['type'];
    const tier = parseInt(cells[2]) - 1;
    const attribute = parseInt(cells[3]) - 1;

    if (isNaN(period) || isNaN(tier) || isNaN(attribute)) continue;
    if (!['arrival', 'dropout', 'accept', 'reject', 'extension_request'].includes(type)) continue;

    const tenure = cells[4] ? parseInt(cells[4]) - 1 : undefined;
    const windowRemaining = cells[5] ? parseInt(cells[5]) - 1 : undefined;

    events.push({ period, type, tier, attribute, tenure, windowRemaining });
    maxPeriod = Math.max(maxPeriod, period);
  }

  if (events.length === 0) return null;
  return { events, T: maxPeriod + 1 };
}

/**
 * Generate a template CSV for historical data.
 */
export function generateHistoricalTemplate(): string {
  const rows = [
    'Period,Type,Tier,Attribute,Tenure,WindowRemaining',
    '1,arrival,1,1,,',
    '1,arrival,2,1,,',
    '2,arrival,1,2,,',
    '3,dropout,1,1,2,',
    '5,accept,2,1,,2',
    '5,reject,1,2,,1',
    '8,extension_request,3,1,,1',
  ];
  return rows.join('\n');
}

// ─── Internal helpers ───────────────────────────────────────────────────────

function clampActionInPlace(action: IntTensor3D, state: State, capacity: number, params: ModelParameters): void {
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

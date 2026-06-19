/**
 * Default/initial model parameters for a quick start.
 */

import type { ModelParameters } from './types';
import { FloatTensor1D, FloatTensor3D, FloatTensor4D } from './tensor';

/** Create default model parameters matching the updated paper. */
export function createDefaultParams(): ModelParameters {
  const T = 30;
  const r = 3;
  const A = 2;
  const C = 20;
  const W = 3;
  const tauMax = 5;

  // Poisson arrival rate: ~2 students per period
  const lambda = new FloatTensor1D(T);
  for (let t = 0; t < T; t++) lambda.set(t, 2.0);

  // Arrival distribution: uniform across (i, a) buckets
  const pi = new FloatTensor3D(r, A, T);
  const uniformProb = 1 / (r * A);
  for (let i = 0; i < r; i++) {
    for (let a = 0; a < A; a++) {
      for (let t = 0; t < T; t++) {
        pi.set(i, a, t, uniformProb);
      }
    }
  }

  // Dropout probability: increases with tenure, slightly higher for lower tiers
  const delta = new FloatTensor4D(r, A, T, tauMax);
  for (let i = 0; i < r; i++) {
    for (let a = 0; a < A; a++) {
      for (let t = 0; t < T; t++) {
        for (let tau = 0; tau < tauMax; tau++) {
          // Base rate 0.05, +0.02 per tenure period, +0.02 for lower tiers
          const rate = 0.05 + 0.02 * tau + 0.02 * (r - 1 - i) / Math.max(r - 1, 1);
          delta.set(i, a, t, tau, Math.min(rate, 0.5));
        }
      }
    }
  }

  // Accept probability: higher tiers are pickier
  const theta = new FloatTensor4D(r, A, T, W);
  const mu = new FloatTensor4D(r, A, T, W);

  for (let i = 0; i < r; i++) {
    for (let a = 0; a < A; a++) {
      for (let t = 0; t < T; t++) {
        for (let w = 0; w < W; w++) {
          if (w === 0) {
            // Last period (w=1 remaining): must decide
            const acceptProb = 0.7 - 0.15 * i / Math.max(r - 1, 1);
            theta.set(i, a, t, w, acceptProb);
            mu.set(i, a, t, w, 1 - acceptProb);
          } else {
            // Still has time: partial decision
            theta.set(i, a, t, w, 0.25);
            mu.set(i, a, t, w, 0.1);
          }
        }
      }
    }
  }

  return {
    T, r, A, C, W, tauMax,
    lambda, pi, delta, theta, mu,
    phi: 1.0,
    psi: 10.0,
  };
}

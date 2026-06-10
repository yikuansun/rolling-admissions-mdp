/**
 * Default/initial model parameters for a quick start.
 */

import type { ModelParameters, StaticPolicy } from './types';

/** Create default model parameters. */
export function createDefaultParams(): ModelParameters {
  const T = 10;
  const r = 3;
  const C = 5;
  const W = 2;

  // Uniform arrival: each tier has 0.1 probability per period
  const p = Array.from({ length: r }, () => new Array(T).fill(0.1));

  // Low dropout probability
  const lambda = Array.from({ length: r }, () => new Array(T).fill(0.05));

  // Accept/reject probabilities: higher tiers are pickier (lower accept)
  // theta[i][t][w-1]
  const theta: number[][][] = [];
  const mu: number[][][] = [];

  for (let i = 0; i < r; i++) {
    theta.push([]);
    mu.push([]);
    for (let t = 0; t < T; t++) {
      theta[i].push([]);
      mu[i].push([]);
      for (let w = 0; w < W; w++) {
        if (w === 0) {
          // w=1 (last period): must decide. Higher tiers accept with lower prob.
          const acceptProb = 0.7 - 0.1 * i;
          theta[i][t].push(acceptProb);
          mu[i][t].push(1 - acceptProb); // boundary: theta + mu = 1 when w=1
        } else {
          // w > 1: some remain undecided
          theta[i][t].push(0.3);
          mu[i][t].push(0.1);
        }
      }
    }
  }

  return { T, r, C, W, p, lambda, theta, mu };
}

/** Create a default static policy (zeros — no offers). */
export function createDefaultStaticPolicy(T: number, r: number): StaticPolicy {
  return Array.from({ length: T }, () => new Array(r).fill(0));
}

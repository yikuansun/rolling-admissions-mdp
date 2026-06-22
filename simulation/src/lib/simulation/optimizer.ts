/**
 * Genetic Algorithm optimizer for policy search.
 *
 * Genome encoding (per-period matrix):
 *   For each tier (highest first), for each period t:
 *     [minWaitlist_t, minCapacity_t, offersToExtend_t]
 *   Total genome length = r * T * 3
 */

import type { ModelParameters, Policy, TierPeriodParams } from './types';
import { runMonteCarloSimulations } from './engine';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface OptimizerConfig {
  populationSize: number;
  generations: number;
  simsPerEval: number;
  eliteFraction: number;
  mutationRate: number;
  mutationSigma: number;
}

export interface Individual {
  genes: Float64Array;
  fitness: number;
}

export interface GenerationReport {
  generation: number;
  bestFitness: number;
  avgFitness: number;
  bestGenes: Float64Array;
}

export const DEFAULT_OPTIMIZER_CONFIG: OptimizerConfig = {
  populationSize: 50,
  generations: 100,
  simsPerEval: 50,
  eliteFraction: 0.2,
  mutationRate: 0.15,
  mutationSigma: 1.5,
};

// ─── Genome ↔ Policy conversion ─────────────────────────────────────────────

/**
 * Genome layout: for tier idx (0 = highest tier, r-1 = lowest tier):
 *   base = idx * T * 3
 *   For each period t:
 *     genes[base + t*3 + 0] = minWaitlist
 *     genes[base + t*3 + 1] = minCapacity
 *     genes[base + t*3 + 2] = offersToExtend
 */

/** Get gene bounds for given model params. Returns [min, max] per gene. */
export function getGeneBounds(params: ModelParameters): [number, number][] {
  const { r, T, C } = params;
  const bounds: [number, number][] = [];
  for (let idx = 0; idx < r; idx++) {
    for (let t = 0; t < T; t++) {
      bounds.push([0, 15]);       // minWaitlist
      bounds.push([0, C]);        // minCapacity
      bounds.push([0, C]);        // offersToExtend
    }
  }
  return bounds;
}

/** Decode a genome into a MatrixPolicy. */
export function decodeGenome(genes: Float64Array, params: ModelParameters): Policy {
  const { r, T } = params;
  const tiers: TierPeriodParams[] = new Array(r);

  for (let idx = 0; idx < r; idx++) {
    const tier = r - 1 - idx; // highest tier first in genome
    const base = idx * T * 3;
    const minWaitlist = new Array(T);
    const minCapacity = new Array(T);
    const offersToExtend = new Array(T);

    for (let t = 0; t < T; t++) {
      minWaitlist[t] = Math.max(0, Math.round(genes[base + t * 3 + 0]));
      minCapacity[t] = Math.max(0, Math.round(genes[base + t * 3 + 1]));
      offersToExtend[t] = Math.max(0, Math.round(genes[base + t * 3 + 2]));
    }

    tiers[tier] = { minWaitlist, minCapacity, offersToExtend };
  }

  return { kind: 'matrix', tiers };
}

/** Encode a MatrixPolicy into a genome. */
export function encodePolicy(policy: Policy, params: ModelParameters): Float64Array {
  const { r, T } = params;
  const genes = new Float64Array(r * T * 3);
  if (policy.kind !== 'matrix') return genes;

  for (let idx = 0; idx < r; idx++) {
    const tier = r - 1 - idx;
    const tierParams = policy.tiers[tier];
    const base = idx * T * 3;
    if (!tierParams) continue;

    for (let t = 0; t < T; t++) {
      genes[base + t * 3 + 0] = tierParams.minWaitlist[t] ?? 0;
      genes[base + t * 3 + 1] = tierParams.minCapacity[t] ?? 0;
      genes[base + t * 3 + 2] = tierParams.offersToExtend[t] ?? 0;
    }
  }
  return genes;
}

// ─── GA Operations ──────────────────────────────────────────────────────────

/** Initialize a random population. */
export function initPopulation(size: number, bounds: [number, number][]): Individual[] {
  const geneLength = bounds.length;
  const pop: Individual[] = [];
  for (let i = 0; i < size; i++) {
    const genes = new Float64Array(geneLength);
    for (let g = 0; g < geneLength; g++) {
      const [lo, hi] = bounds[g];
      genes[g] = lo + Math.random() * (hi - lo);
    }
    pop.push({ genes, fitness: -Infinity });
  }
  return pop;
}

/** Evaluate fitness of an individual. */
export function evaluateFitness(
  individual: Individual,
  params: ModelParameters,
  numSims: number
): number {
  const policy = decodeGenome(individual.genes, params);
  const results = runMonteCarloSimulations(params, policy, numSims);
  return results.reduce((s, r) => s + r.totalValue, 0) / results.length;
}

/** BLX-α crossover. */
export function crossover(parent1: Individual, parent2: Individual, alpha: number = 0.5): Individual {
  const len = parent1.genes.length;
  const child = new Float64Array(len);
  for (let i = 0; i < len; i++) {
    const lo = Math.min(parent1.genes[i], parent2.genes[i]);
    const hi = Math.max(parent1.genes[i], parent2.genes[i]);
    const range = hi - lo;
    child[i] = (lo - alpha * range) + Math.random() * (range * (1 + 2 * alpha));
  }
  return { genes: child, fitness: -Infinity };
}

/** Gaussian mutation with bounds clamping. */
export function mutate(
  individual: Individual,
  rate: number,
  sigma: number,
  bounds: [number, number][]
): void {
  for (let i = 0; i < individual.genes.length; i++) {
    if (Math.random() < rate) {
      const u1 = Math.random();
      const u2 = Math.random();
      const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      individual.genes[i] += z * sigma;
      const [lo, hi] = bounds[i];
      individual.genes[i] = Math.max(lo, Math.min(hi, individual.genes[i]));
    }
  }
}

/** Tournament selection: pick the better of two random individuals. */
export function tournamentSelect(population: Individual[]): Individual {
  const a = population[Math.floor(Math.random() * population.length)];
  const b = population[Math.floor(Math.random() * population.length)];
  return a.fitness >= b.fitness ? a : b;
}

// ─── Main GA Loop (kept for non-worker usage) ───────────────────────────────

export function runOptimization(
  params: ModelParameters,
  config: OptimizerConfig,
  onGeneration?: (report: GenerationReport) => void,
  shouldStop?: () => boolean,
): Policy {
  const { populationSize, generations, simsPerEval, eliteFraction, mutationRate, mutationSigma } = config;
  const bounds = getGeneBounds(params);
  const eliteCount = Math.max(1, Math.floor(populationSize * eliteFraction));

  let population = initPopulation(populationSize, bounds);
  for (const ind of population) {
    ind.fitness = evaluateFitness(ind, params, simsPerEval);
  }

  let bestEver: Individual = { genes: new Float64Array(bounds.length), fitness: -Infinity };

  for (let gen = 0; gen < generations; gen++) {
    if (shouldStop?.()) break;

    population.sort((a, b) => b.fitness - a.fitness);
    if (population[0].fitness > bestEver.fitness) {
      bestEver = { genes: population[0].genes.slice(), fitness: population[0].fitness };
    }

    const avgFitness = population.reduce((s, ind) => s + ind.fitness, 0) / populationSize;
    onGeneration?.({ generation: gen, bestFitness: population[0].fitness, avgFitness, bestGenes: population[0].genes.slice() });

    const elites = population.slice(0, eliteCount);
    const newPop: Individual[] = elites.map(e => ({ genes: e.genes.slice(), fitness: e.fitness }));

    while (newPop.length < populationSize) {
      const p1 = tournamentSelect(population);
      const p2 = tournamentSelect(population);
      const child = crossover(p1, p2);
      mutate(child, mutationRate, mutationSigma, bounds);
      child.fitness = evaluateFitness(child, params, simsPerEval);
      newPop.push(child);
    }

    population = newPop;
  }

  population.sort((a, b) => b.fitness - a.fitness);
  if (population[0].fitness > bestEver.fitness) bestEver = population[0];
  return decodeGenome(bestEver.genes, params);
}

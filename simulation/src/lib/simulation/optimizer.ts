/**
 * Genetic Algorithm optimizer for policy search.
 *
 * Genome encoding (fixed-length):
 *   One rule per tier, each with 3 genes: [minWaitlist, minCapacity, offersToExtend]
 *   Total genome length = r * 3
 *   All rules use attribute = -1 (any).
 *   Rules are ordered highest tier first (priority).
 */

import type { ModelParameters, Policy, PolicyRule, SimulationResult } from './types';
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
  mutationRate: 0.3,
  mutationSigma: 2.0,
};

// ─── Genome ↔ Policy conversion ─────────────────────────────────────────────

/** Get gene bounds for given model params. Returns [min, max] per gene. */
export function getGeneBounds(params: ModelParameters): [number, number][] {
  const bounds: [number, number][] = [];
  for (let i = 0; i < params.r; i++) {
    bounds.push([0, 20]);        // minWaitlist
    bounds.push([0, params.C]);  // minCapacity
    bounds.push([0, params.C]);  // offersToExtend
  }
  return bounds;
}

/** Decode a genome into a Policy. */
export function decodeGenome(genes: Float64Array, params: ModelParameters): Policy {
  const rules: PolicyRule[] = [];
  // Highest tier first (priority ordering)
  for (let idx = 0; idx < params.r; idx++) {
    const tier = params.r - 1 - idx; // highest tier first
    const base = idx * 3;
    rules.push({
      tier,
      attribute: -1,
      minWaitlist: Math.max(0, Math.round(genes[base])),
      minCapacity: Math.max(0, Math.round(genes[base + 1])),
      offersToExtend: Math.max(0, Math.round(genes[base + 2])),
    });
  }
  return { kind: 'rules', rules };
}

/** Encode a Policy into a genome (inverse of decodeGenome). */
export function encodePolicy(policy: Policy, params: ModelParameters): Float64Array {
  const genes = new Float64Array(params.r * 3);
  if (policy.kind !== 'rules') return genes;

  // Map rules by tier
  const byTier = new Map<number, PolicyRule>();
  for (const rule of policy.rules) {
    if (!byTier.has(rule.tier)) byTier.set(rule.tier, rule);
  }

  for (let idx = 0; idx < params.r; idx++) {
    const tier = params.r - 1 - idx;
    const rule = byTier.get(tier);
    const base = idx * 3;
    if (rule) {
      genes[base] = rule.minWaitlist;
      genes[base + 1] = rule.minCapacity;
      genes[base + 2] = rule.offersToExtend;
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
      // Box-Muller for normal sample
      const u1 = Math.random();
      const u2 = Math.random();
      const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      individual.genes[i] += z * sigma;
      // Clamp
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

// ─── Main GA Loop ───────────────────────────────────────────────────────────

/**
 * Run the full GA optimization.
 * @param params Model parameters
 * @param config Optimizer configuration
 * @param onGeneration Callback after each generation (for progress reporting)
 * @param shouldStop Function that returns true if optimization should abort
 * @returns The best policy found
 */
export function runOptimization(
  params: ModelParameters,
  config: OptimizerConfig,
  onGeneration?: (report: GenerationReport) => void,
  shouldStop?: () => boolean,
): Policy {
  const { populationSize, generations, simsPerEval, eliteFraction, mutationRate, mutationSigma } = config;
  const bounds = getGeneBounds(params);
  const eliteCount = Math.max(1, Math.floor(populationSize * eliteFraction));

  // Initialize
  let population = initPopulation(populationSize, bounds);

  // Evaluate initial population
  for (const ind of population) {
    ind.fitness = evaluateFitness(ind, params, simsPerEval);
  }

  let bestEver: Individual = { genes: new Float64Array(bounds.length), fitness: -Infinity };

  for (let gen = 0; gen < generations; gen++) {
    if (shouldStop?.()) break;

    // Sort by fitness descending
    population.sort((a, b) => b.fitness - a.fitness);

    // Track best
    if (population[0].fitness > bestEver.fitness) {
      bestEver = { genes: population[0].genes.slice(), fitness: population[0].fitness };
    }

    // Report
    const avgFitness = population.reduce((s, ind) => s + ind.fitness, 0) / populationSize;
    onGeneration?.({
      generation: gen,
      bestFitness: population[0].fitness,
      avgFitness,
      bestGenes: population[0].genes.slice(),
    });

    // Selection + reproduction
    const elites = population.slice(0, eliteCount);
    const newPop: Individual[] = [...elites.map(e => ({ genes: e.genes.slice(), fitness: e.fitness }))];

    // Fill remaining with crossover + mutation
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

  // Final sort
  population.sort((a, b) => b.fitness - a.fitness);
  if (population[0].fitness > bestEver.fitness) {
    bestEver = population[0];
  }

  return decodeGenome(bestEver.genes, params);
}

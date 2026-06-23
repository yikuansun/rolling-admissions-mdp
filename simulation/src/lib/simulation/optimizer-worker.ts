/**
 * Web Worker for running the genetic algorithm optimizer in a background thread.
 *
 * Uses an async generation loop (yielding via setTimeout between generations)
 * so that incoming 'stop' messages can be processed mid-run.
 *
 * Messages IN:
 *   { type: 'start', params: SerializedModelParameters, config: OptimizerConfig }
 *   { type: 'stop' }
 *
 * Messages OUT:
 *   { type: 'progress', generation, bestFitness, avgFitness, bestGenes }
 *   { type: 'complete', bestPolicy: PolicyRule[] }
 *   { type: 'stopped' }
 */

import { deserializeParams } from './serialization';
import type { SerializedModelParameters } from './serialization';
import type { OptimizerConfig } from './optimizer';
import {
  initPopulation,
  getGeneBounds,
  evaluateFitness,
  tournamentSelect,
  crossover,
  mutate,
  type Individual,
} from './optimizer';
import type { ModelParameters } from './types';

let stopRequested = false;

self.onmessage = (e: MessageEvent) => {
  const msg = e.data;

  if (msg.type === 'stop') {
    stopRequested = true;
    return;
  }

  if (msg.type === 'start') {
    stopRequested = false;
    const params = deserializeParams(msg.params as SerializedModelParameters);
    const config = msg.config as OptimizerConfig;
    runGA(params, config);
  }
};

/**
 * Run the GA with async yielding between generations.
 */
function runGA(params: ModelParameters, config: OptimizerConfig) {
  const { populationSize, generations, simsPerEval, eliteFraction, mutationRate, mutationSigma,
    immigrationInterval, immigrationFraction } = config;
  const bounds = getGeneBounds(params);
  const eliteCount = Math.max(1, Math.floor(populationSize * eliteFraction));
  const immigrantCount = Math.max(1, Math.floor(populationSize * immigrationFraction));

  let population = initPopulation(populationSize, bounds);

  // Evaluate initial population
  for (const ind of population) {
    ind.fitness = evaluateFitness(ind, params, simsPerEval);
  }

  let bestEver: Individual = { genes: new Float64Array(bounds.length), fitness: -Infinity };
  let gen = 0;

  function runNextGeneration() {
    // Check stop
    if (stopRequested) {
      self.postMessage({ type: 'stopped' });
      return;
    }

    if (gen >= generations) {
      // Done — send final best genes for decoding on main thread
      self.postMessage({ type: 'complete', bestGenes: Array.from(bestEver.genes) });
      return;
    }

    // Sort by fitness descending
    population.sort((a, b) => b.fitness - a.fitness);

    // Track best
    if (population[0].fitness > bestEver.fitness) {
      bestEver = { genes: population[0].genes.slice(), fitness: population[0].fitness };
    }

    // Report progress
    const avgFitness = population.reduce((s, ind) => s + ind.fitness, 0) / populationSize;
    self.postMessage({
      type: 'progress',
      generation: gen,
      bestFitness: population[0].fitness,
      avgFitness,
      bestGenes: Array.from(population[0].genes),
    });

    // Immigration shock: replace bottom individuals with random immigrants
    if (immigrationInterval > 0 && gen > 0 && gen % immigrationInterval === 0) {
      const immigrants = initPopulation(immigrantCount, bounds);
      for (const imm of immigrants) {
        imm.fitness = evaluateFitness(imm, params, simsPerEval);
      }
      // Replace the worst individuals (population is already sorted descending)
      for (let i = 0; i < immigrantCount; i++) {
        population[populationSize - 1 - i] = immigrants[i];
      }
    }

    // Selection + reproduction
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
    gen++;

    // Yield to event loop so 'stop' messages can be processed
    setTimeout(runNextGeneration, 0);
  }

  // Kick off the first generation
  setTimeout(runNextGeneration, 0);
}

/**
 * Web Worker for running the genetic algorithm optimizer in a background thread.
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
import { runOptimization, decodeGenome, type GenerationReport } from './optimizer';
import type { PolicyRule } from './types';

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

    const onGeneration = (report: GenerationReport) => {
      self.postMessage({
        type: 'progress',
        generation: report.generation,
        bestFitness: report.bestFitness,
        avgFitness: report.avgFitness,
        bestGenes: Array.from(report.bestGenes),
      });
    };

    const shouldStop = () => stopRequested;

    const bestPolicy = runOptimization(params, config, onGeneration, shouldStop);

    if (stopRequested) {
      self.postMessage({ type: 'stopped' });
    } else {
      // Send back the best policy rules
      const rules: PolicyRule[] = bestPolicy.kind === 'rules' ? bestPolicy.rules : [];
      self.postMessage({ type: 'complete', bestPolicy: rules });
    }
  }
};

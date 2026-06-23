<script lang="ts">
  import type { ModelParameters, Policy, TierPeriodParams } from '$lib/simulation';
  import {
    DEFAULT_OPTIMIZER_CONFIG,
    decodeGenome,
  } from '$lib/simulation';
  import type { OptimizerConfig } from '$lib/simulation';
  import Chart from 'chart.js/auto';

  let { params, onApplyPolicy }: {
    params: ModelParameters;
    onApplyPolicy: (policy: Policy) => void;
  } = $props();

  // Config
  let config: OptimizerConfig = $state({ ...DEFAULT_OPTIMIZER_CONFIG });

  // State
  let running: boolean = $state(false);
  let currentGen: number = $state(0);
  let bestFitness: number = $state(0);
  let avgFitness: number = $state(0);
  let bestPolicyDecoded: Policy | null = $state(null);
  let fitnessHistory: { gen: number; best: number; avg: number }[] = $state([]);
  let worker: Worker | null = null;

  // Chart
  let chartCanvas: HTMLCanvasElement | undefined = $state(undefined);
  let chartInstance: Chart | null = null;

  function startOptimization() {
    if (running) return;
    running = true;
    currentGen = 0;
    bestFitness = 0;
    avgFitness = 0;
    bestPolicyDecoded = null;
    fitnessHistory = [];

    worker = new Worker(
      new URL('$lib/simulation/optimizer-worker.ts', import.meta.url),
      { type: 'module' }
    );

    worker.onmessage = (e: MessageEvent) => {
      const msg = e.data;

      if (msg.type === 'progress') {
        currentGen = msg.generation + 1;
        bestFitness = msg.bestFitness;
        avgFitness = msg.avgFitness;
        fitnessHistory = [...fitnessHistory, {
          gen: msg.generation,
          best: msg.bestFitness,
          avg: msg.avgFitness,
        }];

        // Decode current best for preview
        const genes = new Float64Array(msg.bestGenes);
        bestPolicyDecoded = decodeGenome(genes, params);
        updateChart();
      }

      if (msg.type === 'complete') {
        running = false;
        // Decode the final best from the worker's genes
        if (msg.bestGenes) {
          const genes = new Float64Array(msg.bestGenes);
          bestPolicyDecoded = decodeGenome(genes, params);
        }
        updateChart();
        worker?.terminate();
        worker = null;
      }

      if (msg.type === 'stopped') {
        running = false;
        worker?.terminate();
        worker = null;
      }
    };

    // Send start message — manually extract raw data to avoid Svelte proxy issues
    const { T, r, A, C, W, tauMax, phi, psi, lambda, pi, delta, theta, mu } = params;
    const serializedParams = {
      T, r, A, C, W, tauMax, phi, psi,
      lambda_data: new Float64Array(lambda.data),
      pi_data: new Float64Array(pi.data),
      delta_data: new Float64Array(delta.data),
      theta_data: new Float64Array(theta.data),
      mu_data: new Float64Array(mu.data),
    };
    const plainConfig = {
      populationSize: config.populationSize,
      generations: config.generations,
      simsPerEval: config.simsPerEval,
      eliteFraction: config.eliteFraction,
      mutationRate: config.mutationRate,
      mutationSigma: config.mutationSigma,
      immigrationInterval: config.immigrationInterval,
      immigrationFraction: config.immigrationFraction,
    };
    worker.postMessage({
      type: 'start',
      params: serializedParams,
      config: plainConfig,
    });
  }

  function stopOptimization() {
    if (worker) {
      worker.postMessage({ type: 'stop' });
    }
  }

  function applyBestPolicy() {
    if (!bestPolicyDecoded) return;
    onApplyPolicy(bestPolicyDecoded);
  }

  function updateChart() {
    if (!chartCanvas || fitnessHistory.length === 0) return;
    if (chartInstance) chartInstance.destroy();

    chartInstance = new Chart(chartCanvas, {
      type: 'line',
      data: {
        labels: fitnessHistory.map(h => `${h.gen + 1}`),
        datasets: [
          {
            label: 'Best Fitness',
            data: fitnessHistory.map(h => h.best),
            borderColor: '#3b82f6',
            fill: false,
            tension: 0.2,
            pointRadius: 0,
          },
          {
            label: 'Avg Fitness',
            data: fitnessHistory.map(h => h.avg),
            borderColor: '#9ca3af',
            fill: false,
            tension: 0.2,
            pointRadius: 0,
          },
        ],
      },
      options: {
        responsive: true,
        animation: false,
        plugins: { legend: { position: 'top' } },
        scales: {
          x: { title: { display: true, text: 'Generation' } },
          y: { title: { display: true, text: 'Objective (Z)' } },
        },
      },
    });
  }

  $effect(() => {
    return () => {
      if (worker) { worker.terminate(); worker = null; }
      if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
    };
  });
</script>

<div>
  <h2 class="text-lg font-semibold mb-2">Policy Optimizer (Genetic Algorithm)</h2>
  <p class="text-sm text-gray-600 mb-4">
    Evolves a per-period policy matrix ({params.r} tiers × {params.T} periods × 3 parameters = {params.r * params.T * 3} genes).
    Each candidate is evaluated via Monte Carlo simulation.
  </p>

  <!-- Configuration -->
  <details class="mb-4" open>
    <summary class="cursor-pointer text-sm font-medium text-gray-700 hover:text-gray-900">
      Configuration
    </summary>
    <div class="grid grid-cols-2 gap-3 mt-2 max-w-md">
      <span class="text-sm text-gray-600">Population Size</span>
      <input type="number" min="10" max="500" class="border rounded px-2 py-1 text-sm w-24"
        bind:value={config.populationSize} disabled={running} />

      <span class="text-sm text-gray-600">Generations</span>
      <input type="number" min="5" max="1000" class="border rounded px-2 py-1 text-sm w-24"
        bind:value={config.generations} disabled={running} />

      <span class="text-sm text-gray-600">Sims per Evaluation</span>
      <input type="number" min="10" max="500" class="border rounded px-2 py-1 text-sm w-24"
        bind:value={config.simsPerEval} disabled={running} />

      <span class="text-sm text-gray-600">Elite Fraction</span>
      <input type="number" min="0.05" max="0.5" step="0.05" class="border rounded px-2 py-1 text-sm w-24"
        bind:value={config.eliteFraction} disabled={running} />

      <span class="text-sm text-gray-600">Mutation Rate</span>
      <input type="number" min="0.05" max="1" step="0.05" class="border rounded px-2 py-1 text-sm w-24"
        bind:value={config.mutationRate} disabled={running} />

      <span class="text-sm text-gray-600">Mutation Strength (σ)</span>
      <input type="number" min="0.1" max="10" step="0.1" class="border rounded px-2 py-1 text-sm w-24"
        bind:value={config.mutationSigma} disabled={running} />

      <span class="text-sm text-gray-600">Immigration Interval</span>
      <input type="number" min="0" max="100" class="border rounded px-2 py-1 text-sm w-24"
        bind:value={config.immigrationInterval} disabled={running} />

      <span class="text-sm text-gray-600">Immigration Fraction</span>
      <input type="number" min="0.05" max="0.5" step="0.05" class="border rounded px-2 py-1 text-sm w-24"
        bind:value={config.immigrationFraction} disabled={running} />
    </div>
  </details>

  <!-- Controls -->
  <div class="flex gap-3 mb-4">
    <button
      class="bg-purple-600 text-white px-5 py-2 rounded font-medium hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
      onclick={startOptimization} disabled={running}
    >
      ▶ Start Optimization
    </button>
    <button
      class="bg-red-500 text-white px-5 py-2 rounded font-medium hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
      onclick={stopOptimization} disabled={!running}
    >
      ■ Stop
    </button>
  </div>

  <!-- Progress -->
  {#if running || fitnessHistory.length > 0}
    <div class="mb-4 p-3 bg-gray-50 border border-gray-200 rounded">
      <div class="flex justify-between text-sm mb-2">
        <span>Generation: <strong>{currentGen}</strong> / {config.generations}</span>
        <span>Best: <strong>{bestFitness.toFixed(3)}</strong></span>
        <span>Avg: <strong>{avgFitness.toFixed(3)}</strong></span>
      </div>
      <div class="w-full bg-gray-200 rounded-full h-2">
        <div class="bg-purple-500 h-2 rounded-full transition-all"
          style="width: {Math.round((currentGen / config.generations) * 100)}%"></div>
      </div>
      {#if running}
        <p class="text-xs text-gray-500 mt-1">
          Genome size: {params.r * params.T * 3} genes | ~{currentGen * config.populationSize * config.simsPerEval} sims completed
        </p>
      {/if}
    </div>
  {/if}

  <!-- Fitness chart -->
  {#if fitnessHistory.length > 0}
    <div class="max-w-2xl mb-6">
      <h3 class="text-sm font-medium text-gray-700 mb-2">Fitness Over Generations</h3>
      <canvas bind:this={chartCanvas}></canvas>
    </div>
  {/if}

  <!-- Best policy preview -->
  {#if bestPolicyDecoded && bestPolicyDecoded.kind === 'matrix'}
    <div class="p-4 bg-green-50 border border-green-200 rounded">
      <h3 class="text-sm font-semibold text-green-800 mb-2">Best Policy Found (Z = {bestFitness.toFixed(3)})</h3>
      <div class="text-xs text-green-900 mb-3 overflow-x-auto">
        <table class="border border-green-200 text-center">
          <thead>
            <tr class="bg-green-100">
              <th class="p-1 border-r border-green-200">Tier</th>
              <th class="p-1" colspan={params.T}>Offers to Extend per Period</th>
            </tr>
            <tr class="bg-green-50">
              <th class="p-1 border-r border-green-200"></th>
              {#each Array(params.T) as _, t}
                <th class="p-1 min-w-6">{t + 1}</th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each bestPolicyDecoded.tiers as tierParams, i}
              <tr class="border-t border-green-200">
                <td class="p-1 border-r border-green-200 font-medium">{i + 1}</td>
                {#each tierParams.offersToExtend as val}
                  <td class="p-1 {val > 0 ? 'bg-green-100 font-medium' : ''}">{val}</td>
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <button
        class="bg-green-600 text-white px-4 py-1.5 rounded text-sm font-medium hover:bg-green-700"
        onclick={applyBestPolicy}
      >
        Apply to Policy Tab
      </button>
    </div>
  {/if}
</div>

<script lang="ts">
  import { renderToString as renderLatex } from 'katex';
  import 'katex/dist/katex.min.css';
  import {
    createDefaultParams,
    createDefaultPolicy,
    runMonteCarloSimulations,
    exportToCSV,
    downloadCSV,
  } from '$lib/simulation';
  import type { ModelParameters, Policy, SimulationResult } from '$lib/simulation';
  import Chart from 'chart.js/auto';
  import { onMount } from 'svelte';

  // --- State ---
  let activeTab: 'params' | 'policy' | 'results' = $state('params');
  let params: ModelParameters = $state(createDefaultParams());
  let policy: Policy = $state(createDefaultPolicy(params.T, params.r));
  let numRuns: number = $state(100);
  let results: SimulationResult[] = $state([]);
  let running: boolean = $state(false);

  // Chart reference
  let chartCanvas: HTMLCanvasElement | undefined = $state(undefined);
  let chartInstance: Chart | null = null;

  // --- Helpers ---
  function latex(s: string): string {
    return renderLatex(s, { throwOnError: false });
  }

  // When T or r changes, rebuild policy and probability arrays
  function rebuildArrays() {
    // Rebuild p
    const newP = Array.from({ length: params.r }, (_, i) =>
      Array.from({ length: params.T }, (_, t) => params.p[i]?.[t] ?? 0.1)
    );
    params.p = newP;

    // Rebuild lambda
    const newLambda = Array.from({ length: params.r }, (_, i) =>
      Array.from({ length: params.T }, (_, t) => params.lambda[i]?.[t] ?? 0.05)
    );
    params.lambda = newLambda;

    // Rebuild theta
    const newTheta: number[][][] = Array.from({ length: params.r }, (_, i) =>
      Array.from({ length: params.T }, (_, t) =>
        Array.from({ length: params.W }, (_, w) => {
          if (params.theta[i]?.[t]?.[w] !== undefined) return params.theta[i][t][w];
          return w === 0 ? 0.7 - 0.1 * i : 0.3;
        })
      )
    );
    params.theta = newTheta;

    // Rebuild mu
    const newMu: number[][][] = Array.from({ length: params.r }, (_, i) =>
      Array.from({ length: params.T }, (_, t) =>
        Array.from({ length: params.W }, (_, w) => {
          if (params.mu[i]?.[t]?.[w] !== undefined) return params.mu[i][t][w];
          return w === 0 ? 0.3 + 0.1 * i : 0.1;
        })
      )
    );
    params.mu = newMu;

    // Rebuild policy
    const newPolicy = Array.from({ length: params.T }, (_, t) =>
      Array.from({ length: params.r }, (_, i) => policy[t]?.[i] ?? 0)
    );
    policy = newPolicy;
  }

  // --- Simulation ---
  function runSim() {
    running = true;
    // Use setTimeout to let the UI update before blocking
    setTimeout(() => {
      results = runMonteCarloSimulations(params, policy, numRuns);
      running = false;
      activeTab = 'results';
      // Render chart after results come in
      setTimeout(renderChart, 50);
    }, 20);
  }

  // --- Aggregated results ---
  function getAggregated() {
    if (results.length === 0) return null;
    const n = results.length;
    const avgValue = results.reduce((s, r) => s + r.totalValue, 0) / n;
    const avgSeats = results.reduce((s, r) => s + r.seatsRemaining, 0) / n;
    const avgMatriculated = results.reduce((s, r) => s + r.totalMatriculated, 0) / n;
    const avgByTier = Array.from({ length: params.r }, (_, i) =>
      results.reduce((s, r) => s + r.matriculatedByTier[i], 0) / n
    );
    return { avgValue, avgSeats, avgMatriculated, avgByTier };
  }

  // --- Chart ---
  function renderChart() {
    if (!chartCanvas || results.length === 0) return;

    // Compute average cumulative admits per period
    const T = params.T;
    const avgAdmits = new Array(T).fill(0);
    for (const res of results) {
      for (let t = 0; t < T; t++) {
        avgAdmits[t] += res.periods[t].stateAfter.m.reduce((a, b) => a + b, 0);
      }
    }
    for (let t = 0; t < T; t++) avgAdmits[t] /= results.length;

    if (chartInstance) chartInstance.destroy();

    chartInstance = new Chart(chartCanvas, {
      type: 'line',
      data: {
        labels: Array.from({ length: T }, (_, t) => `${t + 1}`),
        datasets: [
          {
            label: 'Avg. Cumulative Admits',
            data: avgAdmits,
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            fill: true,
            tension: 0.3,
          },
        ],
      },
      options: {
        responsive: true,
        plugins: { legend: { position: 'top' } },
        scales: {
          x: { title: { display: true, text: 'Period' } },
          y: { title: { display: true, text: 'Cumulative Admits' }, beginAtZero: true },
        },
      },
    });
  }

  function handleExport() {
    if (results.length === 0) return;
    // Export the first run (full detail)
    const csv = exportToCSV(results[0], params);
    downloadCSV(csv);
  }
</script>

<div class="max-w-5xl mx-auto p-6 font-sans">
  <h1 class="text-2xl font-bold mb-4">Rolling Admissions MDP — Monte Carlo Simulator</h1>

  <!-- Tab bar -->
  <div class="flex border-b border-gray-300 mb-6">
    <button
      class="px-4 py-2 -mb-px text-sm font-medium transition-colors {activeTab === 'params'
        ? 'border-b-2 border-blue-500 text-blue-600'
        : 'text-gray-500 hover:text-gray-700'}"
      onclick={() => (activeTab = 'params')}
    >
      Model Parameters
    </button>
    <button
      class="px-4 py-2 -mb-px text-sm font-medium transition-colors {activeTab === 'policy'
        ? 'border-b-2 border-blue-500 text-blue-600'
        : 'text-gray-500 hover:text-gray-700'}"
      onclick={() => (activeTab = 'policy')}
    >
      Policy
    </button>
    <button
      class="px-4 py-2 -mb-px text-sm font-medium transition-colors {activeTab === 'results'
        ? 'border-b-2 border-blue-500 text-blue-600'
        : 'text-gray-500 hover:text-gray-700'}"
      onclick={() => (activeTab = 'results')}
    >
      Simulation Results
    </button>
  </div>

  <!-- Model Parameters Tab -->
  {#if activeTab === 'params'}
    <div class="space-y-2">
      <table class="w-full text-sm border border-gray-200 rounded">
        <thead>
          <tr class="bg-gray-50">
            <th class="text-left p-3 font-medium w-1/2">Variable</th>
            <th class="text-left p-3 font-medium">Value</th>
          </tr>
        </thead>
        <tbody>
          <tr class="border-t border-gray-100">
            <td class="p-3"><strong>Time Horizon</strong> ({@html latex('T')})</td>
            <td class="p-3">
              <input
                type="number"
                min="1"
                max="100"
                class="border rounded px-2 py-1 w-24"
                bind:value={params.T}
                onchange={rebuildArrays}
              />
            </td>
          </tr>
          <tr class="border-t border-gray-100">
            <td class="p-3"><strong>Number of Tiers</strong> ({@html latex('r')})</td>
            <td class="p-3">
              <input
                type="number"
                min="1"
                max="20"
                class="border rounded px-2 py-1 w-24"
                bind:value={params.r}
                onchange={rebuildArrays}
              />
            </td>
          </tr>
          <tr class="border-t border-gray-100">
            <td class="p-3"><strong>School Capacity</strong> ({@html latex('C')})</td>
            <td class="p-3">
              <input
                type="number"
                min="1"
                class="border rounded px-2 py-1 w-24"
                bind:value={params.C}
              />
            </td>
          </tr>
          <tr class="border-t border-gray-100">
            <td class="p-3"><strong>Response Window</strong> ({@html latex('W')})</td>
            <td class="p-3">
              <input
                type="number"
                min="1"
                max="20"
                class="border rounded px-2 py-1 w-24"
                bind:value={params.W}
                onchange={rebuildArrays}
              />
            </td>
          </tr>
          <tr class="border-t border-gray-100">
            <td class="p-3"><strong>Monte Carlo Runs</strong> ({@html latex('N')})</td>
            <td class="p-3">
              <input
                type="number"
                min="1"
                max="10000"
                class="border rounded px-2 py-1 w-24"
                bind:value={numRuns}
              />
            </td>
          </tr>
        </tbody>
      </table>

      <details class="mt-4">
        <summary class="cursor-pointer text-sm text-blue-600 hover:underline">
          Advanced: Arrival Probabilities ({@html latex('p_i(t)')})
        </summary>
        <div class="overflow-x-auto mt-2">
          <table class="text-xs border border-gray-200">
            <thead>
              <tr class="bg-gray-50">
                <th class="p-2">Tier \ Period</th>
                {#each Array(params.T) as _, t}
                  <th class="p-2">{t + 1}</th>
                {/each}
              </tr>
            </thead>
            <tbody>
              {#each Array(params.r) as _, i}
                <tr class="border-t border-gray-100">
                  <td class="p-2 font-medium">Tier {i + 1}</td>
                  {#each Array(params.T) as _, t}
                    <td class="p-1">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max="1"
                        class="border rounded px-1 py-0.5 w-16 text-xs"
                        bind:value={params.p[i][t]}
                      />
                    </td>
                  {/each}
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </details>

      <details class="mt-4">
        <summary class="cursor-pointer text-sm text-blue-600 hover:underline">
          Advanced: Dropout Probabilities ({@html latex('\\lambda_i(t)')})
        </summary>
        <div class="overflow-x-auto mt-2">
          <table class="text-xs border border-gray-200">
            <thead>
              <tr class="bg-gray-50">
                <th class="p-2">Tier \ Period</th>
                {#each Array(params.T) as _, t}
                  <th class="p-2">{t + 1}</th>
                {/each}
              </tr>
            </thead>
            <tbody>
              {#each Array(params.r) as _, i}
                <tr class="border-t border-gray-100">
                  <td class="p-2 font-medium">Tier {i + 1}</td>
                  {#each Array(params.T) as _, t}
                    <td class="p-1">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max="1"
                        class="border rounded px-1 py-0.5 w-16 text-xs"
                        bind:value={params.lambda[i][t]}
                      />
                    </td>
                  {/each}
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  {/if}

  <!-- Policy Tab -->
  {#if activeTab === 'policy'}
    <div>
      <p class="text-sm text-gray-600 mb-3">
        Enter the number of offers to extend per tier at each period ({@html latex('k_{i,t}')}).
      </p>
      <div class="overflow-x-auto">
        <table class="text-sm border border-gray-200 w-full">
          <thead>
            <tr class="bg-gray-50">
              <th class="p-2 text-left">Period</th>
              {#each Array(params.r) as _, i}
                <th class="p-2 text-center">Tier {i + 1}</th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each Array(params.T) as _, t}
              <tr class="border-t border-gray-100">
                <td class="p-2 font-medium">{t + 1}</td>
                {#each Array(params.r) as _, i}
                  <td class="p-1 text-center">
                    <input
                      type="number"
                      min="0"
                      class="border rounded px-2 py-1 w-16 text-center"
                      bind:value={policy[t][i]}
                    />
                  </td>
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <div class="mt-6">
        <button
          class="bg-blue-600 text-white px-6 py-2 rounded font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          onclick={runSim}
          disabled={running}
        >
          {running ? 'Running...' : 'Run Simulation'}
        </button>
      </div>
    </div>
  {/if}

  <!-- Results Tab -->
  {#if activeTab === 'results'}
    {#if results.length === 0}
      <p class="text-gray-500">No results yet. Configure a policy and run the simulation.</p>
    {:else}
      {@const agg = getAggregated()}
      {#if agg}
        <h2 class="text-lg font-semibold mb-3">Summary (averaged over {results.length} runs)</h2>
        <table class="text-sm border border-gray-200 mb-6 w-full max-w-md">
          <tbody>
            <tr class="border-t border-gray-100">
              <td class="p-3 font-medium">Avg. Total Value</td>
              <td class="p-3">{agg.avgValue.toFixed(3)}</td>
            </tr>
            <tr class="border-t border-gray-100">
              <td class="p-3 font-medium">Avg. Seats Remaining</td>
              <td class="p-3">{agg.avgSeats.toFixed(2)}</td>
            </tr>
            <tr class="border-t border-gray-100">
              <td class="p-3 font-medium">Avg. Total Matriculated</td>
              <td class="p-3">{agg.avgMatriculated.toFixed(2)}</td>
            </tr>
            {#each agg.avgByTier as val, i}
              <tr class="border-t border-gray-100">
                <td class="p-3 font-medium">Avg. Tier {i + 1} Matriculated</td>
                <td class="p-3">{val.toFixed(2)}</td>
              </tr>
            {/each}
          </tbody>
        </table>

        <h2 class="text-lg font-semibold mb-3">Cumulative Admits Over Time</h2>
        <div class="max-w-2xl mb-6">
          <canvas bind:this={chartCanvas}></canvas>
        </div>

        <button
          class="bg-green-600 text-white px-4 py-2 rounded font-medium hover:bg-green-700"
          onclick={handleExport}
        >
          Export Spreadsheet (CSV)
        </button>
        <p class="text-xs text-gray-400 mt-1">Exports the first simulation run with full period-by-period detail.</p>
      {/if}
    {/if}
  {/if}
</div>

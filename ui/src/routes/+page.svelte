<script lang="ts">
  import {
    createDefaultParams,
    createDefaultRulePolicy,
    runMonteCarloSimulations,
  } from '$lib/simulation';
  import type { ModelParameters, Policy, SimulationResult } from '$lib/simulation';
  import ModelParametersTab from './ModelParametersTab.svelte';
  import PolicyTab from './PolicyTab.svelte';
  import ResultsTab from './ResultsTab.svelte';

  // --- State ---
  let activeTab: 'params' | 'policy' | 'results' = $state('params');
  let params: ModelParameters = $state(createDefaultParams());
  let policy: Policy = $state(createDefaultRulePolicy(params.r));
  let numRuns: number = $state(100);
  let results: SimulationResult[] = $state([]);
  let running: boolean = $state(false);
  let resultsTab: ResultsTab | undefined = $state(undefined);

  // When T, r, or W changes, rebuild dependent arrays
  function rebuildArrays() {
    params.p = Array.from({ length: params.r }, (_, i) =>
      Array.from({ length: params.T }, (_, t) => params.p[i]?.[t] ?? 0.1)
    );
    params.lambda = Array.from({ length: params.r }, (_, i) =>
      Array.from({ length: params.T }, (_, t) => params.lambda[i]?.[t] ?? 0.05)
    );
    params.theta = Array.from({ length: params.r }, (_, i) =>
      Array.from({ length: params.T }, (_, t) =>
        Array.from({ length: params.W }, (_, w) =>
          params.theta[i]?.[t]?.[w] ?? (w === 0 ? 0.7 - 0.1 * i : 0.3)
        )
      )
    );
    params.mu = Array.from({ length: params.r }, (_, i) =>
      Array.from({ length: params.T }, (_, t) =>
        Array.from({ length: params.W }, (_, w) =>
          params.mu[i]?.[t]?.[w] ?? (w === 0 ? 0.3 + 0.1 * i : 0.1)
        )
      )
    );

    // Rebuild rule policy: filter out rules referencing tiers that no longer exist
    if (policy.kind === 'rules') {
      policy.rules = policy.rules.filter(r => r.tier < params.r);
    }
  }

  function runSim() {
    running = true;
    setTimeout(() => {
      results = runMonteCarloSimulations(params, policy, numRuns);
      running = false;
      activeTab = 'results';
      setTimeout(() => resultsTab?.renderChart(), 50);
    }, 20);
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

  <!-- Tab content -->
  {#if activeTab === 'params'}
    <ModelParametersTab bind:params bind:numRuns onRebuild={rebuildArrays} />
  {:else if activeTab === 'policy'}
    <PolicyTab {params} bind:policy {running} onRun={runSim} />
  {:else}
    <ResultsTab bind:this={resultsTab} {params} {results} />
  {/if}
</div>

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

<div class="max-w-6xl mx-auto p-6 font-sans">
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
    <ModelParametersTab bind:params bind:numRuns />
  {:else if activeTab === 'policy'}
    <PolicyTab {params} bind:policy {running} onRun={runSim} />
  {:else}
    <ResultsTab bind:this={resultsTab} {params} {results} />
  {/if}
</div>

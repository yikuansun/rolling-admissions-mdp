<script lang="ts">
  import type { ModelParameters, Policy, SimulationResult } from '$lib/simulation';
  import {
    runHistoricalSimulation,
    parseHistoricalCSV,
    generateHistoricalTemplate,
    downloadFile,
    promptFileUpload,
  } from '$lib/simulation';
  import type { HistoricalCycle } from '$lib/simulation';

  let { params, policy }: {
    params: ModelParameters;
    policy: Policy;
  } = $props();

  let cycle: HistoricalCycle | null = $state(null);
  let result: SimulationResult | null = $state(null);
  let error: string = $state('');
  let eventCount: number = $state(0);

  function downloadTemplate() {
    const csv = generateHistoricalTemplate();
    downloadFile(csv, 'historical_events_template.csv');
  }

  async function importHistoricalData() {
    error = '';
    result = null;
    const text = await promptFileUpload('.csv');
    if (!text) return;

    const parsed = parseHistoricalCSV(text);
    if (!parsed) {
      error = 'Failed to parse CSV. Check the format (columns: Period, Type, Tier, Attribute, Tenure, WindowRemaining).';
      return;
    }

    if (parsed.T > params.T) {
      error = `Historical data spans ${parsed.T} periods but model T = ${params.T}. Increase T in Model Parameters or trim the data.`;
      return;
    }

    cycle = parsed;
    eventCount = parsed.events.length;
  }

  function runReplay() {
    if (!cycle) return;
    error = '';
    try {
      result = runHistoricalSimulation(params, policy, cycle);
    } catch (e: any) {
      error = `Simulation error: ${e.message ?? e}`;
    }
  }
</script>

<div>
  <h2 class="text-lg font-semibold mb-2">Historical Simulation (Counterfactual Replay)</h2>
  <p class="text-sm text-gray-600 mb-4">
    Upload historical admissions data and replay it through your current policy.
    Arrivals and responses from the record are applied deterministically; counterfactual
    branches (students offered under your policy who weren't in history) use probabilistic sampling.
  </p>

  {#if error}
    <div class="p-3 mb-4 bg-red-50 border border-red-200 rounded text-sm text-red-700">{error}</div>
  {/if}

  <!-- Data import -->
  <div class="flex gap-2 mb-4">
    <button class="text-sm bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded px-3 py-1.5"
      onclick={downloadTemplate}>⬇ Download Template CSV</button>
    <button class="text-sm bg-blue-100 hover:bg-blue-200 border border-blue-300 text-blue-700 rounded px-3 py-1.5"
      onclick={importHistoricalData}>⬆ Import Historical Data</button>
  </div>

  {#if cycle}
    <div class="p-3 mb-4 bg-gray-50 border border-gray-200 rounded text-sm">
      <strong>Data loaded:</strong> {eventCount} events across {cycle.T} periods.
      <span class="text-gray-500 ml-2">
        ({cycle.events.filter(e => e.type === 'arrival').length} arrivals,
        {cycle.events.filter(e => e.type === 'accept').length} accepts,
        {cycle.events.filter(e => e.type === 'reject').length} rejects,
        {cycle.events.filter(e => e.type === 'dropout').length} dropouts,
        {cycle.events.filter(e => e.type === 'extension_request').length} ext. requests)
      </span>
    </div>

    <button
      class="bg-blue-600 text-white px-5 py-2 rounded font-medium hover:bg-blue-700 mb-6"
      onclick={runReplay}
    >
      Run Historical Replay
    </button>
  {/if}

  <!-- Results -->
  {#if result}
    <h3 class="text-md font-semibold mb-2">Counterfactual Results</h3>
    <table class="text-sm border border-gray-200 w-full max-w-lg mb-4">
      <tbody>
        <tr class="border-t border-gray-100">
          <td class="p-3 font-medium">Objective (Z)</td>
          <td class="p-3">{result.totalValue.toFixed(3)}</td>
        </tr>
        <tr class="border-t border-gray-100">
          <td class="p-3 font-medium">Quality Component</td>
          <td class="p-3">{result.qualityValue.toFixed(3)}</td>
        </tr>
        <tr class="border-t border-gray-100">
          <td class="p-3 font-medium">Diversity Penalty (HHI)</td>
          <td class="p-3">{result.diversityPenalty.toFixed(3)}</td>
        </tr>
        <tr class="border-t border-gray-100">
          <td class="p-3 font-medium">Overbooking Penalty</td>
          <td class="p-3">{result.overbookingPenalty.toFixed(3)}</td>
        </tr>
        <tr class="border-t border-gray-100">
          <td class="p-3 font-medium">Total Matriculated</td>
          <td class="p-3">{result.totalMatriculated}</td>
        </tr>
        <tr class="border-t border-gray-100">
          <td class="p-3 font-medium">Seats Remaining</td>
          <td class="p-3">{result.seatsRemaining}</td>
        </tr>
        <tr class="border-t border-gray-100">
          <td class="p-3 font-medium">Extensions Granted</td>
          <td class="p-3">{result.totalExtensionsGranted}</td>
        </tr>
        {#each result.matriculatedByTier as val, i}
          <tr class="border-t border-gray-100">
            <td class="p-3 font-medium">Tier {i + 1} Matriculated</td>
            <td class="p-3">{val}</td>
          </tr>
        {/each}
        {#each result.matriculatedByAttribute as val, a}
          <tr class="border-t border-gray-100">
            <td class="p-3 font-medium">Attr {a + 1} Matriculated</td>
            <td class="p-3">{val}</td>
          </tr>
        {/each}
      </tbody>
    </table>

    <p class="text-xs text-gray-500">
      Note: Results reflect what <em>would have happened</em> under your current policy
      given the historical arrivals and responses. Counterfactual branches use probabilistic sampling.
    </p>
  {/if}
</div>

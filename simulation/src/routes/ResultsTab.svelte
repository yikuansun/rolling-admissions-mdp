<script lang="ts">
  import type { ModelParameters, SimulationResult } from '$lib/simulation';
  import { exportToCSV, downloadCSV, IntTensor2D } from '$lib/simulation';
  import Chart from 'chart.js/auto';

  let { params, results }: {
    params: ModelParameters;
    results: SimulationResult[];
  } = $props();

  let chartCanvas: HTMLCanvasElement | undefined = $state(undefined);
  let chartInstance: Chart | null = null;

  function getAggregated() {
    if (results.length === 0) return null;
    const n = results.length;
    const avgValue = results.reduce((s, r) => s + r.totalValue, 0) / n;
    const avgQuality = results.reduce((s, r) => s + r.qualityValue, 0) / n;
    const avgDiversity = results.reduce((s, r) => s + r.diversityPenalty, 0) / n;
    const avgOverbooking = results.reduce((s, r) => s + r.overbookingPenalty, 0) / n;
    const avgSeats = results.reduce((s, r) => s + r.seatsRemaining, 0) / n;
    const avgMatriculated = results.reduce((s, r) => s + r.totalMatriculated, 0) / n;
    const avgByTier = Array.from({ length: params.r }, (_, i) =>
      results.reduce((s, r) => s + r.matriculatedByTier[i], 0) / n
    );
    const avgByAttr = Array.from({ length: params.A }, (_, a) =>
      results.reduce((s, r) => s + r.matriculatedByAttribute[a], 0) / n
    );
    return { avgValue, avgQuality, avgDiversity, avgOverbooking, avgSeats, avgMatriculated, avgByTier, avgByAttr };
  }

  export function renderChart() {
    if (!chartCanvas || results.length === 0) return;

    const T = params.T;
    const avgAdmits = new Array(T).fill(0);
    for (const res of results) {
      for (let t = 0; t < T; t++) {
        const M = new IntTensor2D(params.r, params.A, res.periods[t].M_after);
        avgAdmits[t] += M.sum();
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
    const csv = exportToCSV(results[0], params);
    downloadCSV(csv);
  }
</script>

{#if results.length === 0}
  <p class="text-gray-500">No results yet. Configure a policy and run the simulation.</p>
{:else}
  {@const agg = getAggregated()}
  {#if agg}
    <h2 class="text-lg font-semibold mb-3">Summary (averaged over {results.length} runs)</h2>
    <table class="text-sm border border-gray-200 mb-6 w-full max-w-lg">
      <tbody>
        <tr class="border-t border-gray-100">
          <td class="p-3 font-medium">Avg. Objective (Z)</td>
          <td class="p-3">{agg.avgValue.toFixed(3)}</td>
        </tr>
        <tr class="border-t border-gray-100">
          <td class="p-3 font-medium">Avg. Quality Component</td>
          <td class="p-3">{agg.avgQuality.toFixed(3)}</td>
        </tr>
        <tr class="border-t border-gray-100">
          <td class="p-3 font-medium">Avg. Diversity Penalty (HHI)</td>
          <td class="p-3">{agg.avgDiversity.toFixed(3)}</td>
        </tr>
        <tr class="border-t border-gray-100">
          <td class="p-3 font-medium">Avg. Overbooking Penalty</td>
          <td class="p-3">{agg.avgOverbooking.toFixed(3)}</td>
        </tr>
        <tr class="border-t border-gray-100">
          <td class="p-3 font-medium">Avg. Total Matriculated</td>
          <td class="p-3">{agg.avgMatriculated.toFixed(2)}</td>
        </tr>
        <tr class="border-t border-gray-100">
          <td class="p-3 font-medium">Avg. Seats Remaining</td>
          <td class="p-3">{agg.avgSeats.toFixed(2)}</td>
        </tr>
        {#each agg.avgByTier as val, i}
          <tr class="border-t border-gray-100">
            <td class="p-3 font-medium">Avg. Tier {i + 1} Matriculated</td>
            <td class="p-3">{val.toFixed(2)}</td>
          </tr>
        {/each}
        {#each agg.avgByAttr as val, a}
          <tr class="border-t border-gray-100">
            <td class="p-3 font-medium">Avg. Attr {a + 1} Matriculated</td>
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

<script lang="ts">
  import { renderToString as renderLatex } from 'katex';
  import 'katex/dist/katex.min.css';
  import type { ModelParameters, Policy } from '$lib/simulation';
  import { createDefaultMatrixPolicy, downloadFile, promptFileUpload } from '$lib/simulation';

  let { params, policy = $bindable(), running, onRun }: {
    params: ModelParameters;
    policy: Policy;
    running: boolean;
    onRun: () => void;
  } = $props();

  // Slice selector
  let selectedTier: number = $state(0);

  function latex(s: string): string {
    return renderLatex(s, { throwOnError: false });
  }

  function resetPolicy() {
    policy = createDefaultMatrixPolicy(params.r, params.T);
  }

  // CSV export for current tier
  function downloadTierCSV() {
    if (policy.kind !== 'matrix') return;
    const tierParams = policy.tiers[selectedTier];
    if (!tierParams) return;
    const rows = ['Period,Min Waitlist,Min Capacity,Offers to Extend'];
    for (let t = 0; t < params.T; t++) {
      rows.push(`${t + 1},${tierParams.minWaitlist[t]},${tierParams.minCapacity[t]},${tierParams.offersToExtend[t]}`);
    }
    downloadFile(rows.join('\n'), `policy_tier${selectedTier + 1}.csv`);
  }

  // CSV import for current tier
  async function importTierCSV() {
    if (policy.kind !== 'matrix') return;
    const text = await promptFileUpload('.csv');
    if (!text) return;
    const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return;

    const tierParams = policy.tiers[selectedTier];
    for (let i = 1; i < lines.length && i - 1 < params.T; i++) {
      const cells = lines[i].split(',').map(c => c.trim());
      const t = i - 1;
      if (cells.length >= 4) {
        tierParams.minWaitlist[t] = Math.max(0, parseInt(cells[1]) || 0);
        tierParams.minCapacity[t] = Math.max(0, parseInt(cells[2]) || 0);
        tierParams.offersToExtend[t] = Math.max(0, parseInt(cells[3]) || 0);
      }
    }
    // Trigger reactivity
    policy = { ...policy };
  }
</script>

<div>
  {#if policy.kind === 'matrix'}
    <div class="mb-4">
      <h2 class="text-lg font-semibold mb-2">Time-Dependent Policy Matrix</h2>
      <p class="text-sm text-gray-600 mb-4">
        For each tier and period, define the threshold conditions and number of offers.
        At each period {@html latex('t')}, if waitlist ≥ threshold AND remaining capacity ≥ threshold,
        extend the specified number of offers. Higher tiers are prioritized.
      </p>

      <!-- Tier selector -->
      <div class="flex items-center gap-3 mb-3">
        <label class="flex items-center gap-2 text-sm">
          <span class="text-gray-600 font-medium">Tier:</span>
          <select class="border rounded px-2 py-1" bind:value={selectedTier}>
            {#each Array(params.r) as _, i}
              <option value={i}>Tier {i + 1} (q = {((i + 1) / params.r).toFixed(2)})</option>
            {/each}
          </select>
        </label>

        <button class="text-xs bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded px-2 py-1"
          onclick={downloadTierCSV}>⬇ Download CSV</button>
        <button class="text-xs bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded px-2 py-1"
          onclick={importTierCSV}>⬆ Import CSV</button>
        <button class="text-xs bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 rounded px-2 py-1"
          onclick={resetPolicy}>Reset All</button>
      </div>

      <!-- Extension grant toggle -->
      <div class="flex items-center gap-2 mb-4">
        <label class="flex items-center gap-2 text-sm">
          <input type="checkbox" class="rounded" bind:checked={policy.autoGrantExtensions} />
          <span class="text-gray-700">Auto-grant all deadline extension requests</span>
        </label>
      </div>

      <!-- Per-period table -->
      <div class="overflow-x-auto">
        <table class="text-sm border border-gray-200 w-full">
          <thead>
            <tr class="bg-gray-50">
              <th class="p-2 text-left w-16">Period</th>
              <th class="p-2 text-center">Min Waitlist</th>
              <th class="p-2 text-center">Min Capacity</th>
              <th class="p-2 text-center">Offers to Extend</th>
            </tr>
          </thead>
          <tbody>
            {#each Array(params.T) as _, t}
              {@const tierParams = policy.tiers[selectedTier]}
              {#if tierParams}
                <tr class="border-t border-gray-100">
                  <td class="p-2 font-medium text-gray-600">{t + 1}</td>
                  <td class="p-1 text-center">
                    <input type="number" min="0" max="50"
                      class="border rounded px-2 py-1 w-16 text-center text-sm"
                      bind:value={tierParams.minWaitlist[t]} />
                  </td>
                  <td class="p-1 text-center">
                    <input type="number" min="0" max={params.C}
                      class="border rounded px-2 py-1 w-16 text-center text-sm"
                      bind:value={tierParams.minCapacity[t]} />
                  </td>
                  <td class="p-1 text-center">
                    <input type="number" min="0" max={params.C}
                      class="border rounded px-2 py-1 w-16 text-center text-sm"
                      bind:value={tierParams.offersToExtend[t]} />
                  </td>
                </tr>
              {/if}
            {/each}
          </tbody>
        </table>
      </div>
    </div>

    <div class="mt-2 p-3 bg-blue-50 border border-blue-200 rounded text-sm text-blue-800">
      <strong>How it works:</strong> Each period, the engine reads this tier's row for that period.
      If the current waitlist for the tier ≥ Min Waitlist AND remaining capacity ≥ Min Capacity,
      it extends up to "Offers to Extend" offers (from lowest tenure first). The policy is deterministic
      but fully time-dependent and state-responsive.
    </div>
  {/if}

  <div class="mt-6">
    <button
      class="bg-blue-600 text-white px-6 py-2 rounded font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
      onclick={onRun} disabled={running}
    >
      {running ? 'Running...' : 'Run Simulation'}
    </button>
  </div>
</div>

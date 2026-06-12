<script lang="ts">
  import { renderToString as renderLatex } from 'katex';
  import 'katex/dist/katex.min.css';
  import type { ModelParameters } from '$lib/simulation';
  import {
    matrixToCSV,
    parseMatrixCSV,
    downloadFile,
    promptFileUpload,
  } from '$lib/simulation';

  let { params = $bindable(), numRuns = $bindable(), onRebuild }: {
    params: ModelParameters;
    numRuns: number;
    onRebuild: () => void;
  } = $props();

  let importError: string = $state('');

  function latex(s: string): string {
    return renderLatex(s, { throwOnError: false });
  }

  // --- Arrival Probabilities CSV ---
  function downloadArrivalTemplate() {
    const csv = matrixToCSV(params.p, params.r, params.T);
    downloadFile(csv, 'arrival_probabilities.csv');
  }

  async function importArrivalCSV() {
    importError = '';
    const text = await promptFileUpload('.csv');
    if (!text) return;
    const result = parseMatrixCSV(text);
    if (!result) {
      importError = 'Failed to parse arrival probabilities CSV. Check the format.';
      return;
    }
    // Update params dimensions if CSV has different size
    if (result.r !== params.r || result.T !== params.T) {
      params.r = result.r;
      params.T = result.T;
      onRebuild();
    }
    params.p = result.matrix;
  }

  // --- Dropout Probabilities CSV ---
  function downloadDropoutTemplate() {
    const csv = matrixToCSV(params.lambda, params.r, params.T);
    downloadFile(csv, 'dropout_probabilities.csv');
  }

  async function importDropoutCSV() {
    importError = '';
    const text = await promptFileUpload('.csv');
    if (!text) return;
    const result = parseMatrixCSV(text);
    if (!result) {
      importError = 'Failed to parse dropout probabilities CSV. Check the format.';
      return;
    }
    if (result.r !== params.r || result.T !== params.T) {
      params.r = result.r;
      params.T = result.T;
      onRebuild();
    }
    params.lambda = result.matrix;
  }
</script>

<div class="space-y-2">
  {#if importError}
    <div class="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
      {importError}
    </div>
  {/if}

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
            onchange={onRebuild}
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
            onchange={onRebuild}
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
            onchange={onRebuild}
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

  <!-- Arrival Probabilities -->
  <details class="mt-4">
    <summary class="cursor-pointer text-sm text-blue-600 hover:underline">
      Advanced: Arrival Probabilities ({@html latex('p_i(t)')})
    </summary>
    <div class="mt-2">
      <div class="flex gap-2 mb-2">
        <button
          class="text-xs bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded px-2 py-1"
          onclick={downloadArrivalTemplate}
        >
          ⬇ Download CSV
        </button>
        <button
          class="text-xs bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded px-2 py-1"
          onclick={importArrivalCSV}
        >
          ⬆ Import CSV
        </button>
      </div>
      <div class="overflow-x-auto">
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
                    {#if params.p[i]}
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max="1"
                        class="border rounded px-1 py-0.5 w-16 text-xs"
                        bind:value={params.p[i][t]}
                      />
                    {/if}
                  </td>
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  </details>

  <!-- Dropout Probabilities -->
  <details class="mt-4">
    <summary class="cursor-pointer text-sm text-blue-600 hover:underline">
      Advanced: Dropout Probabilities ({@html latex('\\lambda_i(t)')})
    </summary>
    <div class="mt-2">
      <div class="flex gap-2 mb-2">
        <button
          class="text-xs bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded px-2 py-1"
          onclick={downloadDropoutTemplate}
        >
          ⬇ Download CSV
        </button>
        <button
          class="text-xs bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded px-2 py-1"
          onclick={importDropoutCSV}
        >
          ⬆ Import CSV
        </button>
      </div>
      <div class="overflow-x-auto">
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
                    {#if params.lambda[i]}
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max="1"
                        class="border rounded px-1 py-0.5 w-16 text-xs"
                        bind:value={params.lambda[i][t]}
                      />
                    {/if}
                  </td>
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  </details>
</div>

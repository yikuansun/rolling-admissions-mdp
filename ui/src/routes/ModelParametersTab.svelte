<script lang="ts">
  import { renderToString as renderLatex } from 'katex';
  import 'katex/dist/katex.min.css';
  import type { ModelParameters } from '$lib/simulation';

  let { params = $bindable(), numRuns = $bindable(), onRebuild }: {
    params: ModelParameters;
    numRuns: number;
    onRebuild: () => void;
  } = $props();

  function latex(s: string): string {
    return renderLatex(s, { throwOnError: false });
  }
</script>

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
  </details>
</div>

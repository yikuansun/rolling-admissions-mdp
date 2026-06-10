<script lang="ts">
  import { renderToString as renderLatex } from 'katex';
  import 'katex/dist/katex.min.css';
  import type { ModelParameters, Policy } from '$lib/simulation';

  let { params, policy = $bindable(), running, onRun }: {
    params: ModelParameters;
    policy: Policy;
    running: boolean;
    onRun: () => void;
  } = $props();

  function latex(s: string): string {
    return renderLatex(s, { throwOnError: false });
  }
</script>

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
      onclick={onRun}
      disabled={running}
    >
      {running ? 'Running...' : 'Run Simulation'}
    </button>
  </div>
</div>

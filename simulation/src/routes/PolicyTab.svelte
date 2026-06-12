<script lang="ts">
  import { renderToString as renderLatex } from 'katex';
  import 'katex/dist/katex.min.css';
  import type { ModelParameters, Policy, PolicyRule } from '$lib/simulation';
  import {
    createDefaultRulePolicy,
    generatePolicyRulesTemplate,
    parsePolicyRulesCSV,
    downloadFile,
    promptFileUpload,
  } from '$lib/simulation';

  let { params, policy = $bindable(), running, onRun }: {
    params: ModelParameters;
    policy: Policy;
    running: boolean;
    onRun: () => void;
  } = $props();

  let importError: string = $state('');

  function latex(s: string): string {
    return renderLatex(s, { throwOnError: false });
  }

  function addRule() {
    if (policy.kind !== 'rules') return;
    policy.rules = [...policy.rules, {
      tier: 0,
      minWaitlist: 1,
      minCapacity: 1,
      offersToExtend: 1,
    }];
  }

  function removeRule(index: number) {
    if (policy.kind !== 'rules') return;
    policy.rules = policy.rules.filter((_, i) => i !== index);
  }

  function moveRule(index: number, direction: -1 | 1) {
    if (policy.kind !== 'rules') return;
    const target = index + direction;
    if (target < 0 || target >= policy.rules.length) return;
    const newRules = [...policy.rules];
    [newRules[index], newRules[target]] = [newRules[target], newRules[index]];
    policy.rules = newRules;
  }

  // --- CSV Import/Export ---
  function downloadPolicyTemplate() {
    if (policy.kind !== 'rules') return;
    const csv = generatePolicyRulesTemplate(policy.rules);
    downloadFile(csv, 'policy_rules.csv');
  }

  async function importPolicyCSV() {
    importError = '';
    const text = await promptFileUpload('.csv');
    if (!text) return;
    const rules = parsePolicyRulesCSV(text);
    if (!rules) {
      importError = 'Failed to parse policy rules CSV. Check the format (columns: Priority, Tier, Min Waitlist, Min Capacity, Offers to Extend).';
      return;
    }
    // Validate tier indices against current params
    const invalid = rules.filter(r => r.tier >= params.r);
    if (invalid.length > 0) {
      importError = `Warning: ${invalid.length} rule(s) reference tiers beyond the current ${params.r} tiers and were removed.`;
      policy = { kind: 'rules', rules: rules.filter(r => r.tier < params.r) };
    } else {
      policy = { kind: 'rules', rules };
    }
  }
</script>

<div>
  {#if importError}
    <div class="p-3 mb-4 bg-red-50 border border-red-200 rounded text-sm text-red-700">
      {importError}
    </div>
  {/if}

  {#if policy.kind === 'rules'}
    <div class="mb-4">
      <h2 class="text-lg font-semibold mb-2">Threshold Rules</h2>
      <p class="text-sm text-gray-600 mb-4">
        Rules are evaluated <strong>in order</strong> for each tier. The first matching rule per tier determines
        the action ({@html latex('k_{i,t}')}). If no rule matches, no offers are extended.
      </p>

      <!-- CSV buttons -->
      <div class="flex gap-2 mb-4">
        <button
          class="text-xs bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded px-2 py-1"
          onclick={downloadPolicyTemplate}
        >
          ⬇ Download CSV
        </button>
        <button
          class="text-xs bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded px-2 py-1"
          onclick={importPolicyCSV}
        >
          ⬆ Import CSV
        </button>
      </div>

      <div class="space-y-2">
        {#each policy.rules as rule, idx}
          <div class="flex items-center gap-2 p-3 bg-gray-50 rounded border border-gray-200">
            <!-- Priority controls -->
            <div class="flex flex-col gap-0.5">
              <button
                class="text-xs text-gray-400 hover:text-gray-700 disabled:opacity-30"
                onclick={() => moveRule(idx, -1)}
                disabled={idx === 0}
                title="Move up (higher priority)"
              >▲</button>
              <button
                class="text-xs text-gray-400 hover:text-gray-700 disabled:opacity-30"
                onclick={() => moveRule(idx, 1)}
                disabled={idx === policy.rules.length - 1}
                title="Move down (lower priority)"
              >▼</button>
            </div>

            <!-- Rule number -->
            <span class="text-xs text-gray-400 w-5">{idx + 1}.</span>

            <!-- Rule content -->
            <div class="flex flex-wrap items-center gap-2 text-sm flex-1">
              <span>If</span>
              <label class="flex items-center gap-1">
                <span class="text-gray-600">Tier</span>
                <select
                  class="border rounded px-1.5 py-0.5 w-16"
                  bind:value={rule.tier}
                >
                  {#each Array(params.r) as _, i}
                    <option value={i}>{i + 1}</option>
                  {/each}
                </select>
              </label>
              <label class="flex items-center gap-1">
                <span class="text-gray-600">waitlist ≥</span>
                <input
                  type="number"
                  min="0"
                  class="border rounded px-1.5 py-0.5 w-14 text-center"
                  bind:value={rule.minWaitlist}
                />
              </label>
              <span class="text-gray-600">and</span>
              <label class="flex items-center gap-1">
                <span class="text-gray-600">capacity ≥</span>
                <input
                  type="number"
                  min="0"
                  class="border rounded px-1.5 py-0.5 w-14 text-center"
                  bind:value={rule.minCapacity}
                />
              </label>
              <span>→ offer</span>
              <input
                type="number"
                min="0"
                class="border rounded px-1.5 py-0.5 w-14 text-center"
                bind:value={rule.offersToExtend}
              />
              <span class="text-gray-600">slots</span>
            </div>

            <!-- Remove button -->
            <button
              class="text-red-400 hover:text-red-600 text-lg px-1"
              onclick={() => removeRule(idx)}
              title="Remove rule"
            >×</button>
          </div>
        {/each}
      </div>

      <button
        class="mt-3 text-sm text-blue-600 hover:text-blue-800 font-medium"
        onclick={addRule}
      >
        + Add Rule
      </button>
    </div>

    <div class="mt-2 p-3 bg-blue-50 border border-blue-200 rounded text-sm text-blue-800">
      <strong>How it works:</strong> At each period, the engine checks rules top-to-bottom.
      For each tier, the first rule whose conditions are met fires. The policy is deterministic
      but responds to the stochastic state (waitlist size, remaining capacity).
    </div>
  {/if}

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

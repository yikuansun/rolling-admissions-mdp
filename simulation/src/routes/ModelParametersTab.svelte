<script lang="ts">
  import { renderToString as renderLatex } from 'katex';
  import 'katex/dist/katex.min.css';
  import type { ModelParameters } from '$lib/simulation';
  import { FloatTensor1D, FloatTensor3D, FloatTensor4D } from '$lib/simulation';

  let { params = $bindable(), numRuns = $bindable() }: {
    params: ModelParameters;
    numRuns: number;
  } = $props();

  // Slice selectors for multi-dim tables
  let piTier: number = $state(0);
  let deltaTier: number = $state(0);
  let deltaAttr: number = $state(0);
  let thetaTier: number = $state(0);
  let thetaAttr: number = $state(0);
  let muTier: number = $state(0);
  let muAttr: number = $state(0);

  // Force reactivity on tensor edits
  let tick: number = $state(0);

  function latex(s: string): string {
    return renderLatex(s, { throwOnError: false });
  }

  function rebuildTensors() {
    const { T, r, A, W, tauMax } = params;

    // Rebuild lambda
    const newLambda = new FloatTensor1D(T);
    for (let t = 0; t < T; t++) newLambda.set(t, t < params.lambda.d0 ? params.lambda.get(t) : 2.0);
    params.lambda = newLambda;

    // Rebuild pi
    const newPi = new FloatTensor3D(r, A, T);
    const uniformP = 1 / (r * A);
    for (let i = 0; i < r; i++)
      for (let a = 0; a < A; a++)
        for (let t = 0; t < T; t++)
          newPi.set(i, a, t, (i < params.pi.d0 && a < params.pi.d1 && t < params.pi.d2) ? params.pi.get(i, a, t) : uniformP);
    params.pi = newPi;

    // Rebuild delta
    const newDelta = new FloatTensor4D(r, A, T, tauMax);
    for (let i = 0; i < r; i++)
      for (let a = 0; a < A; a++)
        for (let t = 0; t < T; t++)
          for (let tau = 0; tau < tauMax; tau++)
            newDelta.set(i, a, t, tau, (i < params.delta.d0 && a < params.delta.d1 && t < params.delta.d2 && tau < params.delta.d3) ? params.delta.get(i, a, t, tau) : 0.05 + 0.02 * tau);
    params.delta = newDelta;

    // Rebuild theta
    const newTheta = new FloatTensor4D(r, A, T, W);
    for (let i = 0; i < r; i++)
      for (let a = 0; a < A; a++)
        for (let t = 0; t < T; t++)
          for (let w = 0; w < W; w++)
            newTheta.set(i, a, t, w, (i < params.theta.d0 && a < params.theta.d1 && t < params.theta.d2 && w < params.theta.d3) ? params.theta.get(i, a, t, w) : (w === 0 ? 0.6 : 0.25));
    params.theta = newTheta;

    // Rebuild mu
    const newMu = new FloatTensor4D(r, A, T, W);
    for (let i = 0; i < r; i++)
      for (let a = 0; a < A; a++)
        for (let t = 0; t < T; t++)
          for (let w = 0; w < W; w++)
            newMu.set(i, a, t, w, (i < params.mu.d0 && a < params.mu.d1 && t < params.mu.d2 && w < params.mu.d3) ? params.mu.get(i, a, t, w) : (w === 0 ? 0.4 : 0.1));
    params.mu = newMu;

    // Clamp selectors
    piTier = Math.min(piTier, r - 1);
    deltaTier = Math.min(deltaTier, r - 1);
    deltaAttr = Math.min(deltaAttr, A - 1);
    thetaTier = Math.min(thetaTier, r - 1);
    thetaAttr = Math.min(thetaAttr, A - 1);
    muTier = Math.min(muTier, r - 1);
    muAttr = Math.min(muAttr, A - 1);

    tick++;
  }

  function setTensorValue(tensor: { data: Float64Array }, idx: number, val: number) {
    tensor.data[idx] = val;
    tick++;
  }
</script>

<div class="space-y-4">
  <!-- Scalar parameters -->
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
          <input type="number" min="1" max="200" class="border rounded px-2 py-1 w-24"
            bind:value={params.T} onchange={rebuildTensors} />
        </td>
      </tr>
      <tr class="border-t border-gray-100">
        <td class="p-3"><strong>Quality Tiers</strong> ({@html latex('r')})</td>
        <td class="p-3">
          <input type="number" min="1" max="20" class="border rounded px-2 py-1 w-24"
            bind:value={params.r} onchange={rebuildTensors} />
        </td>
      </tr>
      <tr class="border-t border-gray-100">
        <td class="p-3"><strong>Attribute Combinations</strong> ({@html latex('A')})</td>
        <td class="p-3">
          <input type="number" min="1" max="20" class="border rounded px-2 py-1 w-24"
            bind:value={params.A} onchange={rebuildTensors} />
        </td>
      </tr>
      <tr class="border-t border-gray-100">
        <td class="p-3"><strong>School Capacity</strong> ({@html latex('C')})</td>
        <td class="p-3">
          <input type="number" min="1" class="border rounded px-2 py-1 w-24"
            bind:value={params.C} />
        </td>
      </tr>
      <tr class="border-t border-gray-100">
        <td class="p-3"><strong>Response Window</strong> ({@html latex('W')})</td>
        <td class="p-3">
          <input type="number" min="1" max="20" class="border rounded px-2 py-1 w-24"
            bind:value={params.W} onchange={rebuildTensors} />
        </td>
      </tr>
      <tr class="border-t border-gray-100">
        <td class="p-3"><strong>Max Waitlist Tenure</strong> ({@html latex('\\tau_{\\max}')})</td>
        <td class="p-3">
          <input type="number" min="1" max="50" class="border rounded px-2 py-1 w-24"
            bind:value={params.tauMax} onchange={rebuildTensors} />
        </td>
      </tr>
      <tr class="border-t border-gray-100">
        <td class="p-3"><strong>Diversity Penalty</strong> ({@html latex('\\phi')})</td>
        <td class="p-3">
          <input type="number" step="0.1" min="0" class="border rounded px-2 py-1 w-24"
            bind:value={params.phi} />
        </td>
      </tr>
      <tr class="border-t border-gray-100">
        <td class="p-3"><strong>Overbooking Penalty</strong> ({@html latex('\\psi')})</td>
        <td class="p-3">
          <input type="number" step="0.1" min="0" class="border rounded px-2 py-1 w-24"
            bind:value={params.psi} />
        </td>
      </tr>
      <tr class="border-t border-gray-100">
        <td class="p-3"><strong>Monte Carlo Runs</strong></td>
        <td class="p-3">
          <input type="number" min="1" max="10000" class="border rounded px-2 py-1 w-24"
            bind:value={numRuns} />
        </td>
      </tr>
    </tbody>
  </table>

  <!-- Arrival Rate λ(t) -->
  <details class="mt-4">
    <summary class="cursor-pointer text-sm text-blue-600 hover:underline">
      Arrival Rate ({@html latex('\\lambda(t)')}) — Poisson mean per period
    </summary>
    <div class="overflow-x-auto mt-2">
      <table class="text-xs border border-gray-200">
        <thead>
          <tr class="bg-gray-50">
            {#each Array(params.T) as _, t}
              <th class="p-2">t={t + 1}</th>
            {/each}
          </tr>
        </thead>
        <tbody>
          <tr>
            {#each Array(params.T) as _, t}
              <td class="p-1">
                {#key tick}
                  <input type="number" step="0.1" min="0" class="border rounded px-1 py-0.5 w-14 text-xs"
                    value={params.lambda.get(t)}
                    onchange={(e) => setTensorValue(params.lambda, t, parseFloat(e.currentTarget.value) || 0)} />
                {/key}
              </td>
            {/each}
          </tr>
        </tbody>
      </table>
    </div>
  </details>

  <!-- Arrival Distribution π(i, a, t) — slice by tier -->
  <details class="mt-4">
    <summary class="cursor-pointer text-sm text-blue-600 hover:underline">
      Arrival Distribution ({@html latex('\\pi_{i,a}(t)')}) — per-bucket probabilities
    </summary>
    <div class="mt-2">
      <div class="flex items-center gap-2 mb-2 text-sm">
        <span class="text-gray-600">Tier:</span>
        <select class="border rounded px-1.5 py-0.5" bind:value={piTier}>
          {#each Array(params.r) as _, i}
            <option value={i}>{i + 1}</option>
          {/each}
        </select>
      </div>
      <div class="overflow-x-auto">
        <table class="text-xs border border-gray-200">
          <thead>
            <tr class="bg-gray-50">
              <th class="p-2">Attr \ Period</th>
              {#each Array(params.T) as _, t}
                <th class="p-2">{t + 1}</th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each Array(params.A) as _, a}
              <tr class="border-t border-gray-100">
                <td class="p-2 font-medium">Attr {a + 1}</td>
                {#each Array(params.T) as _, t}
                  <td class="p-1">
                    {#key tick}
                      <input type="number" step="0.01" min="0" max="1" class="border rounded px-1 py-0.5 w-14 text-xs"
                        value={params.pi.get(piTier, a, t)}
                        onchange={(e) => { params.pi.set(piTier, a, t, parseFloat(e.currentTarget.value) || 0); tick++; }} />
                    {/key}
                  </td>
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  </details>

  <!-- Dropout δ(i, a, t, τ) — slice by tier + attribute, show τ × t grid -->
  <details class="mt-4">
    <summary class="cursor-pointer text-sm text-blue-600 hover:underline">
      Dropout Probability ({@html latex('\\delta_{i,a}(t, \\tau)')})
    </summary>
    <div class="mt-2">
      <div class="flex items-center gap-3 mb-2 text-sm">
        <label class="flex items-center gap-1">
          <span class="text-gray-600">Tier:</span>
          <select class="border rounded px-1.5 py-0.5" bind:value={deltaTier}>
            {#each Array(params.r) as _, i}
              <option value={i}>{i + 1}</option>
            {/each}
          </select>
        </label>
        <label class="flex items-center gap-1">
          <span class="text-gray-600">Attribute:</span>
          <select class="border rounded px-1.5 py-0.5" bind:value={deltaAttr}>
            {#each Array(params.A) as _, a}
              <option value={a}>{a + 1}</option>
            {/each}
          </select>
        </label>
      </div>
      <div class="overflow-x-auto">
        <table class="text-xs border border-gray-200">
          <thead>
            <tr class="bg-gray-50">
              <th class="p-2">τ \ Period</th>
              {#each Array(params.T) as _, t}
                <th class="p-2">{t + 1}</th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each Array(params.tauMax) as _, tau}
              <tr class="border-t border-gray-100">
                <td class="p-2 font-medium">τ={tau + 1}</td>
                {#each Array(params.T) as _, t}
                  <td class="p-1">
                    {#key tick}
                      <input type="number" step="0.01" min="0" max="1" class="border rounded px-1 py-0.5 w-14 text-xs"
                        value={params.delta.get(deltaTier, deltaAttr, t, tau)}
                        onchange={(e) => { params.delta.set(deltaTier, deltaAttr, t, tau, parseFloat(e.currentTarget.value) || 0); tick++; }} />
                    {/key}
                  </td>
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  </details>

  <!-- Accept θ(i, a, t, w) — slice by tier + attribute, show w × t grid -->
  <details class="mt-4">
    <summary class="cursor-pointer text-sm text-blue-600 hover:underline">
      Accept Probability ({@html latex('\\theta_{i,a}(t, w)')})
    </summary>
    <div class="mt-2">
      <div class="flex items-center gap-3 mb-2 text-sm">
        <label class="flex items-center gap-1">
          <span class="text-gray-600">Tier:</span>
          <select class="border rounded px-1.5 py-0.5" bind:value={thetaTier}>
            {#each Array(params.r) as _, i}
              <option value={i}>{i + 1}</option>
            {/each}
          </select>
        </label>
        <label class="flex items-center gap-1">
          <span class="text-gray-600">Attribute:</span>
          <select class="border rounded px-1.5 py-0.5" bind:value={thetaAttr}>
            {#each Array(params.A) as _, a}
              <option value={a}>{a + 1}</option>
            {/each}
          </select>
        </label>
      </div>
      <div class="overflow-x-auto">
        <table class="text-xs border border-gray-200">
          <thead>
            <tr class="bg-gray-50">
              <th class="p-2">w \ Period</th>
              {#each Array(params.T) as _, t}
                <th class="p-2">{t + 1}</th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each Array(params.W) as _, w}
              <tr class="border-t border-gray-100">
                <td class="p-2 font-medium">w={w + 1}</td>
                {#each Array(params.T) as _, t}
                  <td class="p-1">
                    {#key tick}
                      <input type="number" step="0.01" min="0" max="1" class="border rounded px-1 py-0.5 w-14 text-xs"
                        value={params.theta.get(thetaTier, thetaAttr, t, w)}
                        onchange={(e) => { params.theta.set(thetaTier, thetaAttr, t, w, parseFloat(e.currentTarget.value) || 0); tick++; }} />
                    {/key}
                  </td>
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  </details>

  <!-- Reject μ(i, a, t, w) — slice by tier + attribute -->
  <details class="mt-4">
    <summary class="cursor-pointer text-sm text-blue-600 hover:underline">
      Reject Probability ({@html latex('\\mu_{i,a}(t, w)')})
    </summary>
    <div class="mt-2">
      <div class="flex items-center gap-3 mb-2 text-sm">
        <label class="flex items-center gap-1">
          <span class="text-gray-600">Tier:</span>
          <select class="border rounded px-1.5 py-0.5" bind:value={muTier}>
            {#each Array(params.r) as _, i}
              <option value={i}>{i + 1}</option>
            {/each}
          </select>
        </label>
        <label class="flex items-center gap-1">
          <span class="text-gray-600">Attribute:</span>
          <select class="border rounded px-1.5 py-0.5" bind:value={muAttr}>
            {#each Array(params.A) as _, a}
              <option value={a}>{a + 1}</option>
            {/each}
          </select>
        </label>
      </div>
      <div class="overflow-x-auto">
        <table class="text-xs border border-gray-200">
          <thead>
            <tr class="bg-gray-50">
              <th class="p-2">w \ Period</th>
              {#each Array(params.T) as _, t}
                <th class="p-2">{t + 1}</th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each Array(params.W) as _, w}
              <tr class="border-t border-gray-100">
                <td class="p-2 font-medium">w={w + 1}</td>
                {#each Array(params.T) as _, t}
                  <td class="p-1">
                    {#key tick}
                      <input type="number" step="0.01" min="0" max="1" class="border rounded px-1 py-0.5 w-14 text-xs"
                        value={params.mu.get(muTier, muAttr, t, w)}
                        onchange={(e) => { params.mu.set(muTier, muAttr, t, w, parseFloat(e.currentTarget.value) || 0); tick++; }} />
                    {/key}
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

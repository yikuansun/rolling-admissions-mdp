<script lang="ts">
    import { renderToString as renderLatex } from 'katex';
    import "katex/dist/katex.min.css"

    let T: number = 10;
</script>

{#snippet latex(s: string)}
    {@html renderLatex(s)}
{/snippet}

<table>
  <thead>
    <tr>
      <th>Period ({@render latex("t")})</th>
      <th>Matriculated students ({@render latex("\\mathbf{m}_t")})</th>
      <th>Waitlist ({@render latex("\\mathbf{n}_t")})</th>
    </tr>
  </thead>
  <tbody>
    {#each Array(T) as _, t}
      <tr>
        <td>{t}</td>
        <td>{t}</td>
        <td>{t}</td>
      </tr>
    {/each}
  </tbody>
</table>

<style>
    table {
        border-collapse: collapse;
    }

    td, th {
        border: 1px solid #dddddd;
        text-align: left;
        padding: 8px;
    }
</style>
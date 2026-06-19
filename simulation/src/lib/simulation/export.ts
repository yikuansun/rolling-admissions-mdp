/**
 * Export simulation results to CSV spreadsheet format (v2).
 */

import type { SimulationResult, ModelParameters } from './types';
import { IntTensor2D, IntTensor3D } from './tensor';

/**
 * Generate CSV content from a simulation result.
 * Long format: one row per period with aggregated state info.
 */
export function exportToCSV(result: SimulationResult, params: ModelParameters): string {
  const { r, A, W, tauMax } = params;
  const headers: string[] = ['Period'];

  // Action summary: total offers per tier
  for (let i = 0; i < r; i++) headers.push(`Offers_Tier${i + 1}`);
  // Matriculated per tier
  for (let i = 0; i < r; i++) headers.push(`Matriculated_Tier${i + 1}`);
  // Waitlist per tier (summed over attrs and tenure)
  for (let i = 0; i < r; i++) headers.push(`Waitlist_Tier${i + 1}`);
  // Matriculated per attribute
  for (let a = 0; a < A; a++) headers.push(`Matriculated_Attr${a + 1}`);

  headers.push('TotalMatriculated', 'RemainingCapacity');

  const rows: string[] = [headers.join(',')];

  for (const record of result.periods) {
    const row: (string | number)[] = [record.period + 1];

    // Reconstruct tensors for after-state
    const M = new IntTensor2D(r, A, record.M_after);
    const N = new IntTensor3D(r, A, tauMax, record.N_after);
    const actionT = new IntTensor3D(r, A, tauMax, record.action);

    // Offers per tier
    for (let i = 0; i < r; i++) {
      let sum = 0;
      for (let a = 0; a < A; a++) {
        for (let tau = 0; tau < tauMax; tau++) sum += actionT.get(i, a, tau);
      }
      row.push(sum);
    }

    // Matriculated per tier
    for (let i = 0; i < r; i++) {
      let sum = 0;
      for (let a = 0; a < A; a++) sum += M.get(i, a);
      row.push(sum);
    }

    // Waitlist per tier
    for (let i = 0; i < r; i++) {
      let sum = 0;
      for (let a = 0; a < A; a++) {
        for (let tau = 0; tau < tauMax; tau++) sum += N.get(i, a, tau);
      }
      row.push(sum);
    }

    // Matriculated per attribute
    for (let a = 0; a < A; a++) {
      let sum = 0;
      for (let i = 0; i < r; i++) sum += M.get(i, a);
      row.push(sum);
    }

    const totalM = M.sum();
    row.push(totalM, params.C - totalM);

    rows.push(row.join(','));
  }

  return rows.join('\n');
}

/** Trigger a CSV file download in the browser. */
export function downloadCSV(csvContent: string, filename: string = 'simulation_results.csv'): void {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Export simulation results to CSV spreadsheet format.
 */

import type { SimulationResult, ModelParameters } from './types';

/**
 * Generate CSV content from a simulation result.
 * Columns: Period, Action (per tier), State m (per tier), State n (per tier), Outstanding offers (per tier, summed across w)
 */
export function exportToCSV(result: SimulationResult, params: ModelParameters): string {
  const { r } = params;
  const headers: string[] = ['Period'];

  for (let i = 0; i < r; i++) headers.push(`Action_Tier${i + 1}`);
  for (let i = 0; i < r; i++) headers.push(`Matriculated_Tier${i + 1}`);
  for (let i = 0; i < r; i++) headers.push(`Waitlist_Tier${i + 1}`);
  for (let i = 0; i < r; i++) headers.push(`OutstandingOffers_Tier${i + 1}`);
  headers.push('RemainingCapacity');

  const rows: string[] = [headers.join(',')];

  for (const record of result.periods) {
    const row: (string | number)[] = [record.period + 1]; // 1-indexed display

    for (let i = 0; i < r; i++) row.push(record.action[i]);
    for (let i = 0; i < r; i++) row.push(record.stateAfter.m[i]);
    for (let i = 0; i < r; i++) row.push(record.stateAfter.n[i]);
    for (let i = 0; i < r; i++) {
      const totalOffers = record.stateAfter.O[i].reduce((a, b) => a + b, 0);
      row.push(totalOffers);
    }

    const remaining = params.C - record.stateAfter.m.reduce((a, b) => a + b, 0);
    row.push(remaining);

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

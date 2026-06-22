/**
 * CSV import/export utilities for model parameters and policy (v3).
 */

import type { TierPeriodParams } from './types';

// --- Generic 2D matrix CSV ---

export function matrixToCSV(
  matrix: number[][],
  rowLabels: string[],
  colLabels: string[],
): string {
  const rows: string[] = [];
  rows.push(['', ...colLabels].join(','));
  for (let i = 0; i < matrix.length; i++) {
    rows.push([rowLabels[i] ?? `Row ${i + 1}`, ...matrix[i].map(v => `${v}`)].join(','));
  }
  return rows.join('\n');
}

export function parseMatrixCSV(csv: string): { matrix: number[][]; rows: number; cols: number } | null {
  const lines = csv.trim().split(/\r?\n/).filter(line => line.trim() !== '');
  if (lines.length < 2) return null;

  const headerCells = parseCsvLine(lines[0]);
  const cols = headerCells.length - 1;
  if (cols < 1) return null;

  const matrix: number[][] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    const values: number[] = [];
    for (let j = 1; j <= cols; j++) {
      const val = parseFloat(cells[j] ?? '0');
      values.push(isNaN(val) ? 0 : val);
    }
    matrix.push(values);
  }

  return { matrix, rows: matrix.length, cols };
}

// --- Utilities ---

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

/** Trigger a file download in the browser. */
export function downloadFile(content: string, filename: string, mimeType: string = 'text/csv'): void {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8;` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/** Prompt the user to select a file and return its text content. */
export function promptFileUpload(accept: string = '.csv'): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) { resolve(null); return; }
      const text = await file.text();
      resolve(text);
    };
    input.click();
  });
}

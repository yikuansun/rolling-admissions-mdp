/**
 * CSV import/export utilities for model parameters and policy rules.
 *
 * Matrix CSVs (arrival probs, dropout probs) use format:
 *   Header row: Tier\Period, 1, 2, 3, ...
 *   Data rows:  Tier 1, 0.1, 0.1, 0.1, ...
 *
 * Policy rules CSV uses format:
 *   Header row: Priority, Tier, Min Waitlist, Min Capacity, Offers to Extend
 *   Data rows:  1, 3, 1, 1, 1
 */

import type { PolicyRule } from './types';

// --- Matrix CSV (for p and lambda) ---

/**
 * Generate a CSV template for a tier×period matrix.
 * @param r Number of tiers
 * @param T Number of periods
 * @param defaultValue Default cell value
 * @param label Label for the matrix (used in header comment)
 */
export function generateMatrixTemplate(r: number, T: number, defaultValue: number, label: string): string {
  const rows: string[] = [];

  // Header
  const header = ['Tier\\Period', ...Array.from({ length: T }, (_, t) => `${t + 1}`)];
  rows.push(header.join(','));

  // Data rows
  for (let i = 0; i < r; i++) {
    const row = [`Tier ${i + 1}`, ...Array.from({ length: T }, () => `${defaultValue}`)];
    rows.push(row.join(','));
  }

  return rows.join('\n');
}

/**
 * Generate a CSV from an existing tier×period matrix.
 */
export function matrixToCSV(matrix: number[][], r: number, T: number): string {
  const rows: string[] = [];

  const header = ['Tier\\Period', ...Array.from({ length: T }, (_, t) => `${t + 1}`)];
  rows.push(header.join(','));

  for (let i = 0; i < r; i++) {
    const values = Array.from({ length: T }, (_, t) => `${matrix[i]?.[t] ?? 0}`);
    rows.push([`Tier ${i + 1}`, ...values].join(','));
  }

  return rows.join('\n');
}

/**
 * Parse a CSV string into a tier×period matrix.
 * Returns null if parsing fails.
 */
export function parseMatrixCSV(csv: string): { matrix: number[][]; r: number; T: number } | null {
  const lines = csv.trim().split(/\r?\n/).filter(line => line.trim() !== '');
  if (lines.length < 2) return null;

  // Parse header to determine T
  const headerCells = parseCsvLine(lines[0]);
  const T = headerCells.length - 1; // first cell is label
  if (T < 1) return null;

  const matrix: number[][] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    // First cell is the row label, rest are values
    const values: number[] = [];
    for (let j = 1; j <= T; j++) {
      const val = parseFloat(cells[j] ?? '0');
      values.push(isNaN(val) ? 0 : val);
    }
    matrix.push(values);
  }

  return { matrix, r: matrix.length, T };
}

// --- Policy Rules CSV ---

/**
 * Generate a CSV template for policy rules.
 */
export function generatePolicyRulesTemplate(rules: PolicyRule[]): string {
  const rows: string[] = [];

  rows.push('Priority,Tier,Min Waitlist,Min Capacity,Offers to Extend');

  if (rules.length === 0) {
    // Provide a sample row
    rows.push('1,1,1,1,1');
  } else {
    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i];
      rows.push(`${i + 1},${rule.tier + 1},${rule.minWaitlist},${rule.minCapacity},${rule.offersToExtend}`);
    }
  }

  return rows.join('\n');
}

/**
 * Parse a CSV string into policy rules.
 * Returns null if parsing fails.
 */
export function parsePolicyRulesCSV(csv: string): PolicyRule[] | null {
  const lines = csv.trim().split(/\r?\n/).filter(line => line.trim() !== '');
  if (lines.length < 2) return null;

  const rules: PolicyRule[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    if (cells.length < 5) continue;

    const tier = parseInt(cells[1], 10) - 1; // Convert 1-indexed to 0-indexed
    const minWaitlist = parseInt(cells[2], 10);
    const minCapacity = parseInt(cells[3], 10);
    const offersToExtend = parseInt(cells[4], 10);

    if (isNaN(tier) || isNaN(minWaitlist) || isNaN(minCapacity) || isNaN(offersToExtend)) continue;
    if (tier < 0) continue;

    rules.push({ tier, minWaitlist, minCapacity, offersToExtend });
  }

  return rules.length > 0 ? rules : null;
}

// --- Utilities ---

/** Parse a single CSV line, handling quoted fields. */
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

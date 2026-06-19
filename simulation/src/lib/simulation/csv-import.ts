/**
 * CSV import/export utilities for model parameters and policy rules (v2).
 *
 * Matrix CSVs use format:
 *   Header row: Row\Col, 1, 2, 3, ...
 *   Data rows:  Label, val, val, val, ...
 *
 * Policy rules CSV uses format:
 *   Header: Priority, Tier, Attribute, Min Waitlist, Min Capacity, Offers to Extend
 */

import type { PolicyRule } from './types';

// --- Generic 2D matrix CSV ---

/**
 * Generate CSV from a 2D number array (rows × cols).
 */
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

/**
 * Parse a CSV string into a 2D number array.
 */
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

// --- Policy Rules CSV ---

/**
 * Generate a CSV for policy rules.
 */
export function generatePolicyRulesTemplate(rules: PolicyRule[]): string {
  const rows: string[] = [];
  rows.push('Priority,Tier,Attribute,Min Waitlist,Min Capacity,Offers to Extend');

  if (rules.length === 0) {
    rows.push('1,1,-1,1,1,1');
  } else {
    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i];
      // Display 1-indexed tier, keep attribute as-is (-1 = any)
      rows.push(`${i + 1},${rule.tier + 1},${rule.attribute === -1 ? 'Any' : rule.attribute + 1},${rule.minWaitlist},${rule.minCapacity},${rule.offersToExtend}`);
    }
  }

  return rows.join('\n');
}

/**
 * Parse policy rules from CSV.
 */
export function parsePolicyRulesCSV(csv: string): PolicyRule[] | null {
  const lines = csv.trim().split(/\r?\n/).filter(line => line.trim() !== '');
  if (lines.length < 2) return null;

  const rules: PolicyRule[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    if (cells.length < 6) continue;

    const tier = parseInt(cells[1], 10) - 1; // 1-indexed to 0-indexed
    const attrStr = cells[2].trim().toLowerCase();
    const attribute = (attrStr === 'any' || attrStr === '-1') ? -1 : parseInt(cells[2], 10) - 1;
    const minWaitlist = parseInt(cells[3], 10);
    const minCapacity = parseInt(cells[4], 10);
    const offersToExtend = parseInt(cells[5], 10);

    if (isNaN(tier) || isNaN(minWaitlist) || isNaN(minCapacity) || isNaN(offersToExtend)) continue;
    if (tier < 0) continue;

    rules.push({ tier, attribute, minWaitlist, minCapacity, offersToExtend });
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

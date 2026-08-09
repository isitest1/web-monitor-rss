import type { ExtractedSelectionValue } from '@web-monitor/shared';
import { sha256Hex } from '../lib/crypto.js';

function stableComparisonPayload(values: ExtractedSelectionValue[]): string {
  const sorted = [...values].sort((a, b) => a.selectionId.localeCompare(b.selectionId));
  return JSON.stringify(sorted.map((v) => [v.selectionId, v.comparisonValue]));
}

export async function computeResultHash(values: ExtractedSelectionValue[]): Promise<string> {
  return sha256Hex(stableComparisonPayload(values));
}

export async function computeChangeFingerprint(
  monitorId: string,
  previousHash: string | null,
  newHash: string,
): Promise<string> {
  return sha256Hex(`${monitorId}:${previousHash ?? 'baseline'}:${newHash}`);
}

export async function computeSystemFingerprint(
  kind: 'alert' | 'recovery',
  key: string,
  at: string,
): Promise<string> {
  return sha256Hex(`system:${kind}:${key}:${at}`);
}

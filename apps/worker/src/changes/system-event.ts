import { generateId } from '../lib/ids.js';
import { getSystemFeed } from '../db/repositories/feeds.js';
import { insertChange } from '../db/repositories/changes.js';
import { computeSystemFingerprint } from './fingerprint.js';

export interface SystemEventInput {
  changeType: 'SYSTEM_ALERT' | 'SYSTEM_RECOVERY';
  monitorId: string | null;
  sourceUrl: string | null;
  key: string;
  now: string;
  description: string;
}

/**
 * Creates a change row on the system feed for a heartbeat or per-monitor
 * fetch-failure event. Returns null (and creates nothing) if no feed of
 * kind='system' has been configured yet.
 */
export async function createSystemEvent(
  db: D1Database,
  input: SystemEventInput,
): Promise<string | null> {
  const systemFeed = await getSystemFeed(db);
  if (!systemFeed) return null;
  const fingerprint = await computeSystemFingerprint(
    input.changeType === 'SYSTEM_ALERT' ? 'alert' : 'recovery',
    input.key,
    input.now,
  );
  const change = await insertChange(db, {
    id: generateId(),
    feedId: systemFeed.id,
    monitorId: input.monitorId,
    detectedAt: input.now,
    changeType: input.changeType,
    oldValue: null,
    newValue: [
      {
        selectionId: 'system',
        label: '詳細',
        displayValue: input.description,
        comparisonValue: input.description,
      },
    ],
    changedSelectionIds: [],
    changeFingerprint: fingerprint,
    guid: `urn:web-monitor:system:${generateId()}`,
    sourceUrl: input.sourceUrl,
  });
  return change.id;
}

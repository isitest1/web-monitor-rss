import { generateId } from '../lib/ids.js';
import { insertChange } from '../db/repositories/changes.js';
import { getOrCreateSystemFeed } from '../rss/auto-feed.js';
import { computeSystemFingerprint } from './fingerprint.js';

export interface SystemEventInput {
  changeType: 'SYSTEM_ALERT' | 'SYSTEM_RECOVERY';
  monitorId: string | null;
  sourceUrl: string | null;
  key: string;
  now: string;
  description: string;
  /** Used only if the system feed does not exist yet and must be created. */
  origin: string;
}

/**
 * Creates a change row on the system feed for a heartbeat or per-monitor
 * fetch-failure event. The system feed self-bootstraps on first use (there
 * is no admin "create feed" step for it).
 */
export async function createSystemEvent(db: D1Database, input: SystemEventInput): Promise<string> {
  const systemFeed = await getOrCreateSystemFeed(db, input.origin, input.now);
  const fingerprint = await computeSystemFingerprint(
    input.changeType === 'SYSTEM_ALERT' ? 'alert' : 'recovery',
    input.key,
    input.now,
  );
  const changeId = generateId();
  const change = await insertChange(db, {
    id: changeId,
    feedId: systemFeed.id,
    monitorId: input.monitorId,
    detectedAt: input.now,
    changeType: input.changeType,
    oldValue: null,
    newValue: [
      {
        selectionId: 'system',
        label: 'Details',
        displayValue: input.description,
        comparisonValue: input.description,
      },
    ],
    changedSelectionIds: [],
    changeFingerprint: fingerprint,
    guid: `urn:web-monitor:system:${changeId}`,
    sourceUrl: input.sourceUrl,
  });
  return change.id;
}

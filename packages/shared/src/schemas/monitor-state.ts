import { z } from 'zod';
import { MONITOR_STATUSES } from '../status-codes.js';
import { MAX_IMAGES_PER_SELECTION } from './selection.js';

export const monitorStatusSchema = z.enum(MONITOR_STATUSES);

export const extractedSelectionValueSchema = z.object({
  selectionId: z.string(),
  label: z.string(),
  displayValue: z.union([z.string(), z.array(z.string())]),
  comparisonValue: z.union([z.string(), z.array(z.string())]),
  // Absolute URLs of <img> elements found within a 'text'-mode Selection's
  // range (§7.4) — display-only, never part of change comparison/hashing
  // (see computeResultHash), so images changing alone never triggers a
  // content change or notification.
  images: z.array(z.string()).max(MAX_IMAGES_PER_SELECTION).optional(),
});
export type ExtractedSelectionValue = z.infer<typeof extractedSelectionValueSchema>;

export const monitorStateSchema = z.object({
  monitorId: z.string(),
  status: monitorStatusSchema,
  currentValue: z.array(extractedSelectionValueSchema).nullable(),
  currentHash: z.string().nullable(),
  lastCheckedAt: z.string().nullable(),
  lastSuccessAt: z.string().nullable(),
  lastChangedAt: z.string().nullable(),
  consecutiveFailures: z.number().int().nonnegative(),
  lastErrorCode: z.string().nullable(),
  lastErrorMessage: z.string().nullable(),
  updatedAt: z.string(),
});
export type MonitorState = z.infer<typeof monitorStateSchema>;

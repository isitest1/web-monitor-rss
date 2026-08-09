import { z } from 'zod';
import { MONITOR_STATUSES } from '../status-codes.js';

export const monitorStatusSchema = z.enum(MONITOR_STATUSES);

export const extractedSelectionValueSchema = z.object({
  selectionId: z.string(),
  label: z.string(),
  displayValue: z.union([z.string(), z.array(z.string())]),
  comparisonValue: z.union([z.string(), z.array(z.string())]),
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

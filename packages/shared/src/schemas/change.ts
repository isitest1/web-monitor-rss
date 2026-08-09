import { z } from 'zod';
import { CHANGE_TYPES } from '../status-codes.js';
import { extractedSelectionValueSchema } from './monitor-state.js';

export const changeTypeSchema = z.enum(CHANGE_TYPES);

export const changeSchema = z.object({
  id: z.string(),
  feedId: z.string(),
  monitorId: z.string().nullable(),
  detectedAt: z.string(),
  changeType: changeTypeSchema,
  oldValue: z.array(extractedSelectionValueSchema).nullable(),
  newValue: z.array(extractedSelectionValueSchema).nullable(),
  changedSelectionIds: z.array(z.string()),
  changeFingerprint: z.string(),
  guid: z.string(),
  sourceUrl: z.string().nullable(),
  published: z.boolean(),
});
export type Change = z.infer<typeof changeSchema>;

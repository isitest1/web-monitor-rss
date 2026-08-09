import { z } from 'zod';
import { STATUS_CODES } from '../status-codes.js';

export const statusCodeSchema = z.enum(STATUS_CODES);

export const checkSchema = z.object({
  id: z.string(),
  monitorId: z.string(),
  runId: z.string(),
  startedAt: z.string(),
  finishedAt: z.string(),
  status: statusCodeSchema,
  durationMs: z.number().int().nonnegative(),
  httpStatus: z.number().int().nullable(),
  resultHash: z.string().nullable(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
});
export type Check = z.infer<typeof checkSchema>;

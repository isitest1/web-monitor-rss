import { z } from 'zod';
import { statusCodeSchema } from './check.js';
import { extractedSelectionValueSchema } from './monitor-state.js';
import { monitorWithSelectionsSchema } from './monitor.js';

export const loginRequestSchema = z.object({
  password: z.string().min(1).max(500),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const sessionResponseSchema = z.object({
  authenticated: z.boolean(),
  csrfToken: z.string().nullable(),
});
export type SessionResponse = z.infer<typeof sessionResponseSchema>;

export const runnerMonitorListResponseSchema = z.object({
  monitors: z.array(monitorWithSelectionsSchema),
});
export type RunnerMonitorListResponse = z.infer<typeof runnerMonitorListResponseSchema>;

export const runnerSelectionResultSchema = z.object({
  selectionId: z.string(),
  value: z.union([z.string(), z.array(z.string())]).nullable(),
});
export type RunnerSelectionResult = z.infer<typeof runnerSelectionResultSchema>;

const MAX_ERROR_MESSAGE_LENGTH = 2000;

export const runnerResultRequestSchema = z.object({
  monitorId: z.string().min(1),
  runId: z.string().min(1),
  startedAt: z.string(),
  finishedAt: z.string(),
  status: statusCodeSchema,
  durationMs: z.number().int().nonnegative(),
  httpStatus: z.number().int().nullable().default(null),
  errorCode: z.string().max(100).nullable().default(null),
  errorMessage: z.string().max(MAX_ERROR_MESSAGE_LENGTH).nullable().default(null),
  results: z.array(runnerSelectionResultSchema).default([]),
});
export type RunnerResultRequest = z.infer<typeof runnerResultRequestSchema>;

export const runnerResultResponseSchema = z.object({
  monitorId: z.string(),
  status: z.enum(['baselined', 'unchanged', 'changed', 'failed', 'duplicate']),
  changeId: z.string().nullable(),
});
export type RunnerResultResponse = z.infer<typeof runnerResultResponseSchema>;

export const heartbeatEventSchema = z.enum(['start', 'complete']);
export type HeartbeatEvent = z.infer<typeof heartbeatEventSchema>;

export const heartbeatRequestSchema = z.object({
  event: heartbeatEventSchema,
  runId: z.string().min(1),
  success: z.boolean().optional(),
  timestamp: z.string().optional(),
});
export type HeartbeatRequest = z.infer<typeof heartbeatRequestSchema>;

export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});
export type ErrorResponse = z.infer<typeof errorResponseSchema>;

export { extractedSelectionValueSchema };

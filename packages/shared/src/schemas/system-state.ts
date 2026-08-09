import { z } from 'zod';

export const alertStatusSchema = z.enum(['healthy', 'stale']);
export type AlertStatus = z.infer<typeof alertStatusSchema>;

export const systemStateSchema = z.object({
  id: z.number().int(),
  lastRunnerRunAt: z.string().nullable(),
  lastRunnerSuccessAt: z.string().nullable(),
  lastRunnerRunId: z.string().nullable(),
  heartbeatThresholdSec: z.number().int().positive(),
  alertStatus: alertStatusSchema,
  activeAlertChangeId: z.string().nullable(),
  lastWatchdogCheckedAt: z.string().nullable(),
  updatedAt: z.string(),
});
export type SystemState = z.infer<typeof systemStateSchema>;

export const healthResponseSchema = z.object({
  status: alertStatusSchema,
  lastRunnerSuccessAt: z.string().nullable(),
  lastRunnerRunAt: z.string().nullable(),
  heartbeatThresholdSec: z.number().int().positive(),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;

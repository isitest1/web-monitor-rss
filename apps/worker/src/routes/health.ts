import { Hono } from 'hono';
import type { HealthResponse } from '@web-monitor/shared';
import type { Env } from '../env.js';
import { getSystemState } from '../db/repositories/system-state.js';

export const healthRoutes = new Hono<{ Bindings: Env }>();

healthRoutes.get('/', async (c) => {
  const state = await getSystemState(c.env.DB);
  const response: HealthResponse = {
    status: state.alertStatus,
    lastRunnerSuccessAt: state.lastRunnerSuccessAt,
    lastRunnerRunAt: state.lastRunnerRunAt,
    heartbeatThresholdSec: state.heartbeatThresholdSec,
  };
  return c.json(response, state.alertStatus === 'healthy' ? 200 : 503);
});

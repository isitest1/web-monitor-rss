import { Hono } from 'hono';
import type { Env } from './env.js';
import { corsMiddleware } from './lib/cors.js';
import { authRoutes } from './routes/auth.js';
import { feedRoutes } from './routes/feeds.js';
import { monitorRoutes } from './routes/monitors.js';
import { runnerRoutes } from './routes/runner.js';
import { extensionRunnerRoutes } from './routes/extension-runner.js';
import { rssRoutes } from './routes/rss.js';
import { healthRoutes } from './routes/health.js';
import { adminRoutes } from './admin/routes.js';

export function createApp(): Hono<{ Bindings: Env }> {
  const app = new Hono<{ Bindings: Env }>();

  app.use('*', corsMiddleware);

  app.route('/api/auth', authRoutes);
  app.route('/api/feeds', feedRoutes);
  app.route('/api/monitors', monitorRoutes);
  app.route('/api/runner', runnerRoutes);
  app.route('/api/extension', extensionRunnerRoutes);
  app.route('/rss', rssRoutes);
  app.route('/health', healthRoutes);
  app.route('/', adminRoutes);

  return app;
}

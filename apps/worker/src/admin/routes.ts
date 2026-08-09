import { Hono } from 'hono';
import type { Env } from '../env.js';
import { getAdminSessionRow } from '../auth/admin-session.js';
import { loginPage } from './pages/login.js';

export const adminRoutes = new Hono<{ Bindings: Env }>();

adminRoutes.get('/', async (c) => {
  const session = await getAdminSessionRow(c);
  if (!session) return c.redirect('/login');
  return c.redirect('/monitors');
});

adminRoutes.get('/login', async (c) => {
  const session = await getAdminSessionRow(c);
  if (session) return c.redirect('/monitors');
  return c.html(loginPage());
});

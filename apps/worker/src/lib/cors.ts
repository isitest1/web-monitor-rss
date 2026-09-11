import type { Context, Next } from 'hono';
import type { Env } from '../env.js';

/**
 * Splits EXTENSION_ALLOWED_ORIGIN on commas so a single Worker can accept
 * more than one chrome-extension:// origin at once — the extension's
 * effective id differs by install method (a fixed id from the manifest's
 * "key" field when loaded unpacked, vs. an id Chrome itself assigns once
 * published to the Web Store, which strips "key" out of the package), and
 * a deployer may have installs of either or both talking to the same
 * backend. A single value with no comma still works exactly as before.
 */
function extensionOrigins(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

/**
 * Admin UI pages are served same-origin from this Worker, so admin API
 * calls need no CORS grant. The Chrome extension runs from a
 * chrome-extension:// origin and must be allowed explicitly; it never sends
 * cookies, only a Bearer token, so credentials stay unset for it.
 */
export async function corsMiddleware(
  c: Context<{ Bindings: Env }>,
  next: Next,
): Promise<Response | void> {
  const origin = c.req.header('origin');
  const allowed = [
    c.env.ADMIN_ALLOWED_ORIGIN,
    ...extensionOrigins(c.env.EXTENSION_ALLOWED_ORIGIN),
  ].filter(Boolean);

  if (origin && allowed.includes(origin)) {
    c.header('Access-Control-Allow-Origin', origin);
    c.header('Vary', 'Origin');
    if (origin === c.env.ADMIN_ALLOWED_ORIGIN) {
      c.header('Access-Control-Allow-Credentials', 'true');
    }
    c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-CSRF-Token');
    c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  }

  if (c.req.method === 'OPTIONS') {
    // Must return via c.body(), not a raw `new Response(...)`: headers set
    // through c.header() above are attached to Hono's own response
    // builder, and a manually constructed Response bypasses it entirely,
    // silently dropping every CORS header from the preflight reply.
    return c.body(null, 204);
  }

  await next();
}

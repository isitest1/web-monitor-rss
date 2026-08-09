import type { Context } from 'hono';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function errorJson(c: Context, status: number, code: string, message: string): Response {
  return c.json({ error: { code, message } }, status as never);
}

/**
 * Hono only narrows `c.req.param(name)` to a non-optional `string` when
 * routes are defined via chained `.get().post()` type inference; this
 * codebase defines routes as separate statements, so the compiler sees
 * `string | undefined`. The param is always present at runtime when the
 * route pattern matched, so this simply satisfies the type checker.
 */
export function requireParam(c: Context, name: string): string {
  const value = c.req.param(name);
  if (value === undefined) {
    throw new Error(`missing required route param: ${name}`);
  }
  return value;
}

/**
 * Best-effort, per-isolate in-memory rate limiter for login attempts. It
 * resets when the isolate recycles; that is acceptable here because it is a
 * defense-in-depth layer for a single-admin personal service, not the sole
 * protection against brute force (the login secret itself is a long random
 * value compared in constant time).
 */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

const attempts = new Map<string, { count: number; resetAt: number }>();

export function isRateLimited(key: string): boolean {
  const entry = attempts.get(key);
  const now = Date.now();
  if (!entry || entry.resetAt <= now) return false;
  return entry.count >= MAX_ATTEMPTS;
}

export function recordFailedAttempt(key: string): void {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  entry.count += 1;
}

export function resetAttempts(key: string): void {
  attempts.delete(key);
}

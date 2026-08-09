import type { StatusCode } from '@web-monitor/shared';
import { RunnerCheckError } from './errors.js';

/**
 * Maps a final HTTP response status to a StatusCode, or null if the
 * response should be treated as a success at the transport level (the
 * caller still separately validates selectors afterwards).
 */
export function classifyHttpStatus(status: number): StatusCode | null {
  if (status < 400) return null;
  if (status === 401) return 'LOGIN_REQUIRED';
  if (status === 403) return 'BLOCKED';
  if (status === 429) return 'RATE_LIMITED';
  return 'HTTP_ERROR';
}

/**
 * Maps an exception thrown during navigation/extraction to a StatusCode.
 * RunnerCheckError instances carry their own explicit code; everything else
 * is pattern-matched on the error message, falling back to the generic
 * ERROR code.
 */
export function classifyException(error: unknown): { statusCode: StatusCode; message: string } {
  if (error instanceof RunnerCheckError) {
    return { statusCode: error.statusCode, message: error.message };
  }
  const message = error instanceof Error ? error.message : String(error);
  if (/timeout/i.test(message)) {
    return { statusCode: 'TIMEOUT', message };
  }
  if (/net::ERR_CONNECTION_REFUSED|net::ERR_NAME_NOT_RESOLVED|net::ERR_/.test(message)) {
    return { statusCode: 'HTTP_ERROR', message };
  }
  return { statusCode: 'ERROR', message };
}

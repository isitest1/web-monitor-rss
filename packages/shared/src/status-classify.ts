import type { StatusCode } from './status-codes.js';

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

/** Anything carrying its own explicit StatusCode, e.g. RunnerCheckError (Runner) or SelectionExtractionError (selector-engine). */
interface StatusCoded {
  statusCode: StatusCode;
  message: string;
}

function isStatusCoded(error: unknown): error is StatusCoded {
  return (
    typeof error === 'object' &&
    error !== null &&
    'statusCode' in error &&
    'message' in error &&
    typeof (error as { statusCode: unknown }).statusCode === 'string'
  );
}

/**
 * Maps an exception thrown during navigation/extraction to a StatusCode.
 * Errors that already carry an explicit statusCode (StatusCoded) pass it
 * through unchanged; everything else is pattern-matched on the error
 * message (Chromium network error strings, shared by both Playwright and a
 * real Chrome tab), falling back to the generic ERROR code.
 */
export function classifyException(error: unknown): { statusCode: StatusCode; message: string } {
  if (isStatusCoded(error)) {
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

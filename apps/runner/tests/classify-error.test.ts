import { describe, expect, it } from 'vitest';
import { classifyException, classifyHttpStatus } from '../src/classify-error.js';
import { RunnerCheckError } from '../src/errors.js';

describe('classifyHttpStatus', () => {
  it('returns null for successful statuses', () => {
    expect(classifyHttpStatus(200)).toBeNull();
    expect(classifyHttpStatus(301)).toBeNull();
  });

  it('maps 401 to LOGIN_REQUIRED', () => {
    expect(classifyHttpStatus(401)).toBe('LOGIN_REQUIRED');
  });

  it('maps 403 to BLOCKED', () => {
    expect(classifyHttpStatus(403)).toBe('BLOCKED');
  });

  it('maps 429 to RATE_LIMITED', () => {
    expect(classifyHttpStatus(429)).toBe('RATE_LIMITED');
  });

  it('maps other 4xx/5xx to HTTP_ERROR', () => {
    expect(classifyHttpStatus(404)).toBe('HTTP_ERROR');
    expect(classifyHttpStatus(500)).toBe('HTTP_ERROR');
    expect(classifyHttpStatus(503)).toBe('HTTP_ERROR');
  });
});

describe('classifyException', () => {
  it('uses the explicit status code from a RunnerCheckError', () => {
    const result = classifyException(new RunnerCheckError('SELECTOR_NOT_FOUND', 'no match'));
    expect(result.statusCode).toBe('SELECTOR_NOT_FOUND');
    expect(result.message).toBe('no match');
  });

  it('classifies timeout messages as TIMEOUT', () => {
    const result = classifyException(new Error('page.goto: Timeout 45000ms exceeded'));
    expect(result.statusCode).toBe('TIMEOUT');
  });

  it('classifies connection-level network errors as HTTP_ERROR', () => {
    const result = classifyException(
      new Error('net::ERR_CONNECTION_REFUSED at https://example.com'),
    );
    expect(result.statusCode).toBe('HTTP_ERROR');
  });

  it('falls back to ERROR for unrecognized failures', () => {
    const result = classifyException(new Error('something unexpected happened'));
    expect(result.statusCode).toBe('ERROR');
  });

  it('stringifies non-Error throwables', () => {
    const result = classifyException('a plain string throw');
    expect(result.statusCode).toBe('ERROR');
    expect(result.message).toBe('a plain string throw');
  });
});

import type { StatusCode } from '@web-monitor/shared';

export class RunnerCheckError extends Error {
  readonly statusCode: StatusCode;

  constructor(statusCode: StatusCode, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.name = 'RunnerCheckError';
  }
}

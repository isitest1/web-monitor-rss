export const STATUS_CODES = [
  'SUCCESS',
  'HTTP_ERROR',
  'TIMEOUT',
  'BLOCKED',
  'RATE_LIMITED',
  'SELECTOR_NOT_FOUND',
  'SELECTOR_NOT_UNIQUE',
  'LOGIN_REQUIRED',
  'CONTENT_TOO_LARGE',
  'PARSER_ERROR',
  'ERROR',
] as const;

export type StatusCode = (typeof STATUS_CODES)[number];

export const FAILURE_STATUS_CODES = STATUS_CODES.filter(
  (code): code is Exclude<StatusCode, 'SUCCESS'> => code !== 'SUCCESS',
);

export function isFailureStatus(code: StatusCode): boolean {
  return code !== 'SUCCESS';
}

export const MONITOR_STATUSES = [
  'UNCHECKED',
  'BASELINED',
  'OK',
  'CHANGED',
  ...FAILURE_STATUS_CODES,
] as const;

export type MonitorStatus = (typeof MONITOR_STATUSES)[number];

export const CHANGE_TYPES = [
  'CHANGED',
  'ADDED',
  'UPDATED',
  'REMOVED',
  'SYSTEM_ALERT',
  'SYSTEM_RECOVERY',
] as const;

export type ChangeType = (typeof CHANGE_TYPES)[number];

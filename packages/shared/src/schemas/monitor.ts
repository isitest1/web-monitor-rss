import { z } from 'zod';
import { selectionInputSchema, selectionSchema } from './selection.js';

export const monitorModeSchema = z.enum(['single', 'list']);
export type MonitorMode = z.infer<typeof monitorModeSchema>;

export const comparisonRuleSchema = z.enum(['normalized_equality']);
export type ComparisonRule = z.infer<typeof comparisonRuleSchema>;

const BLOCKED_HOSTNAME_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^0\.0\.0\.0$/,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^::1$/,
  /^fc00:/i,
  /^fe80:/i,
  /metadata\.google\.internal$/i,
  /^169\.254\.169\.254$/,
];

function hasAllowedProtocol(rawUrl: string): boolean {
  try {
    const protocol = new URL(rawUrl).protocol;
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * True if the URL's hostname is localhost/loopback/private/link-local/
 * metadata-service, per §13's SSRF guard. Split out from the base schema
 * (which only enforces http/https shape) so the Worker route layer can
 * apply this check with an explicit, env-gated bypass for local
 * integration testing against fixture servers — production config never
 * sets that bypass, so real requests are unaffected.
 */
export function isBlockedMonitorHostname(rawUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return true;
  }
  return BLOCKED_HOSTNAME_PATTERNS.some((pattern) => pattern.test(url.hostname));
}

export const monitorUrlSchema = z
  .string()
  .url()
  .max(2000)
  .refine(hasAllowedProtocol, { message: 'URL must use http or https' });

export const monitorSchema = z.object({
  id: z.string(),
  feedId: z.string(),
  name: z.string().min(1).max(200),
  url: z.string().max(2000),
  monitorMode: monitorModeSchema,
  comparisonRule: comparisonRuleSchema,
  enabled: z.boolean(),
  orderIndex: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Monitor = z.infer<typeof monitorSchema>;

export const monitorWithSelectionsSchema = monitorSchema.extend({
  selections: z.array(selectionSchema),
});
export type MonitorWithSelections = z.infer<typeof monitorWithSelectionsSchema>;

export const createMonitorRequestSchema = z.object({
  feedId: z.string().min(1),
  name: z.string().min(1).max(200),
  url: monitorUrlSchema,
  monitorMode: monitorModeSchema.default('single'),
  comparisonRule: comparisonRuleSchema.default('normalized_equality'),
  enabled: z.boolean().default(true),
  orderIndex: z.number().int().nonnegative().default(0),
  selections: z.array(selectionInputSchema).min(1).max(50),
});
export type CreateMonitorRequest = z.infer<typeof createMonitorRequestSchema>;

export const updateMonitorRequestSchema = z.object({
  feedId: z.string().min(1).optional(),
  name: z.string().min(1).max(200).optional(),
  url: monitorUrlSchema.optional(),
  monitorMode: monitorModeSchema.optional(),
  comparisonRule: comparisonRuleSchema.optional(),
  enabled: z.boolean().optional(),
  orderIndex: z.number().int().nonnegative().optional(),
  selections: z.array(selectionInputSchema).min(1).max(50).optional(),
});
export type UpdateMonitorRequest = z.infer<typeof updateMonitorRequestSchema>;

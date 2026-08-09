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

export function isAllowedMonitorUrl(rawUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  const hostname = url.hostname;
  if (BLOCKED_HOSTNAME_PATTERNS.some((pattern) => pattern.test(hostname))) return false;
  return true;
}

export const monitorUrlSchema = z
  .string()
  .url()
  .max(2000)
  .refine(isAllowedMonitorUrl, { message: 'URL is not allowed' });

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
  name: z.string().min(1).max(200).optional(),
  url: monitorUrlSchema.optional(),
  monitorMode: monitorModeSchema.optional(),
  comparisonRule: comparisonRuleSchema.optional(),
  enabled: z.boolean().optional(),
  orderIndex: z.number().int().nonnegative().optional(),
  selections: z.array(selectionInputSchema).min(1).max(50).optional(),
});
export type UpdateMonitorRequest = z.infer<typeof updateMonitorRequestSchema>;

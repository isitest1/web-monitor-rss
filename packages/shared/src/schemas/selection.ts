import { z } from 'zod';
import { normalizationConfigSchema } from '../normalize.js';

export const selectorTypeSchema = z.enum(['css', 'document']);
export type SelectorType = z.infer<typeof selectorTypeSchema>;

export const extractionModeSchema = z.enum(['text', 'html', 'attribute', 'link', 'image', 'list']);
export type ExtractionMode = z.infer<typeof extractionModeSchema>;

export const matchModeSchema = z.enum(['normalized', 'case_insensitive']);
export type MatchMode = z.infer<typeof matchModeSchema>;

export const selectorCandidateSchema = z.object({
  selector: z.string().min(1).max(2000),
  strategy: z.enum(['id', 'data-attr', 'aria', 'tag-class', 'parent-child', 'nth-of-type']),
  score: z.number(),
  matchCount: z.number().int().nonnegative(),
});
export type SelectorCandidate = z.infer<typeof selectorCandidateSchema>;

export const selectionSchema = z.object({
  id: z.string(),
  monitorId: z.string(),
  label: z.string().min(1).max(200),
  selectorType: selectorTypeSchema,
  selector: z.string().max(2000),
  selectorCandidates: z.array(selectorCandidateSchema).default([]),
  extractionMode: extractionModeSchema,
  attributeName: z.string().max(200).nullable(),
  normalization: normalizationConfigSchema,
  matchMode: matchModeSchema,
  orderIndex: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Selection = z.infer<typeof selectionSchema>;

const HTML_EXTRACTION_MAX_LENGTH = 20000;

export const selectionInputSchema = z
  .object({
    // Present when this input represents an existing, already-saved
    // Selection being kept or edited in place (extension edit flow); the
    // repository preserves the row's id so change-detection hashes stay
    // stable for untouched Selections. Absent means "create as new".
    id: z.string().optional(),
    label: z.string().min(1).max(200),
    selectorType: selectorTypeSchema,
    selector: z.string().max(2000),
    selectorCandidates: z.array(selectorCandidateSchema).max(20).default([]),
    extractionMode: extractionModeSchema,
    attributeName: z.string().max(200).nullable().default(null),
    normalization: normalizationConfigSchema.optional(),
    matchMode: matchModeSchema.default('normalized'),
    orderIndex: z.number().int().nonnegative().default(0),
  })
  .superRefine((value, ctx) => {
    if (value.selectorType === 'css' && value.selector.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'selector is required when selectorType is css',
        path: ['selector'],
      });
    }
    if (value.extractionMode === 'attribute' && !value.attributeName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'attributeName is required when extractionMode is attribute',
        path: ['attributeName'],
      });
    }
  });
export type SelectionInput = z.infer<typeof selectionInputSchema>;

export { HTML_EXTRACTION_MAX_LENGTH };

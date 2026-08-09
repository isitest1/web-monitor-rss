import { z } from 'zod';

export const feedKindSchema = z.enum(['content', 'system']);
export type FeedKind = z.infer<typeof feedKindSchema>;

export const rssTokenStatusSchema = z.enum(['active', 'revoked']);
export type RssTokenStatus = z.infer<typeof rssTokenStatusSchema>;

export const feedSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(200),
  slug: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[a-z0-9-]+$/),
  kind: feedKindSchema,
  rssTokenPrefix: z.string().nullable(),
  rssTokenIssuedAt: z.string().nullable(),
  rssTokenLastUsedAt: z.string().nullable(),
  rssTokenStatus: rssTokenStatusSchema.nullable(),
  enabled: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Feed = z.infer<typeof feedSchema>;

export const createFeedRequestSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[a-z0-9-]+$/),
  kind: feedKindSchema.default('content'),
  enabled: z.boolean().default(true),
});
export type CreateFeedRequest = z.infer<typeof createFeedRequestSchema>;

export const updateFeedRequestSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  enabled: z.boolean().optional(),
});
export type UpdateFeedRequest = z.infer<typeof updateFeedRequestSchema>;

export const feedWithPlaintextTokenSchema = feedSchema.extend({
  rssToken: z.string(),
  rssUrl: z.string(),
});
export type FeedWithPlaintextToken = z.infer<typeof feedWithPlaintextTokenSchema>;

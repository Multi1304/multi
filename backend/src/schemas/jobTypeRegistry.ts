import { z } from 'zod';

/**
 * Registry of Zod schemas for all supported platform job types.
 */
export const jobTypeSchemas: Record<string, z.ZodObject<any>> = {
  // --- Facebook ---
  'facebook.login': z.object({
    username: z.string().min(1),
    password: z.string().min(1),
    factor2: z.boolean().optional().default(false),
  }),
  'facebook.scrape': z.object({
    url: z.string().url(),
    depth: z.number().int().min(1).default(1),
  }),
  'facebook.action': z.object({
    actionType: z.enum(['post', 'like', 'comment', 'follow']),
    targetId: z.string(),
  }),
  'facebook.automation': z.object({
    steps: z.array(z.object({ action: z.string(), value: z.any() })),
  }),
  'facebook.health-check': z.object({
    checkCookies: z.boolean().default(true),
  }),

  // --- Instagram ---
  'instagram.login': z.object({ username: z.string(), password: z.string() }),
  'instagram.scrape': z.object({ url: z.string() }),
  'instagram.action': z.object({ actionType: z.enum(['like', 'comment', 'follow']), targetId: z.string() }),
  'instagram.automation': z.object({ steps: z.array(z.any()) }),
  'instagram.health-check': z.object({ checkCookies: z.boolean() }),

  // --- TikTok ---
  'tiktok.login': z.object({ username: z.string(), password: z.string() }),
  'tiktok.scrape': z.object({ url: z.string() }),
  'tiktok.action': z.object({ actionType: z.enum(['like', 'follow', 'share']), targetId: z.string() }),
  'tiktok.automation': z.object({ steps: z.array(z.any()) }),
  'tiktok.health-check': z.object({ checkCookies: z.boolean() }),

  // --- Amazon ---
  'amazon.login': z.object({ email: z.string(), password: z.string() }),
  'amazon.scrape': z.object({ asin: z.string() }),
  'amazon.action': z.object({ actionType: z.enum(['add-to-cart', 'wishlist']), asin: z.string() }),
  'amazon.automation': z.object({ steps: z.array(z.any()) }),
  'amazon.health-check': z.object({ checkCookies: z.boolean() }),

  // Generic fallback for others to satisfy the user's "at least 5 per platform" but keeping code clean
} as any;

// Helper to get schema for any jobType
export function getJobSchema(jobType: string): z.ZodObject<any> {
    const [platform] = jobType.split('.');
    
    // If specific one exists, return it
    if (jobTypeSchemas[jobType]) return jobTypeSchemas[jobType];

    // Generic platform schemas if specific ones aren't defined yet
    if (jobType.endsWith('.login')) return z.object({ username: z.string(), password: z.string() });
    if (jobType.endsWith('.scrape')) return z.object({ url: z.string().optional(), target: z.string().optional() });
    if (jobType.endsWith('.action')) return z.object({ actionType: z.string(), targetId: z.string() });
    if (jobType.endsWith('.automation')) return z.object({ steps: z.array(z.any()) });
    if (jobType.endsWith('.health-check')) return z.object({ checkCookies: z.boolean().default(true) });

    return z.object({}).passthrough();
}

/**
 * Universal validation helper for job payloads
 */
export function validateJobPayload(jobType: string, payload: any) {
  const schema = getJobSchema(jobType);
  return schema.safeParse(payload);
}

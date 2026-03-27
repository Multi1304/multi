import { z } from 'zod';

// ─── Auth schemas ──────────────────────────────────────────────────

export const registerSchema = z.object({
  tenantName: z.string().min(2, 'Tenant name must be at least 2 characters').max(100),
  email: z.string().regex(/^[^\s@]+@[^\s@]+$/, 'Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  termsAccepted: z.boolean().refine(val => val === true, { message: 'You must accept the terms of service' }),
});

export const loginSchema = z.object({
  email: z.string().regex(/^[^\s@]+@[^\s@]+$/, 'Invalid email format'),
  password: z.string().min(1, 'Password is required'),
  totpCode: z.string().regex(/^\d{6}$/, 'Invalid MFA code format').optional(),
});

export const inviteSchema = z.object({
  email: z.string().regex(/^[^\s@]+@[^\s@]+$/, 'Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  role: z.enum(['USER', 'OPERATOR', 'MANAGER', 'AUDITOR']).optional().default('USER'),
});

export const refreshSchema = z.object({
  // Only validating headers or cookies usually, but kept for body compatibility
  refreshToken: z.string().min(1, 'Refresh token is required').optional(),
});

export const forgotPasswordSchema = z.object({
  email: z.string().regex(/^[^\s@]+@[^\s@]+$/, 'Invalid email format'),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  newPassword: z.string().min(8, 'Password must be at least 8 characters').max(128),
});

// ─── Profile schemas ──────────────────────────────────────────────

export const createProfileSchema = z.object({
  name: z.string().min(1, 'Profile name is required').max(200),
  tags: z.array(z.string()).optional().default([]),
  proxy: z.object({
    type: z.enum(['none', 'http', 'socks5']).optional().default('none'),
    host: z.string().optional(),
    port: z.number().int().optional(),
    username: z.string().optional(),
    password: z.string().optional(),
  }).optional(),
  notes: z.string().max(5000).optional(),
});

// ─── Account schemas ──────────────────────────────────────────────

export const createAccountSchema = z.object({
  profileId: z.string().uuid('Invalid profile ID'),
  username: z.string().min(1, 'Username is required').max(200),
  password: z.string().min(1, 'Password is required').max(500),
});

// ─── Team schemas ─────────────────────────────────────────────────

export const changeRoleSchema = z.object({
  role: z.enum(['USER', 'OPERATOR', 'MANAGER', 'AUDITOR', 'ADMIN']),
});

// ─── Bulk schemas ─────────────────────────────────────────────────

export const bulkCreateProfilesSchema = z.object({
  profiles: z.array(z.object({
    name: z.string().min(1).max(200),
    tags: z.array(z.string()).optional().default([]),
    proxy: z.object({
      type: z.enum(['none', 'http', 'socks5']).optional().default('none'),
      host: z.string().optional(),
      port: z.number().int().optional(),
      username: z.string().optional(),
      password: z.string().optional(),
    }).optional(),
    notes: z.string().max(5000).optional(),
  })).min(1, 'At least one profile is required').max(500, 'Maximum 500 profiles per batch'),
});

export const bulkCloneProfileSchema = z.object({
  sourceProfileId: z.string().uuid('Invalid profile ID'),
  count: z.number().int().min(1).max(100, 'Maximum 100 clones per batch'),
  namePrefix: z.string().min(1).max(100).optional(),
});

// ─── Automation schemas ───────────────────────────────────────────

export const enqueueJobSchema = z.object({
  type: z.string().min(1, 'Job type is required'),
  profileId: z.string().uuid('Invalid profile ID').optional(),
  payload: z.record(z.string(), z.unknown()).optional().default({}),
  priority: z.number().int().min(1).max(10).optional(),
});

// --- Tasks schemas ---

export const createTaskTemplateSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().max(500).optional(),
  jobType: z.string().min(1, 'Job type is required'),
  payload: z.record(z.string(), z.unknown()).optional().default({}),
});

export const createBatchSchema = z.object({
  name: z.string().max(100).optional(),
  templateId: z.string().uuid('Invalid template ID').optional(),
  targetAccountIds: z.array(z.string().uuid()).min(1, 'Must specify at least one target account'),
  payloadOverride: z.record(z.string(), z.unknown()).optional(),
  scheduledAt: z.string().datetime().optional(), // ISO string
});

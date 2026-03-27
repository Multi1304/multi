import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

/**
 * Middleware factory that validates req.body against a Zod schema.
 * Returns 400 with structured errors if validation fails.
 */
export function validate(schema: z.ZodType) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const errors = result.error.issues.map((e: any) => ({
        field: e.path?.join('.') || '',
        message: e.message,
      }));
      console.error('Validation Error Details:', JSON.stringify(errors));
      return res.status(400).json({ error: 'Validation failed', details: errors });
    }
    req.body = result.data;
    next();
  };
}

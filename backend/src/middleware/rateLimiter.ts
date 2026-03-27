import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import Redis from 'ioredis';
import { logger } from '../utils/logger';
import { config } from '../config';

const redisClient = new Redis({
  host: config.redis.host,
  port: config.redis.port,
});

/**
 * Auth rate limiter — protects login/register from brute force.
 * 5 attempts per minute per IP on login, 3 on register.
 */
export const authLoginLimiter = rateLimit({
  store: new RedisStore({
    prefix: 'rl_login:',
    sendCommand: (...args: string[]) => redisClient.call(args[0], ...args.slice(1)) as any,
  }),
  windowMs: 60 * 1000, // 1 minute
  max: 5,
  skip: () => process.env.NODE_ENV === 'test',
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts, please try again in a minute' },
  handler: (req, res, _next, options) => {
    logger.warn('Auth rate limit exceeded', { ip: req.ip, path: req.path });
    res.status(429).json(options.message);
  },
});

export const authRegisterLimiter = rateLimit({
  store: new RedisStore({
    prefix: 'rl_register:',
    sendCommand: (...args: string[]) => redisClient.call(args[0], ...args.slice(1)) as any,
  }),
  windowMs: 60 * 1000,
  max: 3,
  skip: () => process.env.NODE_ENV === 'test',
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many registration attempts, please try again later' },
  handler: (req, res, _next, options) => {
    logger.warn('Register rate limit exceeded', { ip: req.ip });
    res.status(429).json(options.message);
  },
});

/**
 * General API rate limiter — 100 requests per minute per IP.
 */
export const generalLimiter = rateLimit({
  store: new RedisStore({
    prefix: 'rl_general:',
    sendCommand: (...args: string[]) => redisClient.call(args[0], ...args.slice(1)) as any,
  }),
  windowMs: 60 * 1000,
  max: 100,
  skip: () => process.env.NODE_ENV === 'test',
  keyGenerator: (req, res) => {
    // Determine limit by Auth token, fallback to IP if unauthenticated
    const header = req.headers.authorization;
    if (header && header.startsWith('Bearer ')) {
      return header.substring('Bearer '.length).trim();
    }
    return (ipKeyGenerator as any)(req, res);
  },
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please slow down' },
});

# Environment Variables Documentation

All platform configurations stream through the `.env` mapping system, loaded by Docker Compose or locally via natively mounted files. 

## Core Setup Variables
- `NODE_ENV`: Should exclusively be set to `production` in live environments.
- `PORT`: Exposed internal Docker routing port for Express. Defaults to `4000`.
- `DOMAIN`: Publically accessible FQDN used by mapping proxies. E.g `https://app.mi-dominio.com`.
- `CORS_ORIGINS`: Used strictly for frontend HTTP whitelisting to reject third-party domain execution. Should mirror `DOMAIN` without paths.

## Database Configurations
- `DATABASE_URL`: The fully encapsulated connection string utilizing PostgreSQL. 
  Example: `postgresql://postgres:password@postgres:5432/multilogin?schema=public`

## Caching & Task Queues
- `REDIS_URL`: BullMQ and Express Rate Limit connection pointer.
  Example: `redis://redis:6379`

## Cryptography & Hashing
- `JWT_SECRET`: Massive entropy payload utilized to sign JSON Web Tokens. **Do not leak**.
- `ENCRYPTION_KEY`: A 64-character hex-encoded AES-256-GCM seed key utilized inside Fingerprint / Cookie local encryption sequences.

## External Bindings
- `STRIPE_SECRET_KEY`: Integration key for billing subscriptions handling.

## Example Configuration (.env.production)
```ini
NODE_ENV=production
PORT=4000
DATABASE_URL=postgresql://user:pass@postgres:5432/db?schema=public
REDIS_URL=redis://redis:6379
JWT_SECRET=y0uR_sUp3r_Secr3t_1_2_3_4
ENCRYPTION_KEY=1f2b...
STRIPE_SECRET_KEY=sk_test_...
DOMAIN=https://ultra.my-startup.com
CORS_ORIGINS=https://ultra.my-startup.com
```

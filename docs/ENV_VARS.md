# Environment Variables Reference

## Backend

| Variable | Default | Description |
|---|---|---|
| `NODE_ENV` | `development` | App environment |
| `PORT` | `3000` | HTTP server port |
| `DB_URL` | — | PostgreSQL connection URL |
| `REDIS_URL` | — | Redis connection URL |
| `JWT_SECRET` | — | Secret for JWT signing |
| `SESSION_TTL` | `3600` | Session TTL in seconds |

## Docker Compose

| Variable | Description |
|---|---|
| `POSTGRES_PASSWORD` | PostgreSQL root password |
| `REDIS_PASSWORD` | Redis auth password |

# Deployment Guide

## Prerequisites
- Docker 24+
- Docker Compose v2
- Node.js 20+

## Local Development
```bash
git clone https://github.com/Multi1304/multi
cd multi
cp .env.example .env
docker compose up -d
```

## Production
```bash
docker compose -f docker-compose.prod.yml up -d
```

## Environment Variables
| Variable | Description | Required |
|---|---|---|
| `NODE_ENV` | Environment (development/production) | Yes |
| `PORT` | Server port (default 3000) | No |
| `DB_URL` | PostgreSQL connection string | Yes |
| `REDIS_URL` | Redis connection string | Yes |

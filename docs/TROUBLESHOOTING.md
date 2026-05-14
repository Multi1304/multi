# Troubleshooting Guide

## Docker Issues

### Containers won't start
```bash
docker compose logs
docker compose down -v && docker compose up -d
```

### Port already in use
```bash
lsof -i :3000
kill -9 <PID>
```

## Database Issues

### Connection refused
- Check `DB_URL` in `.env`
- Ensure PostgreSQL container is running: `docker compose ps`

### Migrations failed
```bash
docker compose exec backend npm run migrate
```

## Redis Issues

### Cache not working
```bash
docker compose exec redis redis-cli ping
# Expected: PONG
```

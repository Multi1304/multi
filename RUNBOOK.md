# Multilogin Platform - Runbook

## Database Operations

### PostgreSQL Backups
To securely construct an offline SQL dump artifact from the active container volume:
```bash
sudo docker exec -t $(sudo docker ps -q -f "name=postgres") pg_dump -U postgres multilogin > /var/backups/multilogin_dump_$(date +%Y%m%d_%H%M%S).sql
```

### PostgreSQL Restorations
To push an existing `.sql` artifact backup onto the live DB (caution - drops current table state):
```bash
sudo docker exec -i $(sudo docker ps -q -f "name=postgres") psql -U postgres multilogin < /path/to/backup.sql
```

## System Management Lifecycle

### Safe Restart Sequences
To safely cycle the backend node API or the BullMQ worker services without interrupting proxy frontend flows:
```bash
# Restart Worker gracefully
sudo docker compose -f docker-compose.prod.yml restart worker

# Zero down-time scale API if supported or simple restart
sudo docker compose -f docker-compose.prod.yml restart api
```

### Complete Shutdown
```bash
sudo docker compose -f docker-compose.prod.yml down
```

### Inspecting Production Logs
To view realtime streamed structured logs via PM2 equivalent docker streams:
```bash
# Tail all container logs combined
sudo docker compose -f docker-compose.prod.yml logs -f --tail=100

# Focus entirely on the Express Backend API
sudo docker compose -f docker-compose.prod.yml logs -f api

# Analyze Worker BullMQ executions
sudo docker compose -f docker-compose.prod.yml logs -f worker
```

## Health Verification Checks

### API Health
Run a cURL trace against the active external container boundary:
```bash
curl -i https://app.mi-dominio.com/api/health
```
Expect an `HTTP 200 OK` JSON packet echoing database, redis, and worker heartbeat vitality.

### Caddy Reverse Proxy Internal Routes
Check configuration map:
```bash
sudo docker exec -it $(sudo docker ps -q -f "name=caddy") caddy fmt /etc/caddy/Caddyfile
```

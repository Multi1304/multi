# Multilogin Platform - Deployment Guide

## Server Requirements
- **OS**: Ubuntu 22.04 LTS (recommended)
- **RAM**: Minimum 4GB (8GB recommended for production workloads)
- **CPU**: 2 vCPUs minimum
- **Storage**: 40GB SSD minimum

## Prerequisites Installation
1. Install Docker:
   ```bash
   curl -fsSL https://get.docker.com -o get-docker.sh
   sudo sh get-docker.sh
   ```
2. Install Docker Compose plugin:
   ```bash
   sudo apt-get install docker-compose-plugin
   ```

## Setup & Deployment Instructions
1. Clone the repository into `/opt/multilogin`:
   ```bash
   git clone https://github.com/your-org/multilogin-platform.git /opt/multilogin
   cd /opt/multilogin
   ```

2. Configure environment variables:
   ```bash
   cp .env.production.example .env.production
   nano .env.production # Edit JWT_SECRET, ENCRYPTION_KEY, DOMAIN, etc.
   ```

3. Build the Frontend manually (if not done in CI/CD pipeline):
   ```bash
   cd frontend
   npm install
   npm run build
   cd ..
   ```

4. Launch the platform using docker compose detached mode:
   ```bash
   sudo docker compose -f docker-compose.prod.yml up -d
   ```

## Domain and SSL (Caddy)
Caddy automatically manages SSL certificates via Let's Encrypt. By specifying your actual domain in `.env.production` (e.g. `DOMAIN=https://app.mi-dominio.com`), Caddy will capture it via the `Caddyfile` `{env.DOMAIN}` block. Wait up to 60 seconds the first time for it to verify domain ownership and mint certificates.

## Platform Upgrades
```bash
git pull origin main
cd frontend && npm install && npm run build && cd ..
sudo docker compose -f docker-compose.prod.yml down
sudo docker compose -f docker-compose.prod.yml build
sudo docker compose -f docker-compose.prod.yml up -d
```

#!/bin/bash
set -e

echo "🚀 Setting up Multilogin Platform (Ultra Deluxe)..."

echo "1) Creating .env files if missing..."
if [ ! -f .env ]; then
  cp backend/.env.example .env
  echo "Created .env at root"
fi

echo "2) Building and starting Docker containers..."
docker compose up -d --build

echo "3) Waiting for database to be ready (10s)..."
sleep 10

echo "4) Running Prisma migrations & Setup Seeds..."
docker compose exec -T api npx prisma db push --accept-data-loss
docker compose exec -T api node setup.js

echo "✅ Setup Complete!"
echo "➡️  Frontend available at: http://localhost:3000"
echo "➡️  API available at: http://localhost:4000"
echo "➡️  Default Admin: admin@local / AdminPass123!"

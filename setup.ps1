Write-Host "🚀 Setting up Multilogin Platform (Ultra Deluxe)..."

Write-Host "1) Creating .env files if missing..."
if (-Not (Test-Path ".env")) {
    Copy-Item "backend\.env.example" ".env"
    Write-Host "Created .env at root"
}

Write-Host "2) Building and starting Docker containers..."
docker compose up -d --build

Write-Host "3) Waiting for database to be ready (15s)..."
Start-Sleep -Seconds 15

Write-Host "4) Running Prisma migrations & Setup Seeds..."
docker compose exec -T api npx prisma db push --accept-data-loss
docker compose exec -T api node setup.js

Write-Host "✅ Setup Complete!"
Write-Host "➡️  Frontend available at: http://localhost:3000"
Write-Host "➡️  API available at: http://localhost:4000"
Write-Host "➡️  Default Admin: admin@local / AdminPass123!"

Set-Location ".."

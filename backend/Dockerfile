# Multilogin Superior V3 - Edge Node
FROM node:20-bullseye-slim

# Install system dependencies for Chromium/Puppeteer
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    procps \
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libdbus-1-3 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpango-1.0-0 \
    libcairo2 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Enable corepack for modern package managers if needed, or use npm
RUN npm install -g pm2 typescript

COPY package*.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate

COPY . .

# Build TS
RUN npm run build

# PM2 cluster mode to fully utilize available CPUs without blowing up 16GB RAM
# Using max_memory_restart to gracefully reload workers if they leak
RUN echo 'module.exports = { apps: [{ name: "multilogin-node", script: "dist/server.js", instances: "max", exec_mode: "cluster", max_memory_restart: "800M" }]};' > ecosystem.config.js

EXPOSE 3001

CMD ["pm2-runtime", "ecosystem.config.js"]

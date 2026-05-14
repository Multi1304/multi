# Architecture Overview

## Stack

```
┌─────────────────────────────────┐
│         Frontend (React)        │
└────────────────┬────────────────┘
                 │ REST/WS
┌────────────────▼────────────────┐
│       Backend API (Node.js)     │
└──────┬──────────────┬───────────┘
       │              │
┌──────▼──────┐ ┌─────▼──────┐
│  PostgreSQL │ │   Redis    │
└─────────────┘ └────────────┘
```

## Components

- **Frontend**: React + Vite, communicates via REST API
- **Backend**: Node.js + Express, handles business logic
- **PostgreSQL**: Primary data store for profiles and sessions
- **Redis**: Caching and real-time session state
- **Docker**: All services containerized via Docker Compose

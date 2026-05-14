# CamelFarm API Documentation

## Base URL
`http://localhost:3000/api/v1`

## Authentication
All endpoints require a Bearer token in the Authorization header.

## Endpoints

### Profiles
- `GET /profiles` - List all profiles
- `POST /profiles` - Create new profile
- `GET /profiles/:id` - Get profile by ID
- `PUT /profiles/:id` - Update profile
- `DELETE /profiles/:id` - Delete profile

### Sessions
- `POST /sessions/start` - Start a browser session
- `POST /sessions/stop` - Stop a session
- `GET /sessions/status` - Get session status

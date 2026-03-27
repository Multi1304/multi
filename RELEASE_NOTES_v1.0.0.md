# Release Notes - V1.0.0 Commercial

**Multilogin Ultra Deluxe v1.0.0** is here. This release transforms the platform into a commercial-grade solution with enterprise network capabilities and robust security.

## New Features
- **Enterprise Network Layer**: Proxy Pools, DNS Policies, and Fingerprint Presets.
- **Bulk Operations**: Bulk account provisioning and profile cloning.
- **Live Ops & Monitoring**: Real-time job tracking and worker management.
- **Enhanced Security**: Sessions management, Kill Switch, and Tenant Suspension.
- **Improved Task Builder**: Advanced template orchestration and network overrides.

## Technical Changes
- Database schema migrated to support multi-tenant enterprise features.
- Versioning unified across frontend and backend.
- Docker Production configuration finalized.

## Known Issues
- Sticky IP rotation requires Redis for state persistence (implemented in worker as best-effort for V1).
- DNS Policies require local DNS resolver support on the worker side.

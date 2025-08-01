# Documentation Index

This directory contains documentation for the Kubernetes Admin Dashboard.

## Quick Links

- [Engineering Blueprint](../k8s-admin-dashboard-blueprint.md) - Complete technical specification
- [Development Guide](./development.md) - How to set up and develop the application
- [API Documentation](./api.md) - REST API and WebSocket endpoints
- [Deployment Guide](./deployment.md) - How to deploy the application

## Architecture Overview

The Kubernetes Admin Dashboard is built with:

- **Backend**: Go with chi router, client-go, structured logging
- **Frontend**: React + TypeScript + Tailwind CSS + Vite
- **Communication**: REST APIs + WebSocket for real-time updates
- **Deployment**: Container + Helm chart for Kubernetes

## Development Status

✅ **M0 - Bootstrap**: Project scaffolding, basic server, React app, CI  
🚧 **M1 - Read-only**: Kubernetes client integration, WebSocket streaming  
📋 **M2 - Node Actions**: Cordon/uncordon/drain operations  
📋 **M3 - Apply YAML**: Server-side apply with Monaco editor  
📋 **M4 - Security**: RBAC, authentication, rate limiting  
📋 **M5 - Packaging**: Helm chart, release pipeline

## Quick Start

```bash
# Clone and setup
git clone <repo-url>
cd k8s-admin-dashboard
make install-deps

# Development
make kind-up        # Start Kind cluster
make build         # Build everything
./bin/server       # Start server

# Frontend development
cd web && npm run dev
```

## Key Commands

```bash
make help          # Show all targets
make build         # Build binary + frontend
make test          # Run tests
make docker        # Build container image
make kind-up       # Create development cluster
```

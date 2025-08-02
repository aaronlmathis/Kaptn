# Kubernetes Admin Dashboard

[![CI](https://github.com/aaronlmathis/k8s-admin-dash/workflows/CI/badge.svg)](https://github.com/aaronlmathis/k8s-admin-dash/actions)
[![Go Report Card](https://goreportcard.com/badge/github.com/aaronlmathis/k8s-admin-dash)](https://goreportcard.com/report/github.com/aaronlmathis/k8s-admin-dash)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A secure, production-ready **Kubernetes admin dashboard** that can observe cluster state and perform safe operational actions. Built with Go backend (client-go + WebSockets) and React frontend (TypeScript + Tailwind CSS).

## Features

- **Real-time cluster monitoring** - Live updates via WebSockets
- **Safe node operations** - Cordon, uncordon, and drain with safeguards
- **Declarative deployments** - Server-side apply with dry-run support
- **Modern UI** - React + TypeScript + Tailwind CSS + ShadCN with dark mode
- **Security-first** - RBAC integration, audit logs, rate limiting
- **Easy deployment** - Helm chart for in-cluster deployment
- **Multiple modes** - Container deployment or desktop app (Wails2)

![Kubernetes Admin Dashboard Screenshot](images/dashboard-current.png)

---

## Quick Start

### Prerequisites

- Go 1.22+
- Node.js 20+
- Docker (optional)
- Kind (for local development)

### Local Development

1. **Clone and setup**:
   ```bash
   git clone https://github.com/aaronlmathis/k8s-admin-dash.git
   cd kad
   make install-deps
   ```

2. **Start a Kind cluster**:
   ```bash
   make kind-up
   ```

3. **Run the application**:
   ```bash
   # Terminal 1: Start backend
   make build && ./bin/server
   
   ```

4. **Access the dashboard**:
   - http://localhost:8080/dashboard

### Build and Deploy

1. **Build everything**:
   ```bash
   make build
   ```

2. **Build Docker image**:
   ```bash
   make docker
   ```

3. **Deploy to Kubernetes** (coming in M5):
   ```bash
   helm install kad ./deploy/helm -n kube-system
   ```

---

## Project Structure

```
├── cmd/server/           # Main application entry point
├── internal/             # Private Go packages
│   ├── api/             # HTTP handlers and routing
│   ├── k8s/             # Kubernetes client and operations
│   ├── config/          # Configuration management
│   ├── logging/         # Structured logging
│   └── version/         # Version information
├── frontend/                 # React frontend application
│   ├── src/
│   │   ├── components/  # React components
│   │   └── ...
├── deploy/              # Deployment manifests
│   ├── helm/           # Helm chart
│   └── rbac/           # RBAC examples
├── .github/workflows/   # CI/CD pipelines
└── docs/               # Documentation
```

---

## Configuration

The application can be configured via environment variables or a config file:

```yaml
# config.yaml
server:
  addr: "0.0.0.0:8080"
kubernetes:
  mode: "kubeconfig"  # or "incluster"
logging:
  level: "info"
```

Key environment variables:
- `PORT` - Server port (default: 8080)
- `LOG_LEVEL` - Logging level (debug, info, warn, error)
- `KUBECONFIG` - Path to kubeconfig file
- `KAD_CONFIG_PATH` - Path to config file

---


## API Endpoints

### Health & Status
- `GET /healthz` - Health check
- `GET /readyz` - Readiness check  
- `GET /version` - Version information

### Kubernetes Resources (Coming in M1)
- `GET /api/v1/nodes` - List cluster nodes
- `GET /api/v1/pods` - List pods with filtering
- `WS /api/v1/stream/nodes` - Real-time node updates
- `WS /api/v1/stream/pods` - Real-time pod updates

---

## Development

### Make Targets

```bash
make help           # Show all available targets
make dev            # Run in development mode
make build          # Build binary and frontend
make test           # Run all tests
make lint           # Lint code
make fmt            # Format code
make clean          # Clean build artifacts
make kind-up        # Create Kind cluster
make kind-down      # Delete Kind cluster
```

### Architecture

The application follows a clean architecture pattern:

- **Frontend**: React SPA with real-time updates via WebSockets
- **Backend**: Go server with chi router, structured logging, and Kubernetes client-go
- **Communication**: REST APIs + WebSocket for live data
- **Deployment**: Container-first with Helm chart


---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## Security

This project follows security best practices:

- Least-privilege RBAC
- Request ID tracking for audit trails
- Rate limiting on mutation endpoints
- Input validation and sanitization
- Secure defaults

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [Kubernetes](https://kubernetes.io/) - The platform this dashboard manages
- [client-go](https://github.com/kubernetes/client-go) - Official Kubernetes Go client
- [Vite](https://vitejs.dev/) - Fast frontend build tool
- [Tailwind CSS](https://tailwindcss.com/) - Utility-first CSS framework

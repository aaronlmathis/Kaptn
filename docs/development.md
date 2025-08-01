# Development Guide

## Prerequisites

- Go 1.22+
- Node.js 20+
- Docker (optional)
- Kind (for local Kubernetes cluster)

## Setup

1. **Install dependencies**:
   ```bash
   make install-deps
   ```

2. **Create a local Kubernetes cluster**:
   ```bash
   make kind-up
   ```

3. **Build the application**:
   ```bash
   make build
   ```

## Development Workflow

### Backend Development

The Go backend is located in:
- `cmd/server/` - Main application entry point
- `internal/` - Private packages for the application

Start the backend:
```bash
./bin/server
```

The server will start on `http://localhost:8080` with these endpoints:
- `GET /healthz` - Health check
- `GET /version` - Version information  
- `GET /api/v1/` - API status

### Frontend Development

The React frontend is in the `web/` directory.

For development with hot reload:
```bash
cd web
npm run dev
```

This starts Vite dev server on `http://localhost:5173` with proxy to backend.

### Full Development Mode

To run both backend and frontend together:
```bash
# Terminal 1: Backend
make build && ./bin/server

# Terminal 2: Frontend dev server  
cd web && npm run dev
```

## Testing

Run all tests:
```bash
make test
```

Run Go tests only:
```bash
go test ./... -v
```

## Code Quality

Format code:
```bash
make fmt
```

Lint code:
```bash
make lint
```

## Building

Build everything:
```bash
make build
```

Build Docker image:
```bash
make docker
```

## Project Structure

```
├── cmd/server/           # Main application
├── internal/             # Private Go packages
│   ├── api/             # HTTP handlers
│   ├── config/          # Configuration
│   ├── logging/         # Structured logging
│   └── version/         # Version info
├── web/                 # React frontend
│   ├── src/
│   │   └── components/  # React components
│   └── dist/           # Built frontend (created by build)
├── deploy/             # Kubernetes manifests
└── docs/               # Documentation
```

## Configuration

The application uses environment variables and/or config files:

### Environment Variables
- `PORT` - Server port (default: 8080)
- `LOG_LEVEL` - Logging level (debug, info, warn, error)
- `KUBECONFIG` - Path to kubeconfig file

### Config File
See `config.example.yaml` for a complete configuration example.

## Troubleshooting

### Backend won't start
- Check if port 8080 is available
- Verify Go dependencies: `go mod download`
- Check logs for error details

### Frontend build fails
- Ensure Node.js 20+ is installed
- Run `npm install` in web directory
- Check for TypeScript errors: `cd web && npx tsc --noEmit`

### Tests fail
- Ensure all dependencies are installed
- Check if Kind cluster is running for integration tests

## Next Steps

After M0 bootstrap, the next development phases are:

1. **M1**: Add Kubernetes client integration and WebSocket streaming
2. **M2**: Implement node actions (cordon/uncordon/drain)
3. **M3**: Add YAML apply functionality with Monaco editor
4. **M4**: Implement security (RBAC, auth, rate limiting)
5. **M5**: Complete packaging (Helm chart, release pipeline)

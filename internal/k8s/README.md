Kaptn Kubernetes Package

Scope
- Client factory for in-cluster and kubeconfig modes.
- Impersonation manager and context helpers for request-scoped clients.
- SSAR helpers for permission checks and batching.
- Informers and resource helpers used by services and handlers.

Does Not Own
- HTTP routing or authentication.
- Static asset serving.

Key Components
- `client/`: client construction and REST config.
- `impersonation`: build impersonated clients from authenticated users/groups.
- `context.go`: add/extract impersonated clients in request context.
- `informers/`: event broadcasting for WebSocket updates.

Guardrails
- Keep this package the source of truth for Kubernetes interaction primitives.
- Prefer interfaces for testability; avoid global mutable state.


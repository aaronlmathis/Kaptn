Kaptn AuthZ (Capabilities) Package

Scope
- Capability service for UI gating backed by Kubernetes RBAC (SSAR).
- Batch capability checks, cache with TTL, CRD-aware capability discovery and stats.
- No HTTP concerns; used by server handlers.

Does Not Own
- Authentication or session logic.
- Route mounting.

Key Components
- `capability_service.go` (or equivalent): batch checks, cache.
- `crd_discovery.go`: dynamic capability registration from API resources.
- `multi_cluster.go`: optional multi-cluster capability support.

Guardrails
- Never hardcode app-level role gates; always translate features to Kubernetes verbs/resources and defer to SSAR.
- Keep cache TTLs configurable via server config; log the effective TTL at startup.


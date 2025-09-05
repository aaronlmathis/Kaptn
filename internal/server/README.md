Kaptn Server Package

Scope
- Owns HTTP concerns: chi router, standard middlewares, route mounting, static SPA serving, and session injection.
- Wires dependencies (auth, k8s, services) and injects them into handlers.
- Exposes `Handler()`, `SetupRoutes()`, `Start()/Stop()`, and `GetStaticHandler()`.

Does Not Own
- Business logic beyond thin HTTP orchestration.
- Route contracts or URL structure (lives in `internal/api/routes`).
- Cross-cutting middlewares that are API-agnostic (`internal/middleware`).

Key Patterns
- HTTP at the edge: authenticate globally; per-tier apply only `RequireAuth` and `RequireImpersonation`. Authorization is enforced by Kubernetes RBAC via SSAR in handlers/services.
- Impersonation first: request-scoped Kubernetes calls use clients from `s.GetImpersonatedClient(r)`; fallback to base client only in `authMode=none`.
- Static SPA: served from `frontend/dist` with HTML-only session injection in `static.go`.

Entrypoints
- `server.go`: construction, DI, router wiring, route mounting via `internal/api/routes`.
- `static.go`: session injection and SPA fallback.

Guardrails
- Do not change URLs or JSON shapes expected by `internal/api/routes` consumers.
- Keep frontend static; no SSR.
- Preserve WebSocket upgrade paths and Prometheus `/metrics` exposure.


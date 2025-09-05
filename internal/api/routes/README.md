Kaptn API Routes Package

Scope
- Defines URL structure and mounts route groups (Public, Admin, Read, Write, Apply, System, Static).
- Provides handler interfaces (`contracts.go`) that the server implements.
- Accepts middlewares from the server (e.g., `RequireAuth`, `RequireImpersonation`) and applies them per tier.

Does Not Own
- Handler implementations or business logic.
- Static serving or HTML session injection.
- Authentication logic or Kubernetes clients.

Key Files
- `api.go`: top-level mount and per-tier grouping.
- `contracts.go`: handler interfaces for each tier.
- `*.go`: small per-tier mount helpers.

Guardrails
- No direct imports of the concrete server package.
- No middleware logic beyond applying server-provided functions.
- Never change route semantics without explicit design approval.


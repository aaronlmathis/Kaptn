Kaptn Auth Package

Scope
- Authentication and session management: OIDC client, cookie/session handling, CSRF, secure headers.
- Provides HTTP middlewares: `Authenticate`, `RequireAuth`, `SecureHeaders`.
- Optional user-to-group resolution via `AuthzResolver` (e.g., ConfigMap-backed), used to enrich impersonation.

Does Not Own
- Final authorization decisions (enforced by Kubernetes RBAC via SSAR).
- Route mounting or static asset serving.

Key Components
- `oidc.go`: OIDC client and discovery.
- `session.go`: session manager and cookie handling.
- `middleware.go`: request auth pipeline, secure headers, `UserFromContext` helpers.

Guardrails
- Keep tokens and secrets in environment variables.
- Avoid app-level role checks; defer to Kubernetes RBAC.


# Kaptn Server/Routes Refactor — Best Practice Design

## Overview
This design resolves circular imports between `internal/api` and `internal/server` while providing a clean separation of concerns. It allows handlers to move out of `internal/api` without breaking functionality and positions the codebase for future domain-driven organization.

---

## 1. Layering

- **Transport (HTTP)**: `internal/api/...`  
  Routing tables, middleware, request/response binding, error → HTTP mapping. **No business logic**.

- **Application / Services**: `internal/services/...`  
  Use-case layer (pods, timeseries, auth, etc.). Pure Go interfaces + orchestrations.

- **Infrastructure**: `internal/k8s`, `internal/timeseries`, `internal/auth/...`  
  Concrete adapters (clients, stores).

- **Server (HTTP runtime)**: `internal/server`  
  HTTP handlers (thin), DI/wiring, router instance, lifecycle.

---

## 2. Dependency Flow

- `internal/api/routes` → **contracts only** → `server` (small handler interfaces; no concrete types)
- `server` → `api/routes` (to mount routes) and → `services` (interfaces)
- `services` → `infrastructure` (interfaces implemented by infra)
- `api/middleware` → used by `routes` only

---

## 3. Interface Ownership

- **Routes own handler contracts**  
  Tiny interfaces that describe what routes need. Routes never import `server`.

- **Server owns service dependencies**  
  Defines interfaces like `K8sService`, `TimeseriesService`, and injects them.

- **Infrastructure implements service interfaces**

---

## 4. DTOs and Errors

- Transport DTOs (bind/unbind, validation) live under `internal/api/...`.
- Domain models live under `services/infrastructure`.
- Centralize HTTP error encoding so domain errors map cleanly to status codes.

---

## 5. Middleware

- Keep middleware in `internal/api/middleware`.
- Middleware should be framework-pure and not import `server`.

---

## 6. Construction / Dependency Injection

- `server.New(deps Deps)` where `Deps` is a struct of interfaces (logger, k8s, timeseries, auth, etc.).
- `SetupRoutes()` mounts all tiers by passing `s` (the server) to `routes.Mount*` functions.

---

## 7. Testing

- **Handlers**: use `httptest` with mocked service interfaces.
- **Services**: unit test with fake infrastructure adapters.

---

## 8. File/Package Layout

```
internal/
├─ api/
│  ├─ routes/
│  │  ├─ contracts.go      # tiny handler interfaces used by routes
│  │  ├─ api.go            # MountAll
│  │  ├─ public.go
│  │  ├─ admin.go
│  │  ├─ read.go
│  │  ├─ write.go
│  │  ├─ apply.go
│  │  ├─ system.go
│  │  └─ static.go
│  └─ middleware/
├─ server/
│  ├─ server.go            # Server struct, New(), SetupRoutes()
│  └─ handlers_*.go        # thin HTTP handlers (moved from api)
├─ services/
│  ├─ k8s.go               # K8sService interface
│  ├─ timeseries.go        # TimeseriesService interface
│  └─ auth.go              # AuthService interface
└─ infrastructure/
   ├─ k8s/
   ├─ timeseries/
   └─ auth/
```

---

## 9. Minimal Code Examples

```go
// internal/api/routes/contracts.go
package routes

import "net/http"

type PublicHandlers interface {
	HandleLogin(http.ResponseWriter, *http.Request)
	HandleAuthCallback(http.ResponseWriter, *http.Request)
	HandleLogout(http.ResponseWriter, *http.Request)
}

type SystemHandlers interface {
	HandleHealth(http.ResponseWriter, *http.Request)
	HandleVersion(http.ResponseWriter, *http.Request)
}
```

```go
// internal/api/routes/public.go
package routes

import "github.com/go-chi/chi/v5"

func MountPublic(r chi.Router, h PublicHandlers) {
	r.Post("/auth/login",   h.HandleLogin)
	r.Get("/auth/callback", h.HandleAuthCallback)
	r.Post("/auth/logout",  h.HandleLogout)
}
```

```go
// internal/api/routes/api.go
package routes

import "github.com/go-chi/chi/v5"

type Tiers struct {
	Public PublicHandlers
	System SystemHandlers
	// Admin, Read, Write, Apply, Static...
}

func MountAll(r chi.Router, t Tiers) {
	MountPublic(r, t.Public)
	MountSystem(r, t.System)
	// ...other mounts
}
```

```go
// internal/server/server.go
package server

import (
	"github.com/go-chi/chi/v5"
	"your/module/internal/api/routes"
)

type K8sService interface { /* ... */ }
type TimeseriesService interface { /* ... */ }
type AuthService interface { /* ... */ }

type Deps struct {
	K8s        K8sService
	Timeseries TimeseriesService
	Auth       AuthService
}

type Server struct {
	router *chi.Mux
	Deps
}

var (
	_ routes.PublicHandlers = (*Server)(nil)
	_ routes.SystemHandlers = (*Server)(nil)
)

func New(d Deps) *Server {
	return &Server{router: chi.NewMux(), Deps: d}
}

func (s *Server) SetupRoutes() {
	routes.MountAll(s.router, routes.Tiers{
		Public: s,
		System: s,
	})
}
```

```go
// internal/server/handlers_auth.go
package server

import "net/http"

func (s *Server) HandleLogin(w http.ResponseWriter, r *http.Request)        { /* call s.Auth */ }
func (s *Server) HandleAuthCallback(w http.ResponseWriter, r *http.Request) { /* ... */ }
func (s *Server) HandleLogout(w http.ResponseWriter, r *http.Request)       { /* ... */ }
```

---

## 10. Do / Don’t

- **Do**: keep routes tiny and framework-centric.  
- **Do**: keep handlers thin; call services.  
- **Do**: define service interfaces near the consumer (`server`); infra implements them.  
- **Don’t**: let `routes` import `server`.  
- **Don’t**: expose concrete `Server` to routes; only pass interfaces.  
- **Don’t**: leak transport DTOs into services.

---

## Summary

This structure unblocks the current refactor, resolves the circular import problem, and positions Kaptn for domain-driven growth.  
It emphasizes **thin handlers, strong interfaces, and one-way dependencies** while keeping testing simple and clean.

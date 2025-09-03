# Server Package Extraction Plan - Option 1 Implementation

## Overview
This plan addresses the circular import issue in the `refactor-routes` branch by extracting the Server struct and handlers from `internal/api` into a new `internal/server` package. This enables clean separation of concerns while maintaining all existing functionality.

## Current State Analysis
- ✅ Mechanical route migration completed
- ✅ Routes properly organized by tier (public, admin, read, write, apply, system, static)
- ❌ Blocked by circular import: `internal/api` ↔ `internal/api/routes`
- ❌ Runtime panics due to type casting issues
- ✅ All tests pass with workarounds

## Target Architecture
```
internal/
├── server/                    # NEW: Core server logic
│   ├── server.go             # Server struct, constructor, lifecycle
│   ├── handlers_auth.go      # Public authentication handlers
│   ├── handlers_admin.go     # Admin-only handlers
│   ├── handlers_read.go      # Read-only handlers
│   ├── handlers_write.go     # Write operation handlers
│   ├── handlers_apply.go     # Apply operation handlers
│   ├── handlers_system.go    # System health/metrics handlers
│   ├── handlers_static.go    # Static file serving handlers
│   └── interfaces.go         # Handler interfaces for each tier
├── api/
│   ├── routes/               # EXISTING: Clean routing package
│   │   ├── api.go           # Main orchestration
│   │   ├── public.go        # Public tier routes
│   │   ├── admin.go         # Admin tier routes
│   │   ├── read.go          # Read tier routes
│   │   ├── write.go         # Write tier routes
│   │   ├── apply.go         # Apply tier routes
│   │   ├── system.go        # System tier routes
│   │   └── static.go        # Static tier routes
│   └── middleware/           # EXISTING: Middleware package
```

## Dependency Flow (No Circular Imports)
- `internal/server` → `internal/api/routes` (server uses routes for setup)
- `internal/api/routes` → `internal/server` (routes use interfaces only)
- `internal/api/middleware` ← `internal/api/routes` (routes use middleware)

---

## Phase 1: Create Server Package Foundation
**Estimated Time**: 30 minutes

### 1.1 Create Package Structure
```bash
mkdir -p internal/server
```

### 1.2 Move Server Struct and Core Logic
- Create `internal/server/server.go`
- Move `Server` struct from `internal/api/server.go`
- Move constructor function (`NewServer` → `New`)
- Move lifecycle methods (`Start`, `Stop`, `Shutdown`)
- Update import statements
- Keep router setup method stub

### 1.3 Verify Basic Compilation
```bash
go build ./cmd/kaptn
```

**Deliverables**:
- [ ] `internal/server/server.go` created
- [ ] Server struct moved successfully
- [ ] Basic compilation passes
- [ ] No functionality changes yet

---

## Phase 2: Extract and Export Handler Methods
**Estimated Time**: 2 hours

### 2.1 Move Handler Files
Move all existing `handler_*.go` files from `internal/api/` into `internal/server/`.  I handled this for you but did not update code dependencies, references.
Do not attempt to reorganize them into domain-specific groups at this stage — just preserve the existing file structure and names.

### 2.2 Preserve and Export Handler Methods
For each handler method:
1. Keep the implementation exactly the same.
2. If the method is unexported (e.g., `handleXxx`), rename it to exported form (`HandleXxx`) so it is accessible.
3. Ensure middleware and existing functionality are preserved.

**Example Transform**:
```go
// FROM: internal/api/server.go
func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
    // implementation
}

// TO: internal/server/handlers_auth.go
func (s *Server) HandleLogin(w http.ResponseWriter, r *http.Request) {
    // same implementation
}

### 2.3 Server/Interface Setup
- Update the new `Server` interface and setup so there are no circular imports.
- Ensure all routes in `internal/api/routes/` correctly call the moved `HandleXxx` methods.

### 2.4 Verification
- [ ] All handler files are moved to `internal/server/`
- [ ] All handlers compile with `HandleXxx` naming
- [ ] Middleware and functionality remain intact
- [ ] Build passes without circular import issues

---

## Phase 3: Define Handler Interfaces
**Estimated Time**: 45 minutes

### 3.1 Create Interface Definitions
Create `internal/server/interfaces.go` with one interface per tier:

```go
type PublicHandlers interface {
    HandleLogin(w http.ResponseWriter, r *http.Request)
    HandleAuthCallback(w http.ResponseWriter, r *http.Request)
    // ... all 9 public handlers
}

type AdminHandlers interface {
    HandleAuthzPreview(w http.ResponseWriter, r *http.Request)
    // ... all 4 admin handlers
}

// ... interfaces for Read, Write, Apply, System, Static tiers
```

### 3.2 Verify Interface Compliance
Ensure the Server struct implements all interfaces:
```go
var _ PublicHandlers = (*Server)(nil)
var _ AdminHandlers = (*Server)(nil)
// ... for all interfaces
```

**Deliverables**:
- [ ] `interfaces.go` created with all 7 interfaces
- [ ] Interface compliance verified
- [ ] All method signatures match exactly

---

## Phase 4: Update Routes Package
**Estimated Time**: 1 hour

### 4.1 Update Route Mount Functions
Modify each file in `internal/api/routes/` to:
1. Import `internal/server` instead of `internal/api`
2. Accept interface parameters instead of concrete Server type
3. Remove type casting (`s.(*api.Server)`)
4. Use exported handler methods

**Example Transform**:
```go
// FROM: internal/api/routes/public.go
func MountPublic(r chi.Router, s interface{}) {
    server := s.(*api.Server)
    r.Post("/auth/login", server.handleLogin)
}

// TO: internal/api/routes/public.go  
func MountPublic(r chi.Router, handlers server.PublicHandlers) {
    r.Post("/auth/login", handlers.HandleLogin)
}
```

### 4.2 Update All Route Files
- `public.go` → Use `server.PublicHandlers`
- `admin.go` → Use `server.AdminHandlers`
- `read.go` → Use `server.ReadHandlers`
- `write.go` → Use `server.WriteHandlers`
- `apply.go` → Use `server.ApplyHandlers`
- `system.go` → Use `server.SystemHandlers`
- `static.go` → Use `server.StaticHandlers`

### 4.3 Update Main Orchestration
Update `internal/api/routes/api.go` to use new signatures.

**Deliverables**:
- [ ] All 7 route files updated
- [ ] Interface-based parameters implemented
- [ ] Type casting removed
- [ ] Middleware integration preserved

---

## Phase 5: Update Server Route Setup
**Estimated Time**: 15 minutes

### 5.1 Update SetupRoutes Method
In `internal/server/server.go`, update the route setup:

```go
func (s *Server) SetupRoutes() {
    routes.MountPublic(s.router, s)
    routes.MountAdmin(s.router, s)
    routes.MountRead(s.router, s)
    routes.MountWrite(s.router, s)
    routes.MountApply(s.router, s)
    routes.MountSystem(s.router, s)
    routes.MountStatic(s.router, s)
}
```

### 5.2 Import Routes Package
Add import for `internal/api/routes` in server.go.

**Deliverables**:
- [ ] SetupRoutes method updated
- [ ] Routes package imported
- [ ] All mount functions called correctly

---

## Phase 6: Update Application Entry Points  
**Estimated Time**: 15 minutes

### 6.1 Update Main Command
In `cmd/kaptn/main.go`:
1. Change import from `internal/api` to `internal/server`
2. Update constructor call from `api.NewServer()` to `server.New()`

### 6.2 Update Any Other Entry Points
Check for other files that import the old API package:
- Test files
- Other commands
- Example code

**Deliverables**:
- [ ] Main command updated
- [ ] All entry points use new server package
- [ ] No references to old api.Server remain

---

## Phase 7: Clean Up Old API Package
**Estimated Time**: 10 minutes

### 7.1 Remove Old Files
```bash
rm internal/api/server.go
# Remove any other handler files if they exist
```

### 7.2 Preserve Middleware
Keep `internal/api/middleware/` package intact - routes will continue importing from there.

### 7.3 Update Package Documentation
Update any package-level documentation or README files.

**Deliverables**:
- [ ] Old server.go removed
- [ ] Middleware package preserved
- [ ] No dead code remains

---

## Phase 8: Verification and Testing
**Estimated Time**: 30 minutes

### 8.1 Compilation Verification
```bash
go build ./cmd/kaptn
go build ./...
```

### 8.2 Test Suite Execution
```bash
go test ./...
go test -race ./...
```

### 8.3 Circular Import Check
```bash
go mod graph | grep -E "(server.*routes|routes.*server)"
# Should return no results
```

### 8.4 Functionality Testing
- Start server
- Test key endpoints from each tier
- Verify middleware works correctly
- Check error handling

**Deliverables**:
- [ ] All compilation passes
- [ ] All tests pass
- [ ] No circular imports
- [ ] Functionality verified

---

## Risk Mitigation

### Backup Strategy
- Work on existing `refactor-routes` branch
- Create checkpoint commits after each phase
- Keep original `internal/api/server.go` until final verification

### Rollback Plan
If issues arise:
1. Reset to last good commit
2. Address specific issues
3. Continue from that phase

### Testing Strategy
- Run tests after each major phase
- Use `go build` frequently to catch import issues early
- Test compilation before moving large numbers of handlers

---

## Success Criteria

### Technical Goals
- ✅ No circular imports
- ✅ All tests pass
- ✅ Application builds and runs
- ✅ All existing functionality preserved
- ✅ Clean package separation achieved

### Architecture Goals
- ✅ Server logic separated from routing
- ✅ Handlers organized by domain
- ✅ Interface-based routing implemented
- ✅ Middleware integration preserved
- ✅ Maintainable code structure

### Performance Goals
- ✅ No performance regression
- ✅ Same memory footprint
- ✅ No additional runtime overhead

---

## Estimated Total Time: 5 hours

**Breakdown**:
- Phase 1: 30 minutes
- Phase 2: 2 hours (bulk of the work)
- Phase 3: 45 minutes
- Phase 4: 1 hour
- Phase 5: 15 minutes
- Phase 6: 15 minutes
- Phase 7: 10 minutes
- Phase 8: 30 minutes

This plan provides a systematic approach to resolving the circular import issue while maintaining all existing functionality and achieving the desired clean
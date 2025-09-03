package routes

import "net/http"

// PublicHandlers defines the contract for public tier handlers (no authentication required)
type PublicHandlers interface {
	HandleLogin(w http.ResponseWriter, r *http.Request)
	HandleAuthCallback(w http.ResponseWriter, r *http.Request)
	HandleLogout(w http.ResponseWriter, r *http.Request)
	HandleRefresh(w http.ResponseWriter, r *http.Request)
	HandleMe(w http.ResponseWriter, r *http.Request)
	HandleJWKS(w http.ResponseWriter, r *http.Request)
	HandleDebugUser(w http.ResponseWriter, r *http.Request)
	HandlePublicConfig(w http.ResponseWriter, r *http.Request)
}

// AdminHandlers defines the contract for admin tier handlers (authentication required)
type AdminHandlers interface {
	HandleAuthzPreview(w http.ResponseWriter, r *http.Request)
	HandlePermissionsCheck(w http.ResponseWriter, r *http.Request)
	HandleRevokeUserSessions(w http.ResponseWriter, r *http.Request)
	HandleBindingsReload(w http.ResponseWriter, r *http.Request)
	HandleGenericSAR(w http.ResponseWriter, r *http.Request)
}

// SystemHandlers defines the contract for system tier handlers (system health/metrics)
type SystemHandlers interface {
	HandleHealth(w http.ResponseWriter, r *http.Request)
	HandleReady(w http.ResponseWriter, r *http.Request)
	HandleVersion(w http.ResponseWriter, r *http.Request)
}

// Tiers combines all handler interfaces for easy mounting
type Tiers struct {
	Public PublicHandlers
	Admin  AdminHandlers
	System SystemHandlers
	// TODO: Add Read, Write, Apply, Static when ready
}

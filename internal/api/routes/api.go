package routes

import (
    "encoding/json"
    "net/http"

    "github.com/go-chi/chi/v5"
)

// MountAll mounts all API routes using the Tiers pattern
func MountAll(r chi.Router, tiers Tiers) {
    r.Route("/api/v1", func(r chi.Router) {
        // Basic info endpoint (public)
        r.Get("/", func(w http.ResponseWriter, r *http.Request) {
            w.Header().Set("Content-Type", "application/json")
            json.NewEncoder(w).Encode(map[string]string{
                "message": "Kubernetes Admin Dashboard API v1",
                "status":  "ready",
            })
        })

        // Mount public tier (no auth required)
        MountPublic(r, tiers.Public)

        // Mount admin tier (auth required)
        r.Group(func(r chi.Router) {
            if tiers.MW.RequireAuth != nil {
                r.Use(tiers.MW.RequireAuth)
            }
            if tiers.MW.RequireImpersonation != nil {
                r.Use(tiers.MW.RequireImpersonation)
            }
            MountAdmin(r, tiers.Admin)
        })

        // Mount read tier (auth required, read permissions)
        r.Group(func(r chi.Router) {
            if tiers.MW.RequireAuth != nil {
                r.Use(tiers.MW.RequireAuth)
            }
            if tiers.MW.RequireImpersonation != nil {
                r.Use(tiers.MW.RequireImpersonation)
            }
            MountRead(r, tiers.Read)
        })

        // Mount write tier (auth required). Resource-level write permissions are enforced via SSAR checks in handlers.
        r.Group(func(r chi.Router) {
            if tiers.MW.RequireAuth != nil {
                r.Use(tiers.MW.RequireAuth)
            }
            if tiers.MW.RequireImpersonation != nil {
                r.Use(tiers.MW.RequireImpersonation)
            }
            MountWrite(r, tiers.Write)
        })

        // Mount apply tier (auth required). Write capability enforced with SSAR checks.
        r.Group(func(r chi.Router) {
            if tiers.MW.RequireAuth != nil {
                r.Use(tiers.MW.RequireAuth)
            }
            if tiers.MW.RequireImpersonation != nil {
                r.Use(tiers.MW.RequireImpersonation)
            }
            MountApply(r, tiers.Apply)
        })
    })

    // Mount system routes (outside /api/v1)
    MountSystem(r, tiers.System)

    // Mount static routes (SPA catch-all, outside /api/v1)
    MountStatic(r, tiers.Static)
}

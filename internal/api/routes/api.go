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
		MountAdmin(r, tiers.Admin)

		// TODO: Mount other tiers when ready
		// MountRead(r, tiers.Read)
		// MountWrite(r, tiers.Write)
		// MountApply(r, tiers.Apply)
	})

	// Mount system routes (outside /api/v1)
	MountSystem(r, tiers.System)
}

package routes

import (
	"github.com/go-chi/chi/v5"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

// MountSystem mounts system routes (/healthz, /readyz, /version, /metrics)
func MountSystem(r chi.Router, handlers SystemHandlers) {
	// Health endpoints
	r.Get("/healthz", handlers.HandleHealth)
	r.Get("/readyz", handlers.HandleReady)

	// Version endpoint
	r.Get("/version", handlers.HandleVersion)

	// Prometheus metrics endpoint
	r.Handle("/metrics", promhttp.Handler())
}

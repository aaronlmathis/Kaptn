package api

import (
	"encoding/json"
	"net/http"

	"github.com/aaronlmathis/kaptn/internal/auth"
	"github.com/aaronlmathis/kaptn/internal/authz"
	"go.uber.org/zap"
)

// handleAuthzCapabilities handles POST /api/v1/authz/capabilities
func (s *Server) handleAuthzCapabilities(w http.ResponseWriter, r *http.Request) {
	// Get user from session
	user, ok := auth.UserFromContext(r.Context())
	if !ok || user == nil {
		s.logger.Error("User not found in context for authz capabilities")
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Parse request body
	var req authz.CapabilityRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.logger.Error("Failed to decode capability request", zap.Error(err))
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Validate request
	if len(req.Features) == 0 {
		http.Error(w, "No features specified", http.StatusBadRequest)
		return
	}

	// Get impersonated client for the user using the configured username format
	usernameFormat := "{email}" // Default format
	if s.config.Security.UsernameFormat != "" {
		usernameFormat = s.config.Security.UsernameFormat
	}

	impersonatedClients, err := s.impersonationMgr.BuildClientsFromUser(user, usernameFormat)
	if err != nil {
		s.logger.Error("Failed to get impersonated clients",
			zap.Error(err),
			zap.String("user_id", user.ID))
		http.Error(w, "Failed to create impersonated client", http.StatusInternalServerError)
		return
	}

	// Check capabilities using the capability service
	result, err := s.capabilityService.CheckCapabilities(
		r.Context(),
		impersonatedClients.Client(),
		req,
		user.ID,
		user.Groups,
	)
	if err != nil {
		s.logger.Error("Failed to check capabilities",
			zap.Error(err),
			zap.String("user_id", user.ID),
			zap.Strings("features", req.Features))
		http.Error(w, "Failed to check capabilities", http.StatusInternalServerError)
		return
	}

	// Set response headers
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")

	// Encode and send response
	if err := json.NewEncoder(w).Encode(result); err != nil {
		s.logger.Error("Failed to encode capability response", zap.Error(err))
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	s.logger.Debug("Capability check completed successfully",
		zap.String("user_id", user.ID),
		zap.Int("features_requested", len(req.Features)),
		zap.Int("features_allowed", s.countAllowedCapabilities(result.Caps)),
		zap.String("namespace", req.Namespace))
}

// countAllowedCapabilities counts how many capabilities are allowed
func (s *Server) countAllowedCapabilities(caps map[string]bool) int {
	count := 0
	for _, allowed := range caps {
		if allowed {
			count++
		}
	}
	return count
}

// handleAuthzCapabilitiesRegistry handles GET /api/v1/authz/capabilities/registry
func (s *Server) handleAuthzCapabilitiesRegistry(w http.ResponseWriter, r *http.Request) {
	// Return all available capabilities
	capabilities := authz.GetAllCapabilities()

	response := map[string]interface{}{
		"capabilities": capabilities,
		"count":        len(capabilities),
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(response); err != nil {
		s.logger.Error("Failed to encode capabilities registry response", zap.Error(err))
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
}

// handleAuthzCapabilitiesStats handles GET /api/v1/authz/capabilities/stats
func (s *Server) handleAuthzCapabilitiesStats(w http.ResponseWriter, r *http.Request) {
	// Get cache stats from capability service
	stats := s.capabilityService.GetCacheStats()

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(stats); err != nil {
		s.logger.Error("Failed to encode capability stats response", zap.Error(err))
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
}

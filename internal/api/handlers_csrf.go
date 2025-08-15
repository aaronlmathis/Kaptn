package api

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"time"

	"github.com/aaronlmathis/kaptn/internal/auth"
	"go.uber.org/zap"
)

// CSRFTokenResponse represents the response for CSRF token requests
type CSRFTokenResponse struct {
	Token string `json:"token"`
}

// generateCSRFToken generates a secure random CSRF token
func generateCSRFToken() (string, error) {
	bytes := make([]byte, 32) // 32 bytes = 64 hex characters
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return hex.EncodeToString(bytes), nil
}

// handleCSRFToken handles CSRF token generation requests
func (s *Server) handleCSRFToken(w http.ResponseWriter, r *http.Request) {
	// Verify user is authenticated
	user, ok := auth.UserFromContext(r.Context())
	if !ok || user == nil {
		s.logger.Warn("CSRF token request without authentication")
		http.Error(w, "Authentication required", http.StatusUnauthorized)
		return
	}

	// Generate new CSRF token
	token, err := generateCSRFToken()
	if err != nil {
		s.logger.Error("Failed to generate CSRF token", zap.Error(err))
		http.Error(w, "Failed to generate token", http.StatusInternalServerError)
		return
	}

	// Store token in middleware with 1 hour expiration
	if s.authMiddleware != nil {
		s.authMiddleware.StoreCSRFToken(token, time.Hour)
	}

	// Return token as JSON
	response := CSRFTokenResponse{
		Token: token,
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(response); err != nil {
		s.logger.Error("Failed to encode CSRF token response", zap.Error(err))
		http.Error(w, "Failed to encode response", http.StatusInternalServerError)
		return
	}

	s.logger.Debug("CSRF token generated", 
		zap.String("userId", user.ID),
		zap.String("tokenPrefix", token[:8]+"..."))
}

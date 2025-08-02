package api

import (
	"encoding/json"
	"net/http"

	"github.com/aaronlmathis/k8s-admin-dash/internal/auth"
	"github.com/go-chi/chi/v5/middleware"
	"go.uber.org/zap"
)

// Authentication handlers

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	// If auth mode is none, provide a development response
	if s.config.Security.AuthMode == "none" {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"authMode": "none",
			"message":  "Authentication disabled in development mode",
			"devMode":  true,
		})
		return
	}

	if s.oidcClient == nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "OIDC not configured",
			"code":  "OIDC_NOT_CONFIGURED",
		})
		return
	}

	// Generate state parameter for security
	state := "kad_" + middleware.GetReqID(r.Context())

	// Get authorization URL
	authURL := s.oidcClient.GetAuthURL(state)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"authUrl": authURL,
		"state":   state,
	})
}

func (s *Server) handleAuthCallback(w http.ResponseWriter, r *http.Request) {
	if s.oidcClient == nil {
		http.Error(w, "OIDC not configured", http.StatusBadRequest)
		return
	}

	// Parse callback parameters
	var callbackData struct {
		Code  string `json:"code"`
		State string `json:"state"`
	}

	if err := json.NewDecoder(r.Body).Decode(&callbackData); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Exchange code for tokens
	token, err := s.oidcClient.ExchangeCode(r.Context(), callbackData.Code)
	if err != nil {
		s.logger.Error("Failed to exchange code for token", zap.Error(err))
		http.Error(w, "Failed to exchange code", http.StatusBadRequest)
		return
	}

	// Extract ID token
	idToken, ok := token.Extra("id_token").(string)
	if !ok {
		http.Error(w, "No ID token in response", http.StatusBadRequest)
		return
	}

	// Verify the ID token and get user info
	user, err := s.oidcClient.VerifyToken(r.Context(), idToken)
	if err != nil {
		s.logger.Error("Failed to verify ID token", zap.Error(err))
		http.Error(w, "Invalid token", http.StatusUnauthorized)
		return
	}

	s.logger.Info("User authenticated via OIDC",
		zap.String("userId", user.ID),
		zap.String("email", user.Email),
		zap.Strings("groups", user.Groups))

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":      true,
		"user":         user,
		"access_token": token.AccessToken,
		"id_token":     idToken,
		"expires_at":   token.Expiry,
	})
}

func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	// For stateless JWT tokens, logout is handled client-side
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"success": "true",
		"message": "Logged out successfully",
	})
}

func (s *Server) handleMe(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok || user == nil {
		http.Error(w, "Not authenticated", http.StatusUnauthorized)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"authenticated": true,
		"user":          user,
	})
}

package api

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/aaronlmathis/kaptn/internal/auth"
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

	// Generate PKCE parameters for security
	pkceParams, err := auth.GeneratePKCEParams()
	if err != nil {
		s.logger.Error("Failed to generate PKCE parameters", zap.Error(err))
		http.Error(w, "Failed to generate login parameters", http.StatusInternalServerError)
		return
	}

	// Store PKCE parameters for later verification
	auth.StorePKCEParams(pkceParams)

	// Get authorization URL with PKCE
	authURL := s.oidcClient.GetAuthURL(pkceParams.State, pkceParams)

	s.logger.Info("Generated login URL",
		zap.String("state", pkceParams.State),
		zap.String("requestId", middleware.GetReqID(r.Context())))

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"authUrl": authURL,
		"state":   pkceParams.State,
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

	// Retrieve and validate PKCE parameters
	pkceParams, exists := auth.GetPKCEParams(callbackData.State)
	if !exists {
		s.logger.Error("Invalid or expired state parameter", zap.String("state", callbackData.State))
		http.Error(w, "Invalid or expired login session", http.StatusBadRequest)
		return
	}

	// Exchange code for tokens with PKCE
	token, err := s.oidcClient.ExchangeCodeWithPKCE(r.Context(), callbackData.Code, pkceParams.CodeVerifier)
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

	// TODO: Validate nonce if your IdP includes it in the ID token
	// This would require enhancing the VerifyToken method to check nonce

	s.logger.Info("User authenticated via OIDC",
		zap.String("userId", user.ID),
		zap.String("email", user.Email),
		zap.Strings("groups", user.Groups))

	// Resolve authorization if authz resolver is available
	// TODO: We'll need to access the authz resolver from the middleware or create a direct reference
	// For now, the middleware will handle authorization resolution on subsequent requests
	s.logger.Debug("User groups will be resolved by middleware on subsequent requests")

	// Create session JWT (this will be enhanced in Phase 3)
	if s.sessionManager != nil {
		sessionToken, err := s.sessionManager.CreateSession(user)
		if err != nil {
			s.logger.Error("Failed to create session", zap.Error(err))
			http.Error(w, "Failed to create session", http.StatusInternalServerError)
			return
		}

		// Set secure session cookie
		s.sessionManager.SetSessionCookie(w, sessionToken, r.TLS != nil)

		// Return success response without sensitive tokens
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true,
			"user": map[string]interface{}{
				"id":     user.ID,
				"email":  user.Email,
				"name":   user.Name,
				"groups": user.Groups,
			},
			"message": "Authentication successful",
		})
	} else {
		// Fallback for Phase 2 (until sessionManager is wired up)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success":      true,
			"user":         user,
			"access_token": token.AccessToken,
			"id_token":     idToken,
			"expires_at":   token.Expiry,
		})
	}
}

func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	// Clear session cookie if session manager exists
	if s.sessionManager != nil {
		s.sessionManager.ClearSessionCookie(w)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"success": "true",
		"message": "Logged out successfully",
	})
}

func (s *Server) handleMe(w http.ResponseWriter, r *http.Request) {
	// User should be available from middleware (session cookie or Bearer token)
	user, ok := auth.UserFromContext(r.Context())
	if !ok || user == nil {
		http.Error(w, "Not authenticated", http.StatusUnauthorized)
		return
	}

	// Determine authentication method for debugging
	authMethod := "unknown"
	if _, err := r.Cookie("kaptn-session"); err == nil && s.sessionManager != nil {
		authMethod = "session_cookie"
	} else if r.Header.Get("Authorization") != "" {
		authMethod = "bearer_token"
	} else if s.config.Security.AuthMode == "header" {
		authMethod = "headers"
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"authenticated": true,
		"user": map[string]interface{}{
			"id":     user.ID,
			"sub":    user.ID, // For debug - show the OIDC subject
			"email":  user.Email,
			"name":   user.Name,
			"groups": user.Groups,
		},
		"session_info": map[string]interface{}{
			"auth_mode":           s.config.Security.AuthMode,
			"auth_method":         authMethod,
			"has_session_manager": s.sessionManager != nil,
			"username_format":     s.config.Security.UsernameFormat,
		},
	})
}

// handleAuthzPreview provides a preview of effective authorization for the current user
func (s *Server) handleAuthzPreview(w http.ResponseWriter, r *http.Request) {
	// User should be available from middleware
	user, ok := auth.UserFromContext(r.Context())
	if !ok || user == nil {
		http.Error(w, "User not authenticated", http.StatusUnauthorized)
		return
	}

	// Get the authz resolver from middleware (if available)
	var effectiveGroups []string
	var username string
	var resolverError string

	if s.authMiddleware != nil && s.config.Security.AuthMode == "oidc" {
		// Try to resolve authorization using the same logic as middleware
		// Note: In a production system, you might want to expose this through the middleware
		// For now, we'll show the current state
		username = user.ID // This would be formatted by the resolver
		effectiveGroups = user.Groups

		// Show what the username format would produce
		if s.config.Security.UsernameFormat != "" {
			format := s.config.Security.UsernameFormat
			username = strings.ReplaceAll(format, "{sub}", user.Sub)
			username = strings.ReplaceAll(username, "{email}", user.Email)
			username = strings.ReplaceAll(username, "{name}", user.Name)
		}
	} else {
		username = user.ID
		effectiveGroups = user.Groups
		resolverError = "Authorization resolver not available"
	}

	w.Header().Set("Content-Type", "application/json")
	response := map[string]interface{}{
		"user": map[string]interface{}{
			"id":    user.ID,
			"sub":   user.Sub,
			"email": user.Email,
			"name":  user.Name,
		},
		"authorization": map[string]interface{}{
			"username":         username,
			"effective_groups": effectiveGroups,
			"authz_mode":       s.config.Authz.Mode,
			"bindings_source":  s.config.Bindings.Source,
		},
	}

	if resolverError != "" {
		response["error"] = resolverError
	}

	json.NewEncoder(w).Encode(response)
}

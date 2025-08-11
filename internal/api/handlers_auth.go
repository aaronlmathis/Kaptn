package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

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
		s.logAuthEvent(r, "", "callback_failed", "OIDC not configured", nil)
		http.Error(w, "OIDC not configured", http.StatusBadRequest)
		return
	}

	// Parse callback parameters from URL query (not JSON body)
	code := r.URL.Query().Get("code")
	state := r.URL.Query().Get("state")

	if code == "" || state == "" {
		s.logAuthEvent(r, "", "callback_failed", "Missing code or state parameter", nil)
		http.Error(w, "Missing code or state parameter", http.StatusBadRequest)
		return
	}

	// Retrieve and validate PKCE parameters
	pkceParams, exists := auth.GetPKCEParams(state)
	if !exists {
		s.logger.Error("Invalid or expired state parameter", zap.String("state", state))
		s.logAuthEvent(r, "", "callback_failed", "Invalid or expired login session", nil)
		http.Error(w, "Invalid or expired login session", http.StatusBadRequest)
		return
	}

	// Exchange code for tokens with PKCE
	token, err := s.oidcClient.ExchangeCodeWithPKCE(r.Context(), code, pkceParams.CodeVerifier)
	if err != nil {
		s.logger.Error("Failed to exchange code for token", zap.Error(err))
		s.logAuthEvent(r, "", "token_exchange_failed", err.Error(), err)
		http.Error(w, "Failed to exchange code", http.StatusBadRequest)
		return
	}

	// Extract ID token
	idToken, ok := token.Extra("id_token").(string)
	if !ok {
		s.logAuthEvent(r, "", "callback_failed", "No ID token in response", nil)
		http.Error(w, "No ID token in response", http.StatusBadRequest)
		return
	}

	// Verify the ID token and get user info
	user, err := s.oidcClient.VerifyToken(r.Context(), idToken)
	if err != nil {
		s.logger.Error("Failed to verify ID token", zap.Error(err))
		s.logAuthEvent(r, "", "token_verification_failed", err.Error(), err)
		http.Error(w, "Invalid token", http.StatusUnauthorized)
		return
	}

	s.logger.Info("User authenticated via OIDC",
		zap.String("userId", user.ID),
		zap.String("email", user.Email),
		zap.Strings("groups", user.Groups))

	// Log successful authentication
	s.logAuthEvent(r, user.ID, "login_success", "OIDC authentication successful", nil)

	// Resolve authorization if authz resolver is available
	// TODO: We'll need to access the authz resolver from the middleware or create a direct reference
	// For now, the middleware will handle authorization resolution on subsequent requests
	s.logger.Debug("User groups will be resolved by middleware on subsequent requests")

	// Create dual token session (enhanced for Phase 3)
	if s.sessionManager != nil {
		accessToken, refreshToken, err := s.sessionManager.CreateDualTokenSession(user, r)
		if err != nil {
			s.logger.Error("Failed to create session", zap.Error(err))
			s.logAuthEvent(r, user.ID, "session_creation_failed", err.Error(), err)
			http.Error(w, "Failed to create session", http.StatusInternalServerError)
			return
		}

		// Set secure session cookies
		s.sessionManager.SetDualTokenCookies(w, accessToken, refreshToken, r.TLS != nil)

		// Log successful session creation
		s.logAuthEvent(r, user.ID, "session_created", "Dual token session created", nil)

		// Redirect to dashboard after successful login
		http.Redirect(w, r, "/", http.StatusFound)
		return
	} else {
		// Fallback for Phase 2 (until sessionManager is wired up)
		// Still redirect to dashboard
		http.Redirect(w, r, "/", http.StatusFound)
		return
	}
}

func (s *Server) handleRefresh(w http.ResponseWriter, r *http.Request) {
	// Only allow POST requests
	if r.Method != http.MethodPost {
		s.logAuthEvent(r, "", "refresh_failed", "Method not allowed", nil)
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	if s.sessionManager == nil {
		s.logAuthEvent(r, "", "refresh_failed", "Session manager not available", nil)
		http.Error(w, "Session manager not available", http.StatusInternalServerError)
		return
	}

	// Attempt to refresh tokens using refresh token from cookies
	newAccessToken, newRefreshToken, userID, err := s.sessionManager.RefreshSessionFromToken(r)
	if err != nil {
		s.logger.Warn("Token refresh failed", zap.Error(err))
		s.logAuthEvent(r, userID, "refresh_failed", err.Error(), err)

		// Clear cookies and return 401 to force re-authentication
		s.sessionManager.ClearSessionCookie(w)
		http.Error(w, "Token refresh failed", http.StatusUnauthorized)
		return
	}

	// Set new cookies
	s.sessionManager.SetDualTokenCookies(w, newAccessToken, newRefreshToken, r.TLS != nil)

	s.logger.Info("Tokens refreshed successfully",
		zap.String("user_id", userID))
	s.logAuthEvent(r, userID, "refresh_success", "Tokens refreshed successfully", nil)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "Tokens refreshed successfully",
	})
}

func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	// Get current user for session invalidation
	user, userOk := auth.UserFromContext(r.Context())

	userID := ""
	if userOk && user != nil {
		userID = user.ID
	}

	// Get current refresh token to specifically revoke its family
	if s.sessionManager != nil {
		// Get refresh token from cookies
		_, refreshToken := s.sessionManager.GetTokenManager().GetTokensFromCookies(r)
		if refreshToken != "" {
			// Try to get the family ID from the refresh token and invalidate it
			clientHash := s.sessionManager.GetTokenManager().GenerateClientHash(r)
			if claims, family, err := s.sessionManager.GetTokenManager().ValidateRefreshToken(refreshToken, clientHash); err == nil {
				s.sessionManager.GetTokenManager().InvalidateRefreshFamily(family.FamilyID)
				s.logger.Info("Refresh token family invalidated on logout",
					zap.String("user_id", userID),
					zap.String("family_id", family.FamilyID),
					zap.String("token_id", claims.TokenID))
			}
		}

		// Clear session cookies
		s.sessionManager.ClearSessionCookie(w)

		// Invalidate all user sessions if we have user context
		if userOk && user != nil {
			s.sessionManager.InvalidateUserSessions(user.ID)
			s.logger.Info("User sessions invalidated on logout",
				zap.String("user_id", user.ID))
			s.logAuthEvent(r, user.ID, "logout_success", "All user sessions invalidated", nil)
		} else {
			s.logAuthEvent(r, userID, "logout_success", "Session cookies cleared", nil)
		}
	} else {
		s.logAuthEvent(r, userID, "logout_partial", "Session manager not available", nil)
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
			"id":      user.ID,
			"sub":     user.ID, // For debug - show the OIDC subject
			"email":   user.Email,
			"name":    user.Name,
			"picture": user.Picture,
			"groups":  user.Groups,
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

// handleRevokeUserSessions handles POST /api/v1/auth/revoke-user-sessions
// Admin endpoint to revoke all sessions for a specific user
func (s *Server) handleRevokeUserSessions(w http.ResponseWriter, r *http.Request) {
	// Only allow POST requests
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Verify current user has admin permissions
	currentUser, ok := auth.UserFromContext(r.Context())
	if !ok || currentUser == nil {
		http.Error(w, "Not authenticated", http.StatusUnauthorized)
		return
	}

	// Check if user has admin role (basic authorization check)
	hasAdminRole := false
	for _, group := range currentUser.Groups {
		if strings.Contains(strings.ToLower(group), "admin") {
			hasAdminRole = true
			break
		}
	}

	if !hasAdminRole {
		s.logAuthEvent(r, currentUser.ID, "revoke_sessions_denied", "Insufficient permissions", nil)
		http.Error(w, "Insufficient permissions", http.StatusForbidden)
		return
	}

	// Parse request body
	var requestBody struct {
		UserID string `json:"user_id"`
	}

	if err := json.NewDecoder(r.Body).Decode(&requestBody); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if requestBody.UserID == "" {
		http.Error(w, "User ID is required", http.StatusBadRequest)
		return
	}

	if s.sessionManager == nil {
		http.Error(w, "Session manager not available", http.StatusInternalServerError)
		return
	}

	// Revoke all sessions for the specified user
	s.sessionManager.InvalidateUserSessions(requestBody.UserID)

	s.logger.Info("Admin revoked user sessions",
		zap.String("admin_user_id", currentUser.ID),
		zap.String("target_user_id", requestBody.UserID))

	s.logAuthEvent(r, currentUser.ID, "admin_revoke_sessions", 
		fmt.Sprintf("Revoked all sessions for user %s", requestBody.UserID), nil)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": fmt.Sprintf("All sessions revoked for user %s", requestBody.UserID),
		"revoked_by": currentUser.ID,
	})
}

// handlePublicConfig handles GET /api/v1/config - returns public configuration
func (s *Server) handlePublicConfig(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	response := map[string]interface{}{
		"auth": map[string]interface{}{
			"mode": s.config.Security.AuthMode,
		},
	}

	json.NewEncoder(w).Encode(response)
}

// handleJWKS provides the JSON Web Key Set for token verification
func (s *Server) handleJWKS(w http.ResponseWriter, r *http.Request) {
	if s.sessionManager == nil {
		http.Error(w, "Session manager not available", http.StatusInternalServerError)
		return
	}

	tokenManager := s.sessionManager.GetTokenManager()
	if tokenManager == nil {
		http.Error(w, "Token manager not available", http.StatusInternalServerError)
		return
	}

	// Get public key in PEM format
	publicKeyPEM, err := tokenManager.GetPublicKeyPEM()
	if err != nil {
		s.logger.Error("Failed to get public key", zap.Error(err))
		http.Error(w, "Failed to get public key", http.StatusInternalServerError)
		return
	}

	// Create JWK response (simplified - in production, use proper JWK library)
	jwk := map[string]interface{}{
		"kty": "RSA",
		"use": "sig",
		"kid": tokenManager.GetKeyID(),
		"alg": "RS256",
		"pem": publicKeyPEM, // Include PEM for easier verification
	}

	response := map[string]interface{}{
		"keys": []interface{}{jwk},
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "public, max-age=3600") // Cache for 1 hour
	json.NewEncoder(w).Encode(response)
}

// logAuthEvent logs authentication events for audit purposes
func (s *Server) logAuthEvent(r *http.Request, userID, eventType, message string, err error) {
	requestID := middleware.GetReqID(r.Context())
	if requestID == "" {
		requestID = "unknown"
	}

	// Get trace ID from context if available
	traceID := ""
	if tid, ok := r.Context().Value("trace_id").(string); ok {
		traceID = tid
	}

	auditFields := []zap.Field{
		zap.String("event_type", "authentication"),
		zap.String("auth_event", eventType),
		zap.String("request_id", requestID),
		zap.String("trace_id", traceID),
		zap.String("user_id", userID),
		zap.String("method", r.Method),
		zap.String("path", r.URL.Path),
		zap.String("client_ip", r.RemoteAddr),
		zap.String("user_agent", r.Header.Get("User-Agent")),
		zap.String("message", message),
		zap.Time("timestamp", time.Now()),
	}

	if err != nil {
		auditFields = append(auditFields, zap.Error(err))
		s.logger.Error("Authentication event", auditFields...)
	} else {
		s.logger.Info("Authentication event", auditFields...)
	}
}

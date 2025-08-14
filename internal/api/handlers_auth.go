package api

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/aaronlmathis/kaptn/internal/auth"
	"github.com/go-chi/chi/v5/middleware"
	"go.uber.org/zap"
	authenticationv1 "k8s.io/api/authentication/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
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
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error": "OIDC authentication is not configured",
			"code":  "OIDC_NOT_CONFIGURED",
		})
		return
	}

	// Generate PKCE parameters for security
	pkceParams, err := auth.GeneratePKCEParams()
	if err != nil {
		s.logger.Error("Failed to generate PKCE parameters", zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error": "Unable to initialize authentication. Please try again.",
		})
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
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error": "Authentication service is not configured",
		})
		return
	}

	// Parse callback parameters from URL query (not JSON body)
	code := r.URL.Query().Get("code")
	state := r.URL.Query().Get("state")

	if code == "" || state == "" {
		s.logAuthEvent(r, "", "callback_failed", "Missing code or state parameter", nil)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error": "Invalid authentication response. Please try logging in again.",
		})
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

	s.logger.Info("User after ID token verification",
		zap.String("id", user.ID),
		zap.String("email", user.Email),
		zap.String("name", user.Name),
		zap.String("picture", user.Picture))

	// Also fetch user info from userinfo endpoint to get additional claims like picture
	if token.AccessToken != "" {
		s.logger.Info("Fetching additional user info from userinfo endpoint")
		userInfoUser, err := s.oidcClient.GetUserInfo(r.Context(), token.AccessToken)
		if err != nil {
			s.logger.Warn("Failed to fetch userinfo (continuing with ID token claims)", zap.Error(err))
		} else {
			s.logger.Info("User info from userinfo endpoint",
				zap.String("id", userInfoUser.ID),
				zap.String("email", userInfoUser.Email),
				zap.String("name", userInfoUser.Name),
				zap.String("picture", userInfoUser.Picture))

			// Merge userinfo claims into user object (userinfo takes precedence for profile data)
			if userInfoUser.Picture != "" {
				s.logger.Info("Updating user picture from userinfo",
					zap.String("old_picture", user.Picture),
					zap.String("new_picture", userInfoUser.Picture))
				user.Picture = userInfoUser.Picture
			}
			if userInfoUser.Name != "" {
				user.Name = userInfoUser.Name
			}
			if userInfoUser.Email != "" {
				user.Email = userInfoUser.Email
			}
			s.logger.Info("Final user profile after merging",
				zap.String("id", user.ID),
				zap.String("email", user.Email),
				zap.String("name", user.Name),
				zap.String("picture", user.Picture))
		}
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

		// Use sanitized error response
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error":  "Authentication session expired. Please log in again.",
			"status": http.StatusUnauthorized,
		})
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

	// Debug: Log what we're sending to frontend
	s.logger.Info("Sending user data to frontend via /me endpoint",
		zap.String("id", user.ID),
		zap.String("email", user.Email),
		zap.String("name", user.Name),
		zap.String("picture", user.Picture),
		zap.String("auth_method", authMethod))

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

// handleDebugUser provides detailed debug information about the current user's authentication state
func (s *Server) handleDebugUser(w http.ResponseWriter, r *http.Request) {
	// Get authenticated user (when impersonation isn't set, it's the real login)
	user, ok := auth.UserFromContext(r.Context())
	if !ok || user == nil {
		http.Error(w, "Authentication required", http.StatusUnauthorized)
		return
	}

	// Extract additional context from the request
	authMethod := "unknown"
	if _, err := r.Cookie("kaptn-session"); err == nil && s.sessionManager != nil {
		authMethod = "session_cookie"
	} else if r.Header.Get("Authorization") != "" {
		authMethod = "bearer_token"
	} else if s.config.Security.AuthMode == "header" {
		authMethod = "headers"
	} else if s.config.Security.AuthMode == "none" {
		authMethod = "none_dev_mode"
	}

	// Get request headers for debugging
	requestHeaders := make(map[string]string)
	for key, values := range r.Header {
		if len(values) > 0 {
			// Only include auth-related headers and sanitize sensitive data
			switch key {
			case "Authorization", "X-Forwarded-User", "X-Forwarded-Email", "X-Forwarded-Groups", "X-Remote-User":
				if key == "Authorization" && len(values[0]) > 10 {
					requestHeaders[key] = values[0][:10] + "..." // Truncate token for security
				} else {
					requestHeaders[key] = values[0]
				}
			}
		}
	}

	// Get cookies for debugging (sanitized)
	cookies := make(map[string]string)
	for _, cookie := range r.Cookies() {
		switch cookie.Name {
		case "kaptn-session", "kaptn-access-token", "kaptn-refresh-token":
			if len(cookie.Value) > 10 {
				cookies[cookie.Name] = cookie.Value[:10] + "..." // Truncate for security
			} else {
				cookies[cookie.Name] = cookie.Value
			}
		}
	}

	// Get username with format applied for RBAC lookup
	username := user.ID
	if s.config.Security.UsernameFormat != "" {
		format := s.config.Security.UsernameFormat
		username = strings.ReplaceAll(format, "{sub}", user.Sub)
		username = strings.ReplaceAll(username, "{email}", user.Email)
		username = strings.ReplaceAll(username, "{name}", user.Name)
	}

	// Get RBAC information
	rbacInfo := s.getRBACInfo(r.Context(), username, user.Groups)

	// Get SelfSubjectRulesReview info (whoami equivalent) to show effective Kubernetes identity
	whoamiInfo := map[string]interface{}{
		"error": "No impersonated clients available",
	}

	if s.HasImpersonatedClients(r) {
		if clients, err := s.GetImpersonatedClients(r); err == nil && clients != nil {
			// Get the effective Kubernetes identity from the impersonation config
			config := clients.RESTConfig()

			// Perform SelfSubjectReview to get the effective user identity (whoami)
			whoami, err := clients.Client().AuthenticationV1().SelfSubjectReviews().Create(r.Context(), &authenticationv1.SelfSubjectReview{}, metav1.CreateOptions{})

			if err != nil {
				whoamiInfo = map[string]interface{}{
					"error":                 fmt.Sprintf("SelfSubjectReview failed: %v", err),
					"impersonated_username": config.Impersonate.UserName,
					"impersonated_groups":   config.Impersonate.Groups,
					"impersonated_extra":    config.Impersonate.Extra,
				}
			} else {
				// Extract user info from the response
				userInfo := whoami.Status.UserInfo
				whoamiInfo = map[string]interface{}{
					"effective_username":    userInfo.Username,
					"effective_uid":         userInfo.UID,
					"effective_groups":      userInfo.Groups,
					"effective_extra":       userInfo.Extra,
					"impersonated_username": config.Impersonate.UserName,
					"impersonated_groups":   config.Impersonate.Groups,
					"impersonated_extra":    config.Impersonate.Extra,
					"note":                  "This shows your effective Kubernetes identity via SelfSubjectReview",
				}
			}
		}
	}

	// Build the response with comprehensive debug info
	// Use ID as sub if Sub is empty (fallback for older tokens)
	subValue := user.Sub
	if subValue == "" {
		subValue = user.ID
	}

	response := map[string]interface{}{
		"user": map[string]interface{}{
			"sub":     subValue,
			"id":      user.ID,
			"email":   user.Email,
			"name":    user.Name,
			"picture": user.Picture,
		},
		"groups":              user.Groups,
		"kubernetes_identity": whoamiInfo,
		"rbac":                rbacInfo,
		"extra": map[string]interface{}{
			"auth_mode":                 s.config.Security.AuthMode,
			"auth_method":               authMethod,
			"username_format":           s.config.Security.UsernameFormat,
			"authz_mode":                s.config.Authz.Mode,
			"bindings_source":           s.config.Bindings.Source,
			"request_headers":           requestHeaders,
			"cookies":                   cookies,
			"session_manager_available": s.sessionManager != nil,
			"user_sub_field":            user.Sub, // Show the raw Sub field for debugging
			"user_id_field":             user.ID,  // Show the raw ID field for debugging
			"has_impersonated_clients":  s.HasImpersonatedClients(r),
		},
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// getRBACInfo provides comprehensive RBAC information for the user
func (s *Server) getRBACInfo(ctx context.Context, username string, groups []string) map[string]interface{} {
	rbacInfo := map[string]interface{}{
		"user_bindings":         nil,
		"effective_permissions": []map[string]interface{}{},
		"summary": map[string]interface{}{
			"total_permissions":   0,
			"allowed_permissions": 0,
			"denied_permissions":  0,
			"admin_groups":        []string{"kaptn-admins", "cluster-admins"},
		},
	}

	// Check user bindings if auth middleware is available and has an authz resolver
	if s.authMiddleware != nil {
		if binding, err := s.getAuthzBinding(ctx, username); err == nil {
			rbacInfo["user_bindings"] = map[string]interface{}{
				"found":      true,
				"lookup_key": username,
				"groups":     binding.Groups,
			}

			// Add hash key information for debugging
			hasher := sha256.New()
			hasher.Write([]byte(username))
			hashKey := hex.EncodeToString(hasher.Sum(nil))
			rbacInfo["user_bindings"].(map[string]interface{})["hash_key"] = hashKey
		} else {
			rbacInfo["user_bindings"] = map[string]interface{}{
				"found":      false,
				"lookup_key": username,
				"error":      err.Error(),
			}
		}
	}

	// Check namespace permissions if kubeClient is available
	if s.kubeClient != nil {
		// Convert interface to concrete clientset type
		if clientset, ok := s.kubeClient.(*kubernetes.Clientset); ok {
			permissions, err := GetUserNamespacePermissions(ctx, clientset, username)
			if err == nil {
				// Convert to the format expected by frontend
				var effectivePerms []map[string]interface{}
				totalPerms := 0
				allowedPerms := 0

				for namespace, resourcePerms := range permissions.Permissions {
					// Count permissions for each resource type
					for resource, verbs := range map[string][]string{
						"pods":        resourcePerms.Pods,
						"deployments": resourcePerms.Deployments,
						"services":    resourcePerms.Services,
						"secrets":     resourcePerms.Secrets,
					} {
						for _, verb := range verbs {
							effectivePerms = append(effectivePerms, map[string]interface{}{
								"namespace": namespace,
								"resource":  resource,
								"verb":      verb,
								"allowed":   true,
							})
							totalPerms++
							allowedPerms++
						}
					}
				}

				rbacInfo["effective_permissions"] = effectivePerms
				rbacInfo["summary"].(map[string]interface{})["total_permissions"] = totalPerms
				rbacInfo["summary"].(map[string]interface{})["allowed_permissions"] = allowedPerms
				rbacInfo["summary"].(map[string]interface{})["denied_permissions"] = 0 // We only track allowed perms for now
			} else {
				rbacInfo["permissions_error"] = err.Error()
			}
		} else {
			rbacInfo["permissions_error"] = "Kubernetes client is not a Clientset type"
		}
	}

	// Add group analysis
	adminGroups := []string{"kaptn-admins", "cluster-admins"}
	userAdminGroups := []string{}
	for _, group := range groups {
		for _, adminGroup := range adminGroups {
			if group == adminGroup {
				userAdminGroups = append(userAdminGroups, group)
			}
		}
	}
	rbacInfo["summary"].(map[string]interface{})["user_admin_groups"] = userAdminGroups
	rbacInfo["summary"].(map[string]interface{})["is_admin"] = len(userAdminGroups) > 0

	return rbacInfo
}

// getAuthzBinding is a helper method to access user bindings through the auth middleware
func (s *Server) getAuthzBinding(ctx context.Context, username string) (*auth.UserBinding, error) {
	if s.authMiddleware == nil {
		return nil, fmt.Errorf("auth middleware not available")
	}

	return s.authMiddleware.GetUserBinding(ctx, username)
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
		"success":    true,
		"message":    fmt.Sprintf("All sessions revoked for user %s", requestBody.UserID),
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

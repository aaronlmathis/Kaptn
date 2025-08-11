package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"net/http"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"go.uber.org/zap"
)

// Session represents a user session (legacy - kept for backward compatibility)
type Session struct {
	Sub       string    `json:"sub"`
	Email     string    `json:"email"`
	Name      string    `json:"name"`
	Groups    []string  `json:"groups"`
	IssuedAt  time.Time `json:"issued_at"`
	ExpiresAt time.Time `json:"expires_at"`
}

// SessionManager handles session creation and validation
// This is the legacy session manager - new implementations should use TokenManager
type SessionManager struct {
	logger     *zap.Logger
	secret     []byte
	sessionTTL time.Duration

	// New dual-token system
	tokenManager *TokenManager
}

// NewSessionManager creates a new session manager with dual token support
func NewSessionManager(logger *zap.Logger, secret string, sessionTTL time.Duration) (*SessionManager, error) {
	if len(secret) < 32 {
		return nil, fmt.Errorf("session secret must be at least 32 characters")
	}

	// Create token manager with short access tokens and longer refresh tokens
	accessTokenTTL := 15 * time.Minute    // 15 minute access tokens
	refreshTokenTTL := 7 * 24 * time.Hour // 7 day refresh tokens

	tokenManager, err := NewTokenManager(logger, accessTokenTTL, refreshTokenTTL)
	if err != nil {
		return nil, fmt.Errorf("failed to create token manager: %w", err)
	}

	return &SessionManager{
		logger:       logger,
		secret:       []byte(secret),
		sessionTTL:   sessionTTL,
		tokenManager: tokenManager,
	}, nil
}

// CreateSession creates a new session using the dual token system
func (sm *SessionManager) CreateSession(user *User) (string, error) {
	// This method now creates both access and refresh tokens
	// For backward compatibility, we return the access token

	traceID := generateTraceID()

	// Get current session version
	sessionVer := sm.tokenManager.GetSessionVersion(user.ID)

	// Create access token
	accessToken, err := sm.tokenManager.CreateAccessToken(user, sessionVer, traceID)
	if err != nil {
		return "", fmt.Errorf("failed to create access token: %w", err)
	}

	sm.logger.Debug("Created legacy session",
		zap.String("user_id", user.ID),
		zap.String("trace_id", traceID),
		zap.Int64("session_ver", sessionVer))

	return accessToken, nil
}

// CreateDualTokenSession creates both access and refresh tokens for modern auth flow
func (sm *SessionManager) CreateDualTokenSession(user *User, r *http.Request) (accessToken, refreshToken string, err error) {
	traceID := generateTraceID()
	clientHash := sm.tokenManager.GenerateClientHash(r)

	// Get current session version
	sessionVer := sm.tokenManager.GetSessionVersion(user.ID)

	// Create access token
	accessToken, err = sm.tokenManager.CreateAccessToken(user, sessionVer, traceID)
	if err != nil {
		return "", "", fmt.Errorf("failed to create access token: %w", err)
	}

	// Create refresh token
	refreshToken, _, err = sm.tokenManager.CreateRefreshToken(user, clientHash, "")
	if err != nil {
		return "", "", fmt.Errorf("failed to create refresh token: %w", err)
	}

	sm.logger.Info("Created dual token session",
		zap.String("user_id", user.ID),
		zap.String("trace_id", traceID),
		zap.Int64("session_ver", sessionVer))

	return accessToken, refreshToken, nil
}

// ValidateSession validates and extracts session from JWT token using new token manager
func (sm *SessionManager) ValidateSession(tokenString string) (*Session, error) {
	// Try new token manager first
	claims, err := sm.tokenManager.ValidateAccessToken(tokenString)
	if err == nil {
		// Convert access token claims to legacy session format
		return &Session{
			Sub:       claims.UserID,
			Email:     claims.Email,
			Name:      claims.Name,
			Groups:    claims.Roles, // Use roles as groups for backward compatibility
			IssuedAt:  claims.IssuedAt.Time,
			ExpiresAt: claims.ExpiresAt.Time,
		}, nil
	}

	// Fallback to legacy HMAC validation for existing sessions
	return sm.validateLegacySession(tokenString)
}

// validateLegacySession validates legacy HMAC-signed sessions
func (sm *SessionManager) validateLegacySession(tokenString string) (*Session, error) {
	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		// Verify signing method
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return sm.secret, nil
	})

	if err != nil {
		return nil, fmt.Errorf("failed to parse session token: %w", err)
	}

	if !token.Valid {
		return nil, fmt.Errorf("invalid session token")
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return nil, fmt.Errorf("invalid token claims")
	}

	// Extract session data
	session := &Session{}

	if sub, ok := claims["sub"].(string); ok {
		session.Sub = sub
	}
	if email, ok := claims["email"].(string); ok {
		session.Email = email
	}
	if name, ok := claims["name"].(string); ok {
		session.Name = name
	}

	// Handle groups
	if groupsInterface, ok := claims["groups"]; ok {
		switch groups := groupsInterface.(type) {
		case []interface{}:
			for _, g := range groups {
				if groupStr, ok := g.(string); ok {
					session.Groups = append(session.Groups, groupStr)
				}
			}
		case []string:
			session.Groups = groups
		}
	}

	// Handle timestamps
	if iat, ok := claims["iat"].(float64); ok {
		session.IssuedAt = time.Unix(int64(iat), 0)
	}
	if exp, ok := claims["exp"].(float64); ok {
		session.ExpiresAt = time.Unix(int64(exp), 0)
	}

	// Check expiration
	if time.Now().After(session.ExpiresAt) {
		return nil, fmt.Errorf("session expired")
	}

	return session, nil
}

// SetSessionCookie sets the access token cookie (updated for dual token system)
func (sm *SessionManager) SetSessionCookie(w http.ResponseWriter, tokenString string, secure bool) {
	// This method now sets the access token cookie
	sm.tokenManager.SetAccessTokenCookie(w, tokenString, secure)
}

// SetDualTokenCookies sets both access and refresh token cookies
func (sm *SessionManager) SetDualTokenCookies(w http.ResponseWriter, accessToken, refreshToken string, secure bool) {
	sm.tokenManager.SetAccessTokenCookie(w, accessToken, secure)
	sm.tokenManager.SetRefreshTokenCookie(w, refreshToken, secure)
}

// ClearSessionCookie clears the session cookie (updated for dual token system)
func (sm *SessionManager) ClearSessionCookie(w http.ResponseWriter) {
	// Clear both tokens
	sm.tokenManager.ClearAuthCookies(w)
}

// GetSessionFromCookie extracts session from request cookie (updated for dual token system)
func (sm *SessionManager) GetSessionFromCookie(r *http.Request) (*Session, error) {
	// Try new access token cookie first
	accessToken, _ := sm.tokenManager.GetTokensFromCookies(r)
	if accessToken != "" {
		return sm.ValidateSession(accessToken)
	}

	// Fallback to legacy session cookie
	cookie, err := r.Cookie("kaptn-session")
	if err != nil {
		return nil, fmt.Errorf("no session cookie found")
	}

	return sm.ValidateSession(cookie.Value)
}

// RefreshSession refreshes tokens using the refresh token
func (sm *SessionManager) RefreshSession(r *http.Request, user *User) (accessToken, refreshToken string, err error) {
	_, refreshTokenString := sm.tokenManager.GetTokensFromCookies(r)
	if refreshTokenString == "" {
		return "", "", fmt.Errorf("no refresh token found")
	}

	clientHash := sm.tokenManager.GenerateClientHash(r)
	traceID := generateTraceID()

	return sm.tokenManager.RefreshTokens(refreshTokenString, clientHash, user, traceID)
}

// RefreshSessionFromToken refreshes tokens using only the refresh token (no user required)
func (sm *SessionManager) RefreshSessionFromToken(r *http.Request) (accessToken, refreshToken, userID string, err error) {
	_, refreshTokenString := sm.tokenManager.GetTokensFromCookies(r)
	if refreshTokenString == "" {
		return "", "", "", fmt.Errorf("no refresh token found")
	}

	clientHash := sm.tokenManager.GenerateClientHash(r)
	traceID := generateTraceID()

	return sm.tokenManager.RefreshTokensWithoutUser(refreshTokenString, clientHash, traceID)
}

// InvalidateUserSessions invalidates all sessions for a user
func (sm *SessionManager) InvalidateUserSessions(userID string) {
	sm.tokenManager.InvalidateUserSessions(userID)
}

// GetTokenManager returns the underlying token manager for advanced operations
func (sm *SessionManager) GetTokenManager() *TokenManager {
	return sm.tokenManager
}

// GetMinimalUserFromRequest extracts minimal user data from request for HTML injection
// This is used for server-side HTML injection while keeping tokens HttpOnly
func (sm *SessionManager) GetMinimalUserFromRequest(r *http.Request) *MinimalUser {
	// Try to get session data from access token
	if sm.tokenManager != nil {
		accessToken, _ := sm.tokenManager.GetTokensFromCookies(r)
		if accessToken != "" {
			if claims, err := sm.tokenManager.ValidateAccessToken(accessToken); err == nil {
				return &MinimalUser{
					ID:              claims.UserID,
					Email:           claims.Email,
					Name:            claims.Name,
					Picture:         claims.Picture,
					IsAuthenticated: true,
				}
			}
		}
	}

	// Fallback to legacy session validation
	if session, err := sm.GetSessionFromCookie(r); err == nil {
		return &MinimalUser{
			ID:              session.Sub,
			Email:           session.Email,
			Name:            session.Name,
			IsAuthenticated: true,
		}
	}

	return &MinimalUser{
		IsAuthenticated: false,
	}
}

// MinimalUser represents the minimal user data for frontend injection
type MinimalUser struct {
	ID              string `json:"id"`
	Email           string `json:"email"`
	Name            string `json:"name,omitempty"`
	Picture         string `json:"picture,omitempty"`
	IsAuthenticated bool   `json:"isAuthenticated"`
}

// Shutdown shuts down the session manager
func (sm *SessionManager) Shutdown() {
	if sm.tokenManager != nil {
		sm.tokenManager.Shutdown()
	}
}

// PKCE helper functions

// PKCEParams holds PKCE parameters for OAuth2 flow
type PKCEParams struct {
	CodeVerifier  string
	CodeChallenge string
	State         string
	Nonce         string
}

// GeneratePKCEParams generates PKCE parameters for OAuth2 flow
func GeneratePKCEParams() (*PKCEParams, error) {
	// Generate code verifier (43-128 characters)
	codeVerifier, err := generateRandomString(64)
	if err != nil {
		return nil, fmt.Errorf("failed to generate code verifier: %w", err)
	}

	// Generate code challenge (SHA256 of verifier, base64url encoded)
	hash := sha256.Sum256([]byte(codeVerifier))
	codeChallenge := base64.RawURLEncoding.EncodeToString(hash[:])

	// Generate state (for CSRF protection)
	state, err := generateRandomString(32)
	if err != nil {
		return nil, fmt.Errorf("failed to generate state: %w", err)
	}

	// Generate nonce (for replay protection)
	nonce, err := generateRandomString(32)
	if err != nil {
		return nil, fmt.Errorf("failed to generate nonce: %w", err)
	}

	return &PKCEParams{
		CodeVerifier:  codeVerifier,
		CodeChallenge: codeChallenge,
		State:         state,
		Nonce:         nonce,
	}, nil
}

// generateRandomString generates a cryptographically secure random string
func generateRandomString(length int) (string, error) {
	bytes := make([]byte, length)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(bytes), nil
}

// generateSessionID generates a unique session ID
func generateSessionID() string {
	id, _ := generateRandomString(16) // Ignore error, fallback to timestamp
	if id == "" {
		id = fmt.Sprintf("%d", time.Now().UnixNano())
	}
	return id
}

// generateTraceID generates a unique trace ID for request tracking
func generateTraceID() string {
	id, _ := generateRandomString(8) // Ignore error, fallback to timestamp
	if id == "" {
		id = fmt.Sprintf("trace-%d", time.Now().UnixNano())
	}
	return fmt.Sprintf("trace-%s", id)
}

// Session storage for PKCE state (in-memory for now, can be Redis later)
var pkceStore = make(map[string]*PKCEParams)

// StorePKCEParams stores PKCE parameters temporarily (keyed by state)
func StorePKCEParams(params *PKCEParams) {
	pkceStore[params.State] = params

	// Clean up old entries (simple cleanup)
	go func() {
		time.Sleep(10 * time.Minute)
		delete(pkceStore, params.State)
	}()
}

// GetPKCEParams retrieves and removes PKCE parameters by state
func GetPKCEParams(state string) (*PKCEParams, bool) {
	params, exists := pkceStore[state]
	if exists {
		delete(pkceStore, state) // One-time use
	}
	return params, exists
}

// ToUser converts a Session to a User struct for compatibility
func (s *Session) ToUser() *User {
	return &User{
		ID:     s.Sub,
		Email:  s.Email,
		Name:   s.Name,
		Groups: s.Groups,
		Claims: map[string]interface{}{
			"sub":    s.Sub,
			"email":  s.Email,
			"name":   s.Name,
			"groups": s.Groups,
			"iat":    s.IssuedAt.Unix(),
			"exp":    s.ExpiresAt.Unix(),
		},
	}
}

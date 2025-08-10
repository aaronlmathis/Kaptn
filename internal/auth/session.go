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

// Session represents a user session
type Session struct {
	Sub       string    `json:"sub"`
	Email     string    `json:"email"`
	Name      string    `json:"name"`
	Groups    []string  `json:"groups"`
	IssuedAt  time.Time `json:"issued_at"`
	ExpiresAt time.Time `json:"expires_at"`
}

// SessionManager handles session creation and validation
type SessionManager struct {
	logger     *zap.Logger
	secret     []byte
	sessionTTL time.Duration
}

// NewSessionManager creates a new session manager
func NewSessionManager(logger *zap.Logger, secret string, sessionTTL time.Duration) (*SessionManager, error) {
	if len(secret) < 32 {
		return nil, fmt.Errorf("session secret must be at least 32 characters")
	}

	return &SessionManager{
		logger:     logger,
		secret:     []byte(secret),
		sessionTTL: sessionTTL,
	}, nil
}

// CreateSession creates a new session JWT from user information
func (sm *SessionManager) CreateSession(user *User) (string, error) {
	now := time.Now()
	session := Session{
		Sub:       user.ID,
		Email:     user.Email,
		Name:      user.Name,
		Groups:    user.Groups,
		IssuedAt:  now,
		ExpiresAt: now.Add(sm.sessionTTL),
	}

	// Create JWT token
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub":        session.Sub,
		"email":      session.Email,
		"name":       session.Name,
		"groups":     session.Groups,
		"iat":        session.IssuedAt.Unix(),
		"exp":        session.ExpiresAt.Unix(),
		"session_id": generateSessionID(),
	})

	tokenString, err := token.SignedString(sm.secret)
	if err != nil {
		return "", fmt.Errorf("failed to sign session token: %w", err)
	}

	sm.logger.Debug("Created session",
		zap.String("sub", session.Sub),
		zap.String("email", session.Email),
		zap.Strings("groups", session.Groups),
		zap.Time("expires_at", session.ExpiresAt))

	return tokenString, nil
}

// ValidateSession validates and extracts session from JWT token
func (sm *SessionManager) ValidateSession(tokenString string) (*Session, error) {
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

// SetSessionCookie sets the session cookie on the response
func (sm *SessionManager) SetSessionCookie(w http.ResponseWriter, tokenString string, secure bool) {
	cookie := &http.Cookie{
		Name:     "kaptn-session",
		Value:    tokenString,
		HttpOnly: true,
		Secure:   secure, // Set to true in production with HTTPS
		SameSite: http.SameSiteLaxMode,
		Path:     "/",
		MaxAge:   int(sm.sessionTTL.Seconds()),
	}

	http.SetCookie(w, cookie)
}

// ClearSessionCookie clears the session cookie
func (sm *SessionManager) ClearSessionCookie(w http.ResponseWriter) {
	cookie := &http.Cookie{
		Name:     "kaptn-session",
		Value:    "",
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteLaxMode,
		Path:     "/",
		MaxAge:   -1, // Delete immediately
	}

	http.SetCookie(w, cookie)
}

// GetSessionFromCookie extracts session from request cookie
func (sm *SessionManager) GetSessionFromCookie(r *http.Request) (*Session, error) {
	cookie, err := r.Cookie("kaptn-session")
	if err != nil {
		return nil, fmt.Errorf("no session cookie found")
	}

	return sm.ValidateSession(cookie.Value)
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

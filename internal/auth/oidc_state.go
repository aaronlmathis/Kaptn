package auth

import (
	"encoding/base64"
	"fmt"
	"net/http"
	"os"
	"time"

	"github.com/gorilla/securecookie"
	"go.uber.org/zap"
)

// TransientOIDC holds OIDC state for stateless authentication across replicas
type TransientOIDC struct {
	State        string    `json:"state"`
	Nonce        string    `json:"nonce"`
	CodeVerifier string    `json:"code_verifier"`
	RedirectURI  string    `json:"redirect_uri"`
	ExpiresAt    time.Time `json:"exp"`
}

// OIDCStateStore manages transient OIDC state via secure cookies
type OIDCStateStore struct {
	sc     *securecookie.SecureCookie
	logger *zap.Logger
}

const (
	// Cookie configuration
	oidcStateCookieName = "kaptn_oidc_state"
	oidcStateTTL        = 5 * time.Minute // Short TTL for security
)

// NewOIDCStateStore creates a new OIDC state store with secure cookie handling
func NewOIDCStateStore(hashKey, blockKey []byte, logger *zap.Logger) (*OIDCStateStore, error) {
	if len(hashKey) < 32 {
		return nil, fmt.Errorf("OIDC state hash key must be at least 32 bytes, got %d", len(hashKey))
	}
	if len(blockKey) != 32 {
		return nil, fmt.Errorf("OIDC state block key must be exactly 32 bytes for AES-256, got %d", len(blockKey))
	}

	sc := securecookie.New(hashKey, blockKey)
	sc.MaxAge(int(oidcStateTTL.Seconds()))

	return &OIDCStateStore{
		sc:     sc,
		logger: logger,
	}, nil
}

// NewOIDCStateStoreFromEnv creates a new OIDC state store from environment variables or default files
func NewOIDCStateStoreFromEnv(logger *zap.Logger) (*OIDCStateStore, error) {
	return NewOIDCStateStoreWithPaths(logger, "", "")
}

// NewOIDCStateStoreWithPaths creates a new OIDC state store with specified key file paths
// If paths are empty, will try environment variables first, then default paths
func NewOIDCStateStoreWithPaths(logger *zap.Logger, hashKeyPath, blockKeyPath string) (*OIDCStateStore, error) {
	hashKeyStr := os.Getenv("OIDC_STATE_HASH_KEY")
	blockKeyStr := os.Getenv("OIDC_STATE_BLOCK_KEY")

	// If not found in environment, try to load from files
	if hashKeyStr == "" {
		// Try specified path first, then default path
		pathsToTry := []string{}
		if hashKeyPath != "" {
			pathsToTry = append(pathsToTry, hashKeyPath)
		}
		pathsToTry = append(pathsToTry, "keys/oidc_state_hash.key")

		for _, path := range pathsToTry {
			if data, err := os.ReadFile(path); err == nil {
				hashKeyStr = string(data)
				logger.Info("Loaded OIDC state hash key from file", zap.String("path", path))
				break
			}
		}
	}

	if blockKeyStr == "" {
		// Try specified path first, then default path
		pathsToTry := []string{}
		if blockKeyPath != "" {
			pathsToTry = append(pathsToTry, blockKeyPath)
		}
		pathsToTry = append(pathsToTry, "keys/oidc_state_block.key")

		for _, path := range pathsToTry {
			if data, err := os.ReadFile(path); err == nil {
				blockKeyStr = string(data)
				logger.Info("Loaded OIDC state block key from file", zap.String("path", path))
				break
			}
		}
	}

	if hashKeyStr == "" || blockKeyStr == "" {
		return nil, fmt.Errorf("OIDC state keys are required. Set OIDC_STATE_HASH_KEY and OIDC_STATE_BLOCK_KEY environment variables, or ensure keys exist in keys/ directory")
	}

	// Decode from base64 if they look like base64, otherwise use as raw bytes
	var hashKey, blockKey []byte
	var err error

	// Try base64 decode first, fallback to raw bytes
	if hashKey, err = base64.StdEncoding.DecodeString(hashKeyStr); err != nil {
		hashKey = []byte(hashKeyStr)
	}
	if blockKey, err = base64.StdEncoding.DecodeString(blockKeyStr); err != nil {
		blockKey = []byte(blockKeyStr)
	}

	return NewOIDCStateStore(hashKey, blockKey, logger)
}

// Set stores OIDC state in a secure cookie and returns the generated values
func (s *OIDCStateStore) Set(w http.ResponseWriter, r *http.Request, redirectURI string) (*TransientOIDC, error) {
	// Generate PKCE parameters
	pkceParams, err := GeneratePKCEParams()
	if err != nil {
		return nil, fmt.Errorf("failed to generate PKCE parameters: %w", err)
	}

	// Create transient state
	state := &TransientOIDC{
		State:        pkceParams.State,
		Nonce:        pkceParams.Nonce,
		CodeVerifier: pkceParams.CodeVerifier,
		RedirectURI:  redirectURI,
		ExpiresAt:    time.Now().Add(oidcStateTTL),
	}

	// Encode the state into a secure cookie value
	encoded, err := s.sc.Encode(oidcStateCookieName, state)
	if err != nil {
		return nil, fmt.Errorf("failed to encode OIDC state: %w", err)
	}

	// Set the cookie with security flags
	cookie := &http.Cookie{
		Name:     oidcStateCookieName,
		Value:    encoded,
		HttpOnly: true,
		Secure:   true,                  // Always require HTTPS for OIDC state
		SameSite: http.SameSiteNoneMode, // Required for OIDC redirect flows
		Path:     "/",
		MaxAge:   int(oidcStateTTL.Seconds()),
	}

	http.SetCookie(w, cookie)

	s.logger.Debug("OIDC state stored in cookie",
		zap.String("state", state.State),
		zap.Time("expires_at", state.ExpiresAt),
		zap.String("redirect_uri", redirectURI))

	return state, nil
}

// GetAndClear retrieves and removes OIDC state from the secure cookie
func (s *OIDCStateStore) GetAndClear(w http.ResponseWriter, r *http.Request) (*TransientOIDC, error) {
	// Get the cookie
	cookie, err := r.Cookie(oidcStateCookieName)
	if err != nil {
		return nil, fmt.Errorf("OIDC state cookie not found: %w", err)
	}

	// Decode the state
	var state TransientOIDC
	if err := s.sc.Decode(oidcStateCookieName, cookie.Value, &state); err != nil {
		s.clearCookie(w)
		return nil, fmt.Errorf("failed to decode OIDC state: %w", err)
	}

	// Check expiration
	if time.Now().After(state.ExpiresAt) {
		s.clearCookie(w)
		return nil, fmt.Errorf("OIDC state expired")
	}

	// Clear the cookie immediately (one-time use)
	s.clearCookie(w)

	s.logger.Debug("OIDC state retrieved and cleared",
		zap.String("state", state.State),
		zap.Time("expires_at", state.ExpiresAt))

	return &state, nil
}

// clearCookie removes the OIDC state cookie
func (s *OIDCStateStore) clearCookie(w http.ResponseWriter) {
	cookie := &http.Cookie{
		Name:     oidcStateCookieName,
		Value:    "",
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteNoneMode,
		Path:     "/",
		MaxAge:   -1, // Delete the cookie
	}
	http.SetCookie(w, cookie)
}

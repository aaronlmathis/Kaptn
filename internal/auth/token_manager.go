package auth

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
	"fmt"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"go.uber.org/zap"
)

// TokenType represents the type of token
type TokenType string

const (
	AccessToken  TokenType = "access"
	RefreshToken TokenType = "refresh"
)

// RefreshTokenFamily represents a refresh token family for rotation tracking
type RefreshTokenFamily struct {
	FamilyID     string    `json:"family_id"`
	TokenID      string    `json:"token_id"`
	UserID       string    `json:"user_id"`
	ClientHash   string    `json:"client_hash"`
	IssuedAt     time.Time `json:"issued_at"`
	ExpiresAt    time.Time `json:"expires_at"`
	Used         bool      `json:"used"`
	Invalidated  bool      `json:"invalidated"`
	ParentTokenID string   `json:"parent_token_id,omitempty"`
}

// SessionVersion represents a user's session version for invalidation
type SessionVersion struct {
	UserID     string    `json:"user_id"`
	Version    int64     `json:"version"`
	UpdatedAt  time.Time `json:"updated_at"`
}

// AccessTokenClaims represents the claims in an access token
type AccessTokenClaims struct {
	UserID     string            `json:"sub"`
	Email      string            `json:"email"`
	Name       string            `json:"name,omitempty"`
	Roles      []string          `json:"roles"`
	Perms      []string          `json:"perms"`
	SessionVer int64             `json:"session_ver"`
	JTI        string            `json:"jti"`
	TraceID    string            `json:"trace_id"`
	jwt.RegisteredClaims
}

// RefreshTokenClaims represents the claims in a refresh token
type RefreshTokenClaims struct {
	UserID    string `json:"sub"`
	FamilyID  string `json:"family_id"`
	TokenID   string `json:"token_id"`
	ClientHash string `json:"client_hash"`
	jwt.RegisteredClaims
}

// TokenManager handles creation and validation of access and refresh tokens
type TokenManager struct {
	logger             *zap.Logger
	privateKey         *rsa.PrivateKey
	publicKey          *rsa.PublicKey
	keyID              string
	accessTokenTTL     time.Duration
	refreshTokenTTL    time.Duration
	
	// In-memory storage for refresh token families and session versions
	// In production, this should be Redis or database
	refreshFamilies    map[string]*RefreshTokenFamily
	sessionVersions    map[string]*SessionVersion
	revokedTokens      map[string]time.Time // JTI -> revocation time
	mutex              sync.RWMutex
	
	// Cleanup ticker
	cleanupTicker      *time.Ticker
	stopCleanup        chan struct{}
}

// NewTokenManager creates a new token manager with RSA key pair
func NewTokenManager(logger *zap.Logger, accessTokenTTL, refreshTokenTTL time.Duration) (*TokenManager, error) {
	// Generate RSA key pair
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		return nil, fmt.Errorf("failed to generate RSA key pair: %w", err)
	}
	
	publicKey := &privateKey.PublicKey
	keyID := generateKeyID()
	
	tm := &TokenManager{
		logger:          logger,
		privateKey:      privateKey,
		publicKey:       publicKey,
		keyID:           keyID,
		accessTokenTTL:  accessTokenTTL,
		refreshTokenTTL: refreshTokenTTL,
		refreshFamilies: make(map[string]*RefreshTokenFamily),
		sessionVersions: make(map[string]*SessionVersion),
		revokedTokens:   make(map[string]time.Time),
		stopCleanup:     make(chan struct{}),
	}
	
	// Start cleanup goroutine
	tm.startCleanup()
	
	logger.Info("Token manager initialized",
		zap.String("key_id", keyID),
		zap.Duration("access_token_ttl", accessTokenTTL),
		zap.Duration("refresh_token_ttl", refreshTokenTTL))
	
	return tm, nil
}

// CreateAccessToken creates a new access token
func (tm *TokenManager) CreateAccessToken(user *User, sessionVer int64, traceID string) (string, error) {
	now := time.Now()
	jti := uuid.New().String()
	
	// Extract roles and permissions from user groups
	roles, perms := tm.extractRolesAndPerms(user.Groups)
	
	claims := AccessTokenClaims{
		UserID:     user.ID,
		Email:      user.Email,
		Name:       user.Name,
		Roles:      roles,
		Perms:      perms,
		SessionVer: sessionVer,
		JTI:        jti,
		TraceID:    traceID,
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    "kaptn",
			Subject:   user.ID,
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(tm.accessTokenTTL)),
			NotBefore: jwt.NewNumericDate(now),
		},
	}
	
	token := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	token.Header["kid"] = tm.keyID
	
	tokenString, err := token.SignedString(tm.privateKey)
	if err != nil {
		return "", fmt.Errorf("failed to sign access token: %w", err)
	}
	
	tm.logger.Debug("Created access token",
		zap.String("user_id", user.ID),
		zap.String("jti", jti),
		zap.Int64("session_ver", sessionVer),
		zap.String("trace_id", traceID),
		zap.Time("expires_at", now.Add(tm.accessTokenTTL)))
	
	return tokenString, nil
}

// CreateRefreshToken creates a new refresh token and family
func (tm *TokenManager) CreateRefreshToken(user *User, clientHash string, parentTokenID string) (string, *RefreshTokenFamily, error) {
	now := time.Now()
	tokenID := uuid.New().String()
	familyID := uuid.New().String()
	
	// If this is a refresh, use the same family ID as parent
	if parentTokenID != "" {
		tm.mutex.RLock()
		for _, family := range tm.refreshFamilies {
			if family.TokenID == parentTokenID {
				familyID = family.FamilyID
				break
			}
		}
		tm.mutex.RUnlock()
	}
	
	family := &RefreshTokenFamily{
		FamilyID:      familyID,
		TokenID:       tokenID,
		UserID:        user.ID,
		ClientHash:    clientHash,
		IssuedAt:      now,
		ExpiresAt:     now.Add(tm.refreshTokenTTL),
		Used:          false,
		Invalidated:   false,
		ParentTokenID: parentTokenID,
	}
	
	claims := RefreshTokenClaims{
		UserID:     user.ID,
		FamilyID:   familyID,
		TokenID:    tokenID,
		ClientHash: clientHash,
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    "kaptn",
			Subject:   user.ID,
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(tm.refreshTokenTTL)),
			NotBefore: jwt.NewNumericDate(now),
		},
	}
	
	token := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	token.Header["kid"] = tm.keyID
	
	tokenString, err := token.SignedString(tm.privateKey)
	if err != nil {
		return "", nil, fmt.Errorf("failed to sign refresh token: %w", err)
	}
	
	// Store family
	tm.mutex.Lock()
	tm.refreshFamilies[tokenID] = family
	tm.mutex.Unlock()
	
	tm.logger.Debug("Created refresh token",
		zap.String("user_id", user.ID),
		zap.String("family_id", familyID),
		zap.String("token_id", tokenID),
		zap.String("parent_token_id", parentTokenID),
		zap.Time("expires_at", now.Add(tm.refreshTokenTTL)))
	
	return tokenString, family, nil
}

// ValidateAccessToken validates an access token and returns claims
func (tm *TokenManager) ValidateAccessToken(tokenString string) (*AccessTokenClaims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &AccessTokenClaims{}, func(token *jwt.Token) (interface{}, error) {
		// Verify signing method
		if _, ok := token.Method.(*jwt.SigningMethodRSA); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		
		// Verify key ID
		if kid, ok := token.Header["kid"].(string); !ok || kid != tm.keyID {
			return nil, fmt.Errorf("invalid key ID")
		}
		
		return tm.publicKey, nil
	})
	
	if err != nil {
		return nil, fmt.Errorf("failed to parse access token: %w", err)
	}
	
	if !token.Valid {
		return nil, fmt.Errorf("invalid access token")
	}
	
	claims, ok := token.Claims.(*AccessTokenClaims)
	if !ok {
		return nil, fmt.Errorf("invalid token claims")
	}
	
	// Check if token is revoked
	tm.mutex.RLock()
	if _, revoked := tm.revokedTokens[claims.JTI]; revoked {
		tm.mutex.RUnlock()
		return nil, fmt.Errorf("token revoked")
	}
	tm.mutex.RUnlock()
	
	// Validate session version
	if !tm.validateSessionVersion(claims.UserID, claims.SessionVer) {
		return nil, fmt.Errorf("session version invalid")
	}
	
	return claims, nil
}

// ValidateRefreshToken validates a refresh token and returns claims
func (tm *TokenManager) ValidateRefreshToken(tokenString string, clientHash string) (*RefreshTokenClaims, *RefreshTokenFamily, error) {
	token, err := jwt.ParseWithClaims(tokenString, &RefreshTokenClaims{}, func(token *jwt.Token) (interface{}, error) {
		// Verify signing method
		if _, ok := token.Method.(*jwt.SigningMethodRSA); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		
		// Verify key ID
		if kid, ok := token.Header["kid"].(string); !ok || kid != tm.keyID {
			return nil, fmt.Errorf("invalid key ID")
		}
		
		return tm.publicKey, nil
	})
	
	if err != nil {
		return nil, nil, fmt.Errorf("failed to parse refresh token: %w", err)
	}
	
	if !token.Valid {
		return nil, nil, fmt.Errorf("invalid refresh token")
	}
	
	claims, ok := token.Claims.(*RefreshTokenClaims)
	if !ok {
		return nil, nil, fmt.Errorf("invalid token claims")
	}
	
	// Get family and validate
	tm.mutex.RLock()
	family, exists := tm.refreshFamilies[claims.TokenID]
	tm.mutex.RUnlock()
	
	if !exists {
		return nil, nil, fmt.Errorf("refresh token family not found")
	}
	
	if family.Used {
		// Mark entire family as compromised
		tm.InvalidateRefreshFamily(family.FamilyID)
		return nil, nil, fmt.Errorf("refresh token reuse detected - family invalidated")
	}
	
	if family.Invalidated {
		return nil, nil, fmt.Errorf("refresh token family invalidated")
	}
	
	if time.Now().After(family.ExpiresAt) {
		return nil, nil, fmt.Errorf("refresh token expired")
	}
	
	// Validate client context
	if family.ClientHash != clientHash {
		// Mark family as compromised
		tm.InvalidateRefreshFamily(family.FamilyID)
		return nil, nil, fmt.Errorf("client context mismatch - family invalidated")
	}
	
	return claims, family, nil
}

// RefreshTokens rotates refresh token and creates new access token
func (tm *TokenManager) RefreshTokens(refreshTokenString string, clientHash string, user *User, traceID string) (string, string, error) {
	// Validate current refresh token
	claims, family, err := tm.ValidateRefreshToken(refreshTokenString, clientHash)
	if err != nil {
		return "", "", err
	}
	
	// Mark current token as used
	tm.mutex.Lock()
	family.Used = true
	tm.mutex.Unlock()
	
	// Get current session version
	sessionVer := tm.GetSessionVersion(user.ID)
	
	// Create new access token
	accessToken, err := tm.CreateAccessToken(user, sessionVer, traceID)
	if err != nil {
		return "", "", fmt.Errorf("failed to create access token: %w", err)
	}
	
	// Create new refresh token
	newRefreshToken, _, err := tm.CreateRefreshToken(user, clientHash, claims.TokenID)
	if err != nil {
		return "", "", fmt.Errorf("failed to create refresh token: %w", err)
	}
	
	tm.logger.Info("Tokens refreshed",
		zap.String("user_id", user.ID),
		zap.String("family_id", family.FamilyID),
		zap.String("old_token_id", claims.TokenID),
		zap.String("trace_id", traceID))
	
	return accessToken, newRefreshToken, nil
}

// RefreshTokensWithoutUser rotates refresh token and creates new access token using only refresh token
func (tm *TokenManager) RefreshTokensWithoutUser(refreshTokenString string, clientHash string, traceID string) (string, string, string, error) {
	// Validate current refresh token
	claims, family, err := tm.ValidateRefreshToken(refreshTokenString, clientHash)
	if err != nil {
		return "", "", "", err
	}
	
	// Mark current token as used
	tm.mutex.Lock()
	family.Used = true
	tm.mutex.Unlock()
	
	// Get user ID from refresh token claims
	userID := claims.UserID
	
	// Get current session version
	sessionVer := tm.GetSessionVersion(userID)
	
	// Create minimal user object for token creation (we only need ID for new tokens)
	user := &User{
		ID: userID,
		// Other fields will be populated from the original session context when needed
	}
	
	// Create new access token
	accessToken, err := tm.CreateAccessToken(user, sessionVer, traceID)
	if err != nil {
		return "", "", "", fmt.Errorf("failed to create access token: %w", err)
	}
	
	// Create new refresh token
	newRefreshToken, _, err := tm.CreateRefreshToken(user, clientHash, claims.TokenID)
	if err != nil {
		return "", "", "", fmt.Errorf("failed to create refresh token: %w", err)
	}
	
	tm.logger.Info("Tokens refreshed",
		zap.String("user_id", userID),
		zap.String("family_id", family.FamilyID),
		zap.String("old_token_id", claims.TokenID),
		zap.String("trace_id", traceID))
	
	return accessToken, newRefreshToken, userID, nil
}

// RevokeToken revokes a specific token by JTI
func (tm *TokenManager) RevokeToken(jti string) {
	tm.mutex.Lock()
	tm.revokedTokens[jti] = time.Now()
	tm.mutex.Unlock()
	
	tm.logger.Info("Token revoked", zap.String("jti", jti))
}

// InvalidateRefreshFamily invalidates an entire refresh token family
func (tm *TokenManager) InvalidateRefreshFamily(familyID string) {
	tm.mutex.Lock()
	for _, family := range tm.refreshFamilies {
		if family.FamilyID == familyID {
			family.Invalidated = true
		}
	}
	tm.mutex.Unlock()
	
	tm.logger.Info("Refresh token family invalidated", zap.String("family_id", familyID))
}

// InvalidateUserSessions invalidates all sessions for a user by bumping session version
func (tm *TokenManager) InvalidateUserSessions(userID string) {
	tm.mutex.Lock()
	sv := tm.sessionVersions[userID]
	if sv == nil {
		sv = &SessionVersion{UserID: userID, Version: 1, UpdatedAt: time.Now()}
	} else {
		sv.Version++
		sv.UpdatedAt = time.Now()
	}
	tm.sessionVersions[userID] = sv
	tm.mutex.Unlock()
	
	tm.logger.Info("User sessions invalidated",
		zap.String("user_id", userID),
		zap.Int64("new_version", sv.Version))
}

// GetSessionVersion gets the current session version for a user
func (tm *TokenManager) GetSessionVersion(userID string) int64 {
	tm.mutex.RLock()
	sv := tm.sessionVersions[userID]
	tm.mutex.RUnlock()
	
	if sv == nil {
		// Initialize version 1 for new users
		tm.mutex.Lock()
		sv = &SessionVersion{UserID: userID, Version: 1, UpdatedAt: time.Now()}
		tm.sessionVersions[userID] = sv
		tm.mutex.Unlock()
		return 1
	}
	
	return sv.Version
}

// validateSessionVersion validates if a session version is current
func (tm *TokenManager) validateSessionVersion(userID string, tokenVersion int64) bool {
	currentVersion := tm.GetSessionVersion(userID)
	return tokenVersion == currentVersion
}

// SetAccessTokenCookie sets the access token cookie
func (tm *TokenManager) SetAccessTokenCookie(w http.ResponseWriter, token string, secure bool) {
	cookie := &http.Cookie{
		Name:     "kaptn-access-token",
		Value:    token,
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteLaxMode,
		Path:     "/",
		MaxAge:   int(tm.accessTokenTTL.Seconds()),
	}
	http.SetCookie(w, cookie)
}

// SetRefreshTokenCookie sets the refresh token cookie
func (tm *TokenManager) SetRefreshTokenCookie(w http.ResponseWriter, token string, secure bool) {
	cookie := &http.Cookie{
		Name:     "kaptn-refresh-token",
		Value:    token,
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteLaxMode,
		Path:     "/",
		MaxAge:   int(tm.refreshTokenTTL.Seconds()),
	}
	http.SetCookie(w, cookie)
}

// ClearAuthCookies clears both access and refresh token cookies
func (tm *TokenManager) ClearAuthCookies(w http.ResponseWriter) {
	accessCookie := &http.Cookie{
		Name:     "kaptn-access-token",
		Value:    "",
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteLaxMode,
		Path:     "/",
		MaxAge:   -1,
	}
	
	refreshCookie := &http.Cookie{
		Name:     "kaptn-refresh-token",
		Value:    "",
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteLaxMode,
		Path:     "/",
		MaxAge:   -1,
	}
	
	http.SetCookie(w, accessCookie)
	http.SetCookie(w, refreshCookie)
}

// GetTokensFromCookies extracts tokens from request cookies
func (tm *TokenManager) GetTokensFromCookies(r *http.Request) (accessToken, refreshToken string) {
	if cookie, err := r.Cookie("kaptn-access-token"); err == nil {
		accessToken = cookie.Value
	}
	
	if cookie, err := r.Cookie("kaptn-refresh-token"); err == nil {
		refreshToken = cookie.Value
	}
	
	return accessToken, refreshToken
}

// GenerateClientHash generates a hash representing client context
func (tm *TokenManager) GenerateClientHash(r *http.Request) string {
	// Get IP subnet (first 3 octets for IPv4)
	ipSubnet := tm.getIPSubnet(r)
	userAgent := r.Header.Get("User-Agent")
	
	// Simple hash of IP subnet + User-Agent
	combined := fmt.Sprintf("%s|%s", ipSubnet, userAgent)
	return base64.StdEncoding.EncodeToString([]byte(combined))
}

// getIPSubnet extracts IP subnet from request
func (tm *TokenManager) getIPSubnet(r *http.Request) string {
	// Try to get real IP from headers (for reverse proxy setups)
	ip := r.Header.Get("X-Real-IP")
	if ip == "" {
		ip = r.Header.Get("X-Forwarded-For")
		if ip != "" {
			// Take first IP if comma-separated
			ips := strings.Split(ip, ",")
			ip = strings.TrimSpace(ips[0])
		}
	}
	
	if ip == "" {
		ip = r.RemoteAddr
		// Remove port if present
		if host, _, err := net.SplitHostPort(ip); err == nil {
			ip = host
		}
	}
	
	// Extract subnet (first 3 octets for IPv4)
	parsedIP := net.ParseIP(ip)
	if parsedIP != nil && parsedIP.To4() != nil {
		octets := strings.Split(parsedIP.String(), ".")
		if len(octets) >= 3 {
			return fmt.Sprintf("%s.%s.%s.x", octets[0], octets[1], octets[2])
		}
	}
	
	// Fallback to full IP for IPv6 or unknown format
	return ip
}

// extractRolesAndPerms extracts roles and permissions from user groups
func (tm *TokenManager) extractRolesAndPerms(groups []string) ([]string, []string) {
	var roles, perms []string
	
	for _, group := range groups {
		// Simple mapping - in production this would be more sophisticated
		switch {
		case strings.Contains(group, "admin"):
			roles = append(roles, "admin")
			perms = append(perms, "read", "write", "delete", "admin")
		case strings.Contains(group, "editor"):
			roles = append(roles, "editor")
			perms = append(perms, "read", "write")
		case strings.Contains(group, "viewer"):
			roles = append(roles, "viewer")
			perms = append(perms, "read")
		default:
			roles = append(roles, "user")
			perms = append(perms, "read")
		}
	}
	
	// Remove duplicates
	roles = removeDuplicates(roles)
	perms = removeDuplicates(perms)
	
	return roles, perms
}

// startCleanup starts the cleanup goroutine
func (tm *TokenManager) startCleanup() {
	tm.cleanupTicker = time.NewTicker(1 * time.Hour)
	
	go func() {
		for {
			select {
			case <-tm.cleanupTicker.C:
				tm.cleanup()
			case <-tm.stopCleanup:
				tm.cleanupTicker.Stop()
				return
			}
		}
	}()
}

// cleanup removes expired tokens and families
func (tm *TokenManager) cleanup() {
	now := time.Now()
	tm.mutex.Lock()
	
	// Clean up expired refresh families
	for tokenID, family := range tm.refreshFamilies {
		if now.After(family.ExpiresAt) {
			delete(tm.refreshFamilies, tokenID)
		}
	}
	
	// Clean up old revoked tokens (keep for 24 hours)
	for jti, revokedAt := range tm.revokedTokens {
		if now.Sub(revokedAt) > 24*time.Hour {
			delete(tm.revokedTokens, jti)
		}
	}
	
	tm.mutex.Unlock()
	
	tm.logger.Debug("Token cleanup completed")
}

// Shutdown stops the token manager
func (tm *TokenManager) Shutdown() {
	close(tm.stopCleanup)
}

// generateKeyID generates a unique key ID
func generateKeyID() string {
	return uuid.New().String()[:8]
}

// removeDuplicates removes duplicate strings from slice
func removeDuplicates(slice []string) []string {
	keys := make(map[string]bool)
	var result []string
	
	for _, item := range slice {
		if !keys[item] {
			keys[item] = true
			result = append(result, item)
		}
	}
	
	return result
}

// GetPublicKeyPEM returns the public key in PEM format for JWK endpoint
func (tm *TokenManager) GetPublicKeyPEM() (string, error) {
	pubKeyBytes, err := x509.MarshalPKIXPublicKey(tm.publicKey)
	if err != nil {
		return "", fmt.Errorf("failed to marshal public key: %w", err)
	}
	
	pemBlock := &pem.Block{
		Type:  "PUBLIC KEY",
		Bytes: pubKeyBytes,
	}
	
	return string(pem.EncodeToMemory(pemBlock)), nil
}

// GetKeyID returns the current key ID
func (tm *TokenManager) GetKeyID() string {
	return tm.keyID
}

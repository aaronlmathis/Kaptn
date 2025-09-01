package dto

import "time"

// CSRFTokenResponse represents the response containing a CSRF token
type CSRFTokenResponse struct {
	Token string `json:"token"`
}

// AuthConfigResponse represents public authentication configuration
type AuthConfigResponse struct {
	Auth AuthModeConfig `json:"auth"`
}

// AuthModeConfig represents authentication mode configuration
type AuthModeConfig struct {
	Mode string `json:"mode"`
}

// IdentitiesResponse represents the response containing user identities
type IdentitiesResponse struct {
	Users           []UserIdentity           `json:"users"`
	Groups          []GroupIdentity          `json:"groups"`
	ServiceAccounts []ServiceAccountIdentity `json:"serviceAccounts"`
}

// UserIdentity represents a user identity
type UserIdentity struct {
	Name   string            `json:"name"`
	Email  string            `json:"email,omitempty"`
	Groups []string          `json:"groups,omitempty"`
	Labels map[string]string `json:"labels,omitempty"`
}

// GroupIdentity represents a group identity
type GroupIdentity struct {
	Name   string            `json:"name"`
	Users  []string          `json:"users,omitempty"`
	Labels map[string]string `json:"labels,omitempty"`
}

// ServiceAccountIdentity represents a service account identity
type ServiceAccountIdentity struct {
	Name      string            `json:"name"`
	Namespace string            `json:"namespace"`
	Labels    map[string]string `json:"labels,omitempty"`
}

// LoginRequest represents a login request
type LoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

// LoginResponse represents a login response
type LoginResponse struct {
	Success     bool   `json:"success"`
	Token       string `json:"token,omitempty"`
	RedirectURL string `json:"redirectUrl,omitempty"`
	Message     string `json:"message,omitempty"`
}

// RefreshTokenRequest represents a token refresh request
type RefreshTokenRequest struct {
	RefreshToken string `json:"refreshToken"`
}

// RefreshTokenResponse represents a token refresh response
type RefreshTokenResponse struct {
	Success      bool   `json:"success"`
	AccessToken  string `json:"accessToken,omitempty"`
	RefreshToken string `json:"refreshToken,omitempty"`
	ExpiresIn    int    `json:"expiresIn,omitempty"`
}

// UserProfileResponse represents user profile information
type UserProfileResponse struct {
	Sub              string    `json:"sub"`
	Email            string    `json:"email"`
	EmailVerified    bool      `json:"email_verified"`
	Name             string    `json:"name"`
	GivenName        string    `json:"given_name,omitempty"`
	FamilyName       string    `json:"family_name,omitempty"`
	Picture          string    `json:"picture,omitempty"`
	Groups           []string  `json:"groups,omitempty"`
	Capabilities     []string  `json:"capabilities,omitempty"`
	LastLogin        time.Time `json:"last_login,omitempty"`
	SessionExpiresAt time.Time `json:"session_expires_at,omitempty"`
}

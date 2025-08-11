package auth

import (
	"context"
	"fmt"
	"net/url"
	"strings"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
	"go.uber.org/zap"
	"golang.org/x/oauth2"
)

// OIDCClient represents an OIDC client for JWT validation
type OIDCClient struct {
	logger    *zap.Logger
	provider  *oidc.Provider
	verifier  *oidc.IDTokenVerifier
	config    OIDCConfig
	oauth2Cfg *oauth2.Config
}

// OIDCConfig represents OIDC configuration
type OIDCConfig struct {
	Issuer       string   `yaml:"issuer"`
	ClientID     string   `yaml:"client_id"`
	ClientSecret string   `yaml:"client_secret"`
	RedirectURL  string   `yaml:"redirect_url"`
	Scopes       []string `yaml:"scopes"`
	Audience     string   `yaml:"audience"`
	JWKSURL      string   `yaml:"jwks_url"`
}

// NewOIDCClient creates a new OIDC client
func NewOIDCClient(logger *zap.Logger, config OIDCConfig) (*OIDCClient, error) {
	if config.Issuer == "" {
		return nil, fmt.Errorf("OIDC issuer URL is required")
	}
	if config.ClientID == "" {
		return nil, fmt.Errorf("OIDC client ID is required")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Initialize OIDC provider
	provider, err := oidc.NewProvider(ctx, config.Issuer)
	if err != nil {
		return nil, fmt.Errorf("failed to initialize OIDC provider: %w", err)
	}

	// Create token verifier
	verifierConfig := &oidc.Config{
		ClientID: config.ClientID,
	}
	if config.Audience != "" {
		// Some providers require audience validation
		verifierConfig.SupportedSigningAlgs = []string{oidc.RS256}
	}

	verifier := provider.Verifier(verifierConfig)

	// Set default scopes if not provided
	scopes := config.Scopes
	if len(scopes) == 0 {
		scopes = []string{oidc.ScopeOpenID, "profile", "email", "groups"}
	}

	// Create OAuth2 config for login flow
	oauth2Config := &oauth2.Config{
		ClientID:     config.ClientID,
		ClientSecret: config.ClientSecret,
		RedirectURL:  config.RedirectURL,
		Endpoint:     provider.Endpoint(),
		Scopes:       scopes,
	}

	client := &OIDCClient{
		logger:    logger,
		provider:  provider,
		verifier:  verifier,
		config:    config,
		oauth2Cfg: oauth2Config,
	}

	logger.Info("OIDC client initialized",
		zap.String("issuer", config.Issuer),
		zap.String("clientId", config.ClientID),
		zap.Strings("scopes", scopes))

	return client, nil
}

// VerifyToken verifies a JWT token and extracts user information
func (c *OIDCClient) VerifyToken(ctx context.Context, tokenString string) (*User, error) {
	// Verify as an OIDC ID token
	idToken, err := c.verifier.Verify(ctx, tokenString)
	if err != nil {
		return nil, fmt.Errorf("failed to verify token: %w", err)
	}

	// Extract claims
	var claims map[string]interface{}
	if err := idToken.Claims(&claims); err != nil {
		return nil, fmt.Errorf("failed to extract claims: %w", err)
	}

	// Debug: Log all claims received from Google
	c.logger.Info("Google OAuth claims received", 
		zap.Any("all_claims", claims))
	
	// Specifically check for picture in ID token claims
	if pictureRaw, exists := claims["picture"]; exists {
		c.logger.Info("Picture field found in ID token claims", 
			zap.Any("picture_raw", pictureRaw),
			zap.String("picture_type", fmt.Sprintf("%T", pictureRaw)))
	} else {
		c.logger.Info("Picture field NOT found in ID token claims")
	}

	user := &User{
		Claims: claims,
	}

	// Extract standard claims
	if sub, ok := claims["sub"].(string); ok {
		user.ID = sub
	}
	if email, ok := claims["email"].(string); ok {
		user.Email = email
	}
	if name, ok := claims["name"].(string); ok {
		user.Name = name
	}
	if picture, ok := claims["picture"].(string); ok {
		user.Picture = picture
		c.logger.Info("Picture URL extracted from claims", 
			zap.String("picture", picture))
	} else {
		c.logger.Warn("No picture claim found or not a string", 
			zap.Any("picture_claim", claims["picture"]))
	}

	// Extract groups from various possible claim names
	user.Groups = c.extractGroups(claims)

	c.logger.Debug("Successfully verified token",
		zap.String("userId", user.ID),
		zap.String("email", user.Email),
		zap.Strings("groups", user.Groups))

	return user, nil
}

// extractGroups extracts group information from JWT claims
func (c *OIDCClient) extractGroups(claims map[string]interface{}) []string {
	var groups []string

	// Try different possible group claim names
	groupFields := []string{"groups", "roles", "kad_groups", "kad_roles", "authorities"}

	for _, field := range groupFields {
		if groupData, ok := claims[field]; ok {
			switch v := groupData.(type) {
			case []interface{}:
				for _, g := range v {
					if groupStr, ok := g.(string); ok {
						groups = append(groups, groupStr)
					}
				}
			case []string:
				groups = append(groups, v...)
			case string:
				// Some providers return groups as comma-separated string
				groupList := strings.Split(v, ",")
				for _, g := range groupList {
					trimmed := strings.TrimSpace(g)
					if trimmed != "" {
						groups = append(groups, trimmed)
					}
				}
			}
		}
	}

	return groups
}

// GetAuthURL returns the OAuth2 authorization URL with PKCE for login
func (c *OIDCClient) GetAuthURL(state string, pkceParams *PKCEParams) string {
	// Add PKCE parameters to OAuth2 config
	authURL := c.oauth2Cfg.AuthCodeURL(state,
		oauth2.SetAuthURLParam("code_challenge", pkceParams.CodeChallenge),
		oauth2.SetAuthURLParam("code_challenge_method", "S256"),
		oauth2.SetAuthURLParam("nonce", pkceParams.Nonce),
	)

	c.logger.Debug("Generated auth URL with PKCE",
		zap.String("state", state),
		zap.String("nonce", pkceParams.Nonce))

	return authURL
}

// ExchangeCodeWithPKCE exchanges an authorization code for tokens using PKCE
func (c *OIDCClient) ExchangeCodeWithPKCE(ctx context.Context, code string, codeVerifier string) (*oauth2.Token, error) {
	// Add PKCE code verifier to the token exchange
	token, err := c.oauth2Cfg.Exchange(ctx, code,
		oauth2.SetAuthURLParam("code_verifier", codeVerifier),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to exchange code with PKCE: %w", err)
	}

	c.logger.Debug("Successfully exchanged code for tokens with PKCE")
	return token, nil
}

// GetUserInfo retrieves user information using the access token
func (c *OIDCClient) GetUserInfo(ctx context.Context, accessToken string) (*User, error) {
	userInfo, err := c.provider.UserInfo(ctx, oauth2.StaticTokenSource(&oauth2.Token{
		AccessToken: accessToken,
	}))
	if err != nil {
		return nil, fmt.Errorf("failed to get user info: %w", err)
	}

	var claims map[string]interface{}
	if err := userInfo.Claims(&claims); err != nil {
		return nil, fmt.Errorf("failed to extract user info claims: %w", err)
	}

	// Debug: Log all userinfo claims
	c.logger.Info("UserInfo endpoint claims received", 
		zap.Any("userinfo_claims", claims))
	
	// Specifically check for picture in userinfo claims
	if pictureRaw, exists := claims["picture"]; exists {
		c.logger.Info("Picture field found in userinfo claims", 
			zap.Any("picture_raw", pictureRaw),
			zap.String("picture_type", fmt.Sprintf("%T", pictureRaw)))
	} else {
		c.logger.Info("Picture field NOT found in userinfo claims")
	}

	user := &User{
		Claims: claims,
	}

	// Extract standard claims
	if sub, ok := claims["sub"].(string); ok {
		user.ID = sub
	}
	if email, ok := claims["email"].(string); ok {
		user.Email = email
	}
	if name, ok := claims["name"].(string); ok {
		user.Name = name
	}
	if picture, ok := claims["picture"].(string); ok {
		user.Picture = picture
		c.logger.Info("Picture URL extracted from userinfo", 
			zap.String("picture", picture))
	} else {
		c.logger.Warn("No picture in userinfo claims", 
			zap.Any("picture_claim", claims["picture"]))
	}

	// Extract groups
	user.Groups = c.extractGroups(claims)

	return user, nil
}

// ValidateConfig validates the OIDC configuration
func (config *OIDCConfig) Validate() error {
	if config.Issuer == "" {
		return fmt.Errorf("OIDC issuer is required")
	}

	// Validate issuer URL format
	if _, err := url.Parse(config.Issuer); err != nil {
		return fmt.Errorf("invalid OIDC issuer URL: %w", err)
	}

	if config.ClientID == "" {
		return fmt.Errorf("OIDC client ID is required")
	}

	// RedirectURL is required for authorization code flow
	if config.RedirectURL != "" {
		if _, err := url.Parse(config.RedirectURL); err != nil {
			return fmt.Errorf("invalid OIDC redirect URL: %w", err)
		}
	}

	return nil
}

// GetProviderInfo returns information about the OIDC provider
func (c *OIDCClient) GetProviderInfo() map[string]interface{} {
	return map[string]interface{}{
		"issuer":   c.config.Issuer,
		"clientId": c.config.ClientID,
		"scopes":   c.config.Scopes,
	}
}

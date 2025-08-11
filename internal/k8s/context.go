package k8s

import (
	"context"
	"fmt"
	"strings"

	"github.com/aaronlmathis/kaptn/internal/auth"
	"go.uber.org/zap"
)

// ImpersonationContextKey is the key used to store impersonated clients in context
type ImpersonationContextKey struct{}

// WithImpersonatedClients adds impersonated clients to the context
func WithImpersonatedClients(ctx context.Context, clients *ImpersonatedClients) context.Context {
	return context.WithValue(ctx, ImpersonationContextKey{}, clients)
}

// ImpersonatedClientsFromContext extracts impersonated clients from context
func ImpersonatedClientsFromContext(ctx context.Context) (*ImpersonatedClients, bool) {
	clients, ok := ctx.Value(ImpersonationContextKey{}).(*ImpersonatedClients)
	return clients, ok
}

// ImpersonationManager handles the creation and management of impersonated clients for requests
type ImpersonationManager struct {
	factory          *ImpersonatedClientFactory
	ssarHelper       *SSARHelper
	permissionHelper *PermissionHelper
	logger           *zap.Logger
}

// NewImpersonationManager creates a new impersonation manager
func NewImpersonationManager(factory *ImpersonatedClientFactory, logger *zap.Logger) *ImpersonationManager {
	ssarHelper := NewSSARHelper(logger)
	return &ImpersonationManager{
		factory:          factory,
		ssarHelper:       ssarHelper,
		permissionHelper: NewPermissionHelper(ssarHelper),
		logger:           logger,
	}
}

// BuildClientsFromUser creates impersonated clients from authenticated user
func (im *ImpersonationManager) BuildClientsFromUser(user *auth.User, usernameFormat string) (*ImpersonatedClients, error) {
	if user == nil {
		return nil, fmt.Errorf("user is required")
	}

	// Format username for impersonation
	username := im.formatUsername(user, usernameFormat)

	// Use resolved groups from auth middleware
	groups := user.Groups

	// Build impersonated clients
	clients, err := im.factory.BuildImpersonatedClients(username, groups)
	if err != nil {
		return nil, fmt.Errorf("failed to build impersonated clients for user %s: %w", username, err)
	}

	im.logger.Debug("Built impersonated clients from user",
		zap.String("username", username),
		zap.String("userEmail", user.Email),
		zap.Strings("groups", groups))

	return clients, nil
}

// formatUsername applies the configured username format
func (im *ImpersonationManager) formatUsername(user *auth.User, format string) string {
	if format == "" {
		// Default format: prefer sub over email
		if user.Sub != "" {
			return fmt.Sprintf("oidc:%s", user.Sub)
		}
		return fmt.Sprintf("email:%s", user.Email)
	}

	// Apply format replacements
	username := format
	username = strings.ReplaceAll(username, "{sub}", user.Sub)
	username = strings.ReplaceAll(username, "{email}", user.Email)
	username = strings.ReplaceAll(username, "{name}", user.Name)
	username = strings.ReplaceAll(username, "{id}", user.ID)

	return username
}

// SSARHelper returns the SSAR helper
func (im *ImpersonationManager) SSARHelper() *SSARHelper {
	return im.ssarHelper
}

// PermissionHelper returns the permission helper for UI gating
func (im *ImpersonationManager) PermissionHelper() *PermissionHelper {
	return im.permissionHelper
}

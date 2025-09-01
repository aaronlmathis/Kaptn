package middleware

import (
	"context"
	"net/http"

	"github.com/aaronlmathis/kaptn/internal/auth"
	"go.uber.org/zap"
)

// AuthExtractor extracts authentication information from requests.
// This is a thin wrapper around existing auth middleware functionality.
type AuthExtractor struct {
	logger *zap.Logger
}

// NewAuthExtractor creates a new auth extractor.
func NewAuthExtractor(logger *zap.Logger) *AuthExtractor {
	return &AuthExtractor{
		logger: logger,
	}
}

// GetUser extracts the authenticated user from request context.
// This centralizes the auth.UserFromContext call used throughout handlers.
func (a *AuthExtractor) GetUser(ctx context.Context) (*auth.User, bool) {
	return auth.UserFromContext(ctx)
}

// GetUserFromRequest extracts the authenticated user from an HTTP request.
func (a *AuthExtractor) GetUserFromRequest(r *http.Request) (*auth.User, bool) {
	return a.GetUser(r.Context())
}

// RequireUser returns an error if no authenticated user is found.
func (a *AuthExtractor) RequireUser(ctx context.Context) (*auth.User, error) {
	user, ok := a.GetUser(ctx)
	if !ok || user == nil {
		return nil, &AuthError{
			Code:    "UNAUTHORIZED",
			Message: "Authentication required",
			Status:  http.StatusUnauthorized,
		}
	}
	return user, nil
}

// AuthError represents an authentication error.
type AuthError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Status  int    `json:"-"`
}

func (e *AuthError) Error() string {
	return e.Message
}

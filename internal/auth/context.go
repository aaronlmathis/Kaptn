package auth

import (
	"context"
)

// User represents an authenticated user
type User struct {
	ID      string                 `json:"id"`
	Sub     string                 `json:"sub"` // OIDC subject identifier
	Email   string                 `json:"email"`
	Name    string                 `json:"name"`
	Picture string                 `json:"picture"` // Profile picture URL
	Groups  []string               `json:"groups"`
	Claims  map[string]interface{} `json:"claims"`
}

// UserContextKey is the key used to store user in context
type UserContextKey struct{}

// WithUser adds a user to the context
func WithUser(ctx context.Context, user *User) context.Context {
	return context.WithValue(ctx, UserContextKey{}, user)
}

// UserFromContext extracts the user from the context
func UserFromContext(ctx context.Context) (*User, bool) {
	user, ok := ctx.Value(UserContextKey{}).(*User)
	return user, ok
}

// GetUserIDFromContext extracts the user ID from context, returns empty string if not found
func GetUserIDFromContext(ctx context.Context) string {
	if user, ok := UserFromContext(ctx); ok {
		return user.ID
	}
	return ""
}

// GetUserEmailFromContext extracts the user email from context, returns empty string if not found
func GetUserEmailFromContext(ctx context.Context) string {
	if user, ok := UserFromContext(ctx); ok {
		return user.Email
	}
	return ""
}

// HasRole checks if the user has a specific role/group
func (u *User) HasRole(role string) bool {
	for _, group := range u.Groups {
		if group == role {
			return true
		}
	}
	return false
}

// HasPerm checks if the user has a specific abstract permission (e.g., "write", "admin").
// These permissions are derived from the user's groups and stored in the session token.
func (u *User) HasPerm(perm string) bool {
	if u.Claims == nil {
		return false
	}

	// The perms claim is stored as []string in the token
	if perms, ok := u.Claims["perms"].([]string); ok {
		for _, p := range perms {
			if p == perm {
				return true
			}
		}
	}

	// Handle the case where JSON unmarshaling might convert it to []interface{}
	if perms, ok := u.Claims["perms"].([]interface{}); ok {
		for _, p := range perms {
			if pStr, ok := p.(string); ok && pStr == perm {
				return true
			}
		}
	}
	return false
}

// IsAdmin checks if the user has admin privileges
func (u *User) IsAdmin() bool {
	return u.HasPerm("admin")
}

// CanWrite checks if the user can perform write operations
func (u *User) CanWrite() bool {
	return u.HasPerm("write")
}

// CanRead checks if the user can perform read operations
func (u *User) CanRead() bool {
	return u.HasPerm("read")
}

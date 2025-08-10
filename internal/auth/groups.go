package auth

import (
	"context"
	"fmt"
	"strings"

	"go.uber.org/zap"
)

// GroupResolver interface defines how to resolve effective groups for a user
type GroupResolver interface {
	// ResolveGroups returns the effective groups for a user
	ResolveGroups(ctx context.Context, user *User) ([]string, error)
}

// BindingStore interface defines how to store and retrieve user bindings
type BindingStore interface {
	// GetUserBinding retrieves a user binding by key (sub, email, etc.)
	GetUserBinding(ctx context.Context, key string) (*UserBinding, error)

	// Close closes the binding store and releases resources
	Close() error
}

// IdPGroupsResolver implements GroupResolver using groups from the identity provider
type IdPGroupsResolver struct {
	allowedPrefixes []string // Optional prefix filter (e.g. ["kaptn-", "oncall-"])
	logger          *zap.Logger
}

// NewIdPGroupsResolver creates a new IdP groups resolver
func NewIdPGroupsResolver(allowedPrefixes []string, logger *zap.Logger) *IdPGroupsResolver {
	return &IdPGroupsResolver{
		allowedPrefixes: allowedPrefixes,
		logger:          logger,
	}
}

// ResolveGroups implements GroupResolver for IdP groups mode
func (r *IdPGroupsResolver) ResolveGroups(ctx context.Context, user *User) ([]string, error) {
	groups := user.Groups

	// Apply prefix filtering if configured
	if len(r.allowedPrefixes) > 0 {
		filteredGroups := make([]string, 0)

		for _, group := range groups {
			for _, prefix := range r.allowedPrefixes {
				if strings.HasPrefix(group, prefix) {
					filteredGroups = append(filteredGroups, group)
					break
				}
			}
		}

		r.logger.Debug("Applied prefix filtering",
			zap.Strings("original_groups", user.Groups),
			zap.Strings("filtered_groups", filteredGroups),
			zap.Strings("allowed_prefixes", r.allowedPrefixes))

		groups = filteredGroups
	}

	return groups, nil
}

// UserBindingsResolver implements GroupResolver using a binding store
type UserBindingsResolver struct {
	store  BindingStore
	logger *zap.Logger
}

// NewUserBindingsResolver creates a new user bindings resolver
func NewUserBindingsResolver(store BindingStore, logger *zap.Logger) *UserBindingsResolver {
	return &UserBindingsResolver{
		store:  store,
		logger: logger,
	}
}

// ResolveGroups implements GroupResolver for user bindings mode
func (r *UserBindingsResolver) ResolveGroups(ctx context.Context, user *User) ([]string, error) {
	// Try different lookup keys in order of preference
	lookupKeys := []string{
		user.Sub,   // OIDC subject ID (preferred)
		user.Email, // Email address
		user.ID,    // User ID
	}

	for _, key := range lookupKeys {
		if key != "" {
			binding, err := r.store.GetUserBinding(ctx, key)
			if err == nil && binding != nil {
				r.logger.Debug("Found user binding",
					zap.String("lookup_key", key),
					zap.String("user_sub", user.Sub),
					zap.String("user_email", user.Email),
					zap.Strings("groups", binding.Groups))

				// Store namespaces in user context for later use
				// This is a temporary solution - in production you might want
				// to return both groups and namespaces from the resolver

				return binding.Groups, nil
			}
		}
	}

	return nil, fmt.Errorf("no binding found for user %s (tried keys: %v)",
		user.Email, lookupKeys)
}

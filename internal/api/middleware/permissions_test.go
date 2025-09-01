package middleware

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/aaronlmathis/kaptn/internal/auth"
	"github.com/aaronlmathis/kaptn/internal/config"
	"go.uber.org/zap/zaptest"
)

// MockPermissionChecker for testing
type MockPermissionChecker struct {
	allowMap map[string]bool
	err      error
}

func (m *MockPermissionChecker) Can(ctx context.Context, user *auth.User, verb, resource, namespace, name string) error {
	key := verb + ":" + resource + ":" + namespace
	if m.err != nil {
		return m.err
	}
	if m.allowMap[key] {
		return nil
	}
	return &PermissionError{
		Code:    "FORBIDDEN",
		Message: "Access denied",
		Status:  http.StatusForbidden,
	}
}

func TestPermissionMiddleware_RequirePermission(t *testing.T) {
	logger := zaptest.NewLogger(t)
	cfg := &config.Config{
		Security: config.SecurityConfig{
			AuthMode: "oidc",
		},
	}

	t.Run("allows access when permission granted", func(t *testing.T) {
		checker := &MockPermissionChecker{
			allowMap: map[string]bool{
				"get:pods:default": true,
			},
		}
		middleware := NewPermissionMiddleware(logger, cfg, checker)

		user := &auth.User{ID: "test-user", Email: "test@example.com"}
		ctx := auth.WithUser(context.Background(), user)
		req := httptest.NewRequest("GET", "/test", nil).WithContext(ctx)
		rec := httptest.NewRecorder()

		called := false
		handler := middleware.RequirePermission(ResourcePermission{
			Verb:      "get",
			Resource:  "pods",
			Namespace: "default",
		})(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			called = true
			w.WriteHeader(http.StatusOK)
		}))

		handler.ServeHTTP(rec, req)

		if !called {
			t.Error("expected handler to be called")
		}
		if rec.Code != http.StatusOK {
			t.Errorf("expected status %d, got %d", http.StatusOK, rec.Code)
		}
	})

	t.Run("denies access when permission denied", func(t *testing.T) {
		checker := &MockPermissionChecker{
			allowMap: map[string]bool{}, // No permissions granted
		}
		middleware := NewPermissionMiddleware(logger, cfg, checker)

		user := &auth.User{ID: "test-user", Email: "test@example.com"}
		ctx := auth.WithUser(context.Background(), user)
		req := httptest.NewRequest("GET", "/test", nil).WithContext(ctx)
		rec := httptest.NewRecorder()

		called := false
		handler := middleware.RequirePermission(ResourcePermission{
			Verb:      "get",
			Resource:  "pods",
			Namespace: "default",
		})(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			called = true
			w.WriteHeader(http.StatusOK)
		}))

		handler.ServeHTTP(rec, req)

		if called {
			t.Error("expected handler not to be called")
		}
		if rec.Code != http.StatusForbidden {
			t.Errorf("expected status %d, got %d", http.StatusForbidden, rec.Code)
		}
	})

	t.Run("denies access when no user", func(t *testing.T) {
		checker := &MockPermissionChecker{allowMap: map[string]bool{}}
		middleware := NewPermissionMiddleware(logger, cfg, checker)

		req := httptest.NewRequest("GET", "/test", nil)
		rec := httptest.NewRecorder()

		called := false
		handler := middleware.RequirePermission(ResourcePermission{
			Verb:     "get",
			Resource: "pods",
		})(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			called = true
		}))

		handler.ServeHTTP(rec, req)

		if called {
			t.Error("expected handler not to be called")
		}
		if rec.Code != http.StatusUnauthorized {
			t.Errorf("expected status %d, got %d", http.StatusUnauthorized, rec.Code)
		}
	})

	t.Run("allows access when auth mode is none", func(t *testing.T) {
		cfgNone := &config.Config{
			Security: config.SecurityConfig{
				AuthMode: "none",
			},
		}
		checker := &MockPermissionChecker{allowMap: map[string]bool{}} // No permissions
		middleware := NewPermissionMiddleware(logger, cfgNone, checker)

		req := httptest.NewRequest("GET", "/test", nil)
		rec := httptest.NewRecorder()

		called := false
		handler := middleware.RequirePermission(ResourcePermission{
			Verb:     "get",
			Resource: "pods",
		})(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			called = true
			w.WriteHeader(http.StatusOK)
		}))

		handler.ServeHTTP(rec, req)

		if !called {
			t.Error("expected handler to be called in none mode")
		}
		if rec.Code != http.StatusOK {
			t.Errorf("expected status %d, got %d", http.StatusOK, rec.Code)
		}
	})
}

func TestPermissionError_Error(t *testing.T) {
	err := &PermissionError{
		Code:    "FORBIDDEN",
		Message: "Access denied",
		Status:  http.StatusForbidden,
	}

	if err.Error() != "Access denied" {
		t.Errorf("expected message %q, got %q", "Access denied", err.Error())
	}
}

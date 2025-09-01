package middleware

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/aaronlmathis/kaptn/internal/auth"
	"go.uber.org/zap/zaptest"
)

func TestAuthExtractor_GetUser(t *testing.T) {
	logger := zaptest.NewLogger(t)
	extractor := NewAuthExtractor(logger)

	t.Run("returns user when present in context", func(t *testing.T) {
		user := &auth.User{
			ID:    "test-user",
			Email: "test@example.com",
		}
		ctx := auth.WithUser(context.Background(), user)

		result, ok := extractor.GetUser(ctx)
		if !ok {
			t.Fatal("expected user to be found")
		}
		if result.ID != user.ID {
			t.Errorf("expected user ID %s, got %s", user.ID, result.ID)
		}
	})

	t.Run("returns false when no user in context", func(t *testing.T) {
		ctx := context.Background()

		_, ok := extractor.GetUser(ctx)
		if ok {
			t.Error("expected no user to be found")
		}
	})
}

func TestAuthExtractor_GetUserFromRequest(t *testing.T) {
	logger := zaptest.NewLogger(t)
	extractor := NewAuthExtractor(logger)

	t.Run("extracts user from request context", func(t *testing.T) {
		user := &auth.User{
			ID:    "test-user",
			Email: "test@example.com",
		}
		ctx := auth.WithUser(context.Background(), user)
		req := httptest.NewRequest("GET", "/test", nil).WithContext(ctx)

		result, ok := extractor.GetUserFromRequest(req)
		if !ok {
			t.Fatal("expected user to be found")
		}
		if result.ID != user.ID {
			t.Errorf("expected user ID %s, got %s", user.ID, result.ID)
		}
	})
}

func TestAuthExtractor_RequireUser(t *testing.T) {
	logger := zaptest.NewLogger(t)
	extractor := NewAuthExtractor(logger)

	t.Run("returns user when present", func(t *testing.T) {
		user := &auth.User{
			ID:    "test-user",
			Email: "test@example.com",
		}
		ctx := auth.WithUser(context.Background(), user)

		result, err := extractor.RequireUser(ctx)
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}
		if result.ID != user.ID {
			t.Errorf("expected user ID %s, got %s", user.ID, result.ID)
		}
	})

	t.Run("returns error when no user", func(t *testing.T) {
		ctx := context.Background()

		_, err := extractor.RequireUser(ctx)
		if err == nil {
			t.Fatal("expected error when no user")
		}

		authErr, ok := err.(*AuthError)
		if !ok {
			t.Fatalf("expected AuthError, got %T", err)
		}
		if authErr.Status != http.StatusUnauthorized {
			t.Errorf("expected status %d, got %d", http.StatusUnauthorized, authErr.Status)
		}
	})
}

func TestAuthError_Error(t *testing.T) {
	err := &AuthError{
		Code:    "TEST_ERROR",
		Message: "Test error message",
		Status:  http.StatusBadRequest,
	}

	if err.Error() != "Test error message" {
		t.Errorf("expected message %q, got %q", "Test error message", err.Error())
	}
}

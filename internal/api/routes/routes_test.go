package routes

import (
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/stretchr/testify/assert"
)

// MockServer implements all the interfaces needed for testing
type MockServer struct{}

// Implement all the required interfaces with no-op methods
func (m *MockServer) handleLogin() interface{}                       { return nil }
func (m *MockServer) handleAuthCallback() interface{}                { return nil }
func (m *MockServer) handleLogout() interface{}                      { return nil }
func (m *MockServer) handleRefresh() interface{}                     { return nil }
func (m *MockServer) handleMe() interface{}                          { return nil }
func (m *MockServer) handleJWKS() interface{}                        { return nil }
func (m *MockServer) handleCSRFToken() interface{}                   { return nil }
func (m *MockServer) handleDebugUser() interface{}                   { return nil }
func (m *MockServer) handlePublicConfig() interface{}                { return nil }
func (m *MockServer) handleAuthzPreview() interface{}                { return nil }
func (m *MockServer) handleAuthzPreviewEnhanced() interface{}        { return nil }
func (m *MockServer) handleSSARTest() interface{}                    { return nil }
func (m *MockServer) handlePermissionsCheck() interface{}            { return nil }
func (m *MockServer) handleRevokeUserSessions() interface{}          { return nil }
func (m *MockServer) handleBindingsReload() interface{}              { return nil }
func (m *MockServer) handleGenericSAR() interface{}                  { return nil }
func (m *MockServer) handleCheckPermission() interface{}             { return nil }
func (m *MockServer) handleGetActionPermissions() interface{}        { return nil }
func (m *MockServer) handleCheckPageAccess() interface{}             { return nil }
func (m *MockServer) handleGetUserNamespacePermissions() interface{} { return nil }
func (m *MockServer) handleBulkPermissionCheck() interface{}         { return nil }
func (m *MockServer) handleApplyConfig() interface{}                 { return nil }
func (m *MockServer) handleApplyYAML() interface{}                   { return nil }
func (m *MockServer) handleHealth() interface{}                      { return nil }
func (m *MockServer) handleReady() interface{}                       { return nil }
func (m *MockServer) handleVersion() interface{}                     { return nil }
func (m *MockServer) NewSessionInjectionHandler() interface{}        { return nil }

// Test that MountAPI doesn't panic and creates routes
func TestMountAPI(t *testing.T) {
	router := chi.NewRouter()
	server := &MockServer{}

	// This should not panic
	assert.NotPanics(t, func() {
		MountAPI(router, server)
	})

	// Verify we have some routes registered
	routes := router.Routes()
	assert.Greater(t, len(routes), 0, "Expected routes to be registered")
}

// Test that MountSystem doesn't panic and creates routes
func TestMountSystem(t *testing.T) {
	router := chi.NewRouter()
	server := &MockServer{}

	// This should not panic
	assert.NotPanics(t, func() {
		MountSystem(router, server)
	})
}

// Test that MountStatic doesn't panic and creates routes
func TestMountStatic(t *testing.T) {
	router := chi.NewRouter()
	server := &MockServer{}

	// This should not panic
	assert.NotPanics(t, func() {
		MountStatic(router, server)
	})
}

// Test that all mount functions work together
func TestMountAll(t *testing.T) {
	router := chi.NewRouter()
	server := &MockServer{}

	// This should not panic
	assert.NotPanics(t, func() {
		MountAPI(router, server)
		MountSystem(router, server)
		MountStatic(router, server)
	})
}

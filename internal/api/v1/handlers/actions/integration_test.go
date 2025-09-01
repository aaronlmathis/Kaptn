package actions

import "testing"

// TestParserIntegration verifies that the parser integrates correctly
// with the action handling workflow, matching the previous parseAction behavior
func TestParserIntegration(t *testing.T) {
	parser := NewDefaultParser()

	// Test cases that verify exact behavior match with the old parseAction function
	testCases := []struct {
		action       string
		wantResource string
		wantVerb     string
	}{
		// Pods
		{"restart-pods", "pods", "update"},
		{"delete-pods", "pods", "delete"},
		{"get-logs", "pods", "get"},
		{"describe-pods", "pods", "get"},

		// Deployments
		{"restart-deployments", "deployments", "update"},
		{"scale-deployments", "deployments", "update"},
		{"delete-deployments", "deployments", "delete"},
		{"describe-deployments", "deployments", "get"},

		// Services
		{"delete-services", "services", "delete"},
		{"describe-services", "services", "get"},

		// ConfigMaps
		{"delete-configmaps", "configmaps", "delete"},
		{"edit-configmaps", "configmaps", "update"},
		{"describe-configmaps", "configmaps", "get"},

		// Secrets
		{"delete-secrets", "secrets", "delete"},
		{"edit-secrets", "secrets", "update"},
		{"view-secrets", "secrets", "get"},
		{"describe-secrets", "secrets", "get"},

		// Unknown actions should return "unknown", "unknown"
		{"unknown-action", "unknown", "unknown"},
	}

	for _, tc := range testCases {
		t.Run(tc.action, func(t *testing.T) {
			resource, verb := parser.Parse(tc.action)

			if resource != tc.wantResource {
				t.Errorf("Parse(%q) resource = %q, want %q", tc.action, resource, tc.wantResource)
			}

			if verb != tc.wantVerb {
				t.Errorf("Parse(%q) verb = %q, want %q", tc.action, verb, tc.wantVerb)
			}
		})
	}
}

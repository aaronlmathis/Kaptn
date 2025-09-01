package actions

import "testing"

func TestDefaultParser_Parse(t *testing.T) {
	tests := []struct {
		name         string
		action       string
		expectedRes  string
		expectedVerb string
	}{
		// Pod actions
		{
			name:         "restart pods",
			action:       "restart-pods",
			expectedRes:  "pods",
			expectedVerb: "update",
		},
		{
			name:         "delete pods",
			action:       "delete-pods",
			expectedRes:  "pods",
			expectedVerb: "delete",
		},
		{
			name:         "get pod logs",
			action:       "get-logs",
			expectedRes:  "pods",
			expectedVerb: "get",
		},
		{
			name:         "describe pods",
			action:       "describe-pods",
			expectedRes:  "pods",
			expectedVerb: "get",
		},

		// Deployment actions
		{
			name:         "restart deployments",
			action:       "restart-deployments",
			expectedRes:  "deployments",
			expectedVerb: "update",
		},
		{
			name:         "scale deployments",
			action:       "scale-deployments",
			expectedRes:  "deployments",
			expectedVerb: "update",
		},
		{
			name:         "delete deployments",
			action:       "delete-deployments",
			expectedRes:  "deployments",
			expectedVerb: "delete",
		},
		{
			name:         "describe deployments",
			action:       "describe-deployments",
			expectedRes:  "deployments",
			expectedVerb: "get",
		},

		// Service actions
		{
			name:         "delete services",
			action:       "delete-services",
			expectedRes:  "services",
			expectedVerb: "delete",
		},
		{
			name:         "describe services",
			action:       "describe-services",
			expectedRes:  "services",
			expectedVerb: "get",
		},

		// ConfigMap actions
		{
			name:         "delete configmaps",
			action:       "delete-configmaps",
			expectedRes:  "configmaps",
			expectedVerb: "delete",
		},
		{
			name:         "edit configmaps",
			action:       "edit-configmaps",
			expectedRes:  "configmaps",
			expectedVerb: "update",
		},
		{
			name:         "describe configmaps",
			action:       "describe-configmaps",
			expectedRes:  "configmaps",
			expectedVerb: "get",
		},

		// Secret actions
		{
			name:         "delete secrets",
			action:       "delete-secrets",
			expectedRes:  "secrets",
			expectedVerb: "delete",
		},
		{
			name:         "edit secrets",
			action:       "edit-secrets",
			expectedRes:  "secrets",
			expectedVerb: "update",
		},
		{
			name:         "view secrets",
			action:       "view-secrets",
			expectedRes:  "secrets",
			expectedVerb: "get",
		},
		{
			name:         "describe secrets",
			action:       "describe-secrets",
			expectedRes:  "secrets",
			expectedVerb: "get",
		},

		// Edge cases
		{
			name:         "unknown action",
			action:       "unknown-action",
			expectedRes:  "unknown",
			expectedVerb: "unknown",
		},
		{
			name:         "empty action",
			action:       "",
			expectedRes:  "unknown",
			expectedVerb: "unknown",
		},
		{
			name:         "malformed action",
			action:       "restart--pods",
			expectedRes:  "unknown",
			expectedVerb: "unknown",
		},
	}

	parser := &DefaultParser{}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			resource, verb := parser.Parse(tt.action)

			if resource != tt.expectedRes {
				t.Errorf("Parse(%q) resource = %q, want %q", tt.action, resource, tt.expectedRes)
			}

			if verb != tt.expectedVerb {
				t.Errorf("Parse(%q) verb = %q, want %q", tt.action, verb, tt.expectedVerb)
			}
		})
	}
}

func TestDefaultParser_ParsePods(t *testing.T) {
	tests := []struct {
		name         string
		action       string
		expectedRes  string
		expectedVerb string
	}{
		{
			name:         "restart pods",
			action:       "restart-pods",
			expectedRes:  "pods",
			expectedVerb: "update",
		},
		{
			name:         "delete pods",
			action:       "delete-pods",
			expectedRes:  "pods",
			expectedVerb: "delete",
		},
		{
			name:         "get logs",
			action:       "get-logs",
			expectedRes:  "pods",
			expectedVerb: "get",
		},
		{
			name:         "describe pods",
			action:       "describe-pods",
			expectedRes:  "pods",
			expectedVerb: "get",
		},
		{
			name:         "non-pod action",
			action:       "delete-services",
			expectedRes:  "",
			expectedVerb: "",
		},
	}

	parser := &DefaultParser{}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			resource, verb := parser.parsePods(tt.action)

			if resource != tt.expectedRes {
				t.Errorf("parsePods(%q) resource = %q, want %q", tt.action, resource, tt.expectedRes)
			}

			if verb != tt.expectedVerb {
				t.Errorf("parsePods(%q) verb = %q, want %q", tt.action, verb, tt.expectedVerb)
			}
		})
	}
}

func TestDefaultParser_ParseDeployments(t *testing.T) {
	tests := []struct {
		name         string
		action       string
		expectedRes  string
		expectedVerb string
	}{
		{
			name:         "restart deployments",
			action:       "restart-deployments",
			expectedRes:  "deployments",
			expectedVerb: "update",
		},
		{
			name:         "scale deployments",
			action:       "scale-deployments",
			expectedRes:  "deployments",
			expectedVerb: "update",
		},
		{
			name:         "delete deployments",
			action:       "delete-deployments",
			expectedRes:  "deployments",
			expectedVerb: "delete",
		},
		{
			name:         "describe deployments",
			action:       "describe-deployments",
			expectedRes:  "deployments",
			expectedVerb: "get",
		},
		{
			name:         "non-deployment action",
			action:       "delete-pods",
			expectedRes:  "",
			expectedVerb: "",
		},
	}

	parser := &DefaultParser{}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			resource, verb := parser.parseDeployments(tt.action)

			if resource != tt.expectedRes {
				t.Errorf("parseDeployments(%q) resource = %q, want %q", tt.action, resource, tt.expectedRes)
			}

			if verb != tt.expectedVerb {
				t.Errorf("parseDeployments(%q) verb = %q, want %q", tt.action, verb, tt.expectedVerb)
			}
		})
	}
}

func TestNewDefaultParser(t *testing.T) {
	parser := NewDefaultParser()

	if parser == nil {
		t.Error("NewDefaultParser() returned nil")
	}

	// Test that it implements the Parser interface
	var _ Parser = parser

	// Test basic functionality
	resource, verb := parser.Parse("restart-pods")
	if resource != "pods" || verb != "update" {
		t.Errorf("NewDefaultParser().Parse('restart-pods') = (%q, %q), want ('pods', 'update')", resource, verb)
	}
}

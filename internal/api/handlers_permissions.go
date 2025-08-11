package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/aaronlmathis/kaptn/internal/auth"
	"github.com/aaronlmathis/kaptn/internal/k8s"
	"github.com/go-chi/chi/v5"
	"go.uber.org/zap"
	authzv1 "k8s.io/api/authorization/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
)

// NamespacePermissions represents what a user can do in which namespaces
type NamespacePermissions struct {
	UserEmail   string                         `json:"user_email"`
	Permissions map[string]ResourcePermissions `json:"permissions"` // namespace -> permissions
}

type ResourcePermissions struct {
	Pods        []string `json:"pods"`        // ["get", "list", "watch"]
	Deployments []string `json:"deployments"` // ["get", "list"]
	Services    []string `json:"services"`    // ["get", "list", "create"]
	Secrets     []string `json:"secrets"`     // ["get", "list", "create", "delete"]
}

// handleCheckPermission provides a REST endpoint for checking specific permissions
// This supports the UI gating requirements of Phase 6
func (s *Server) handleCheckPermission(w http.ResponseWriter, r *http.Request) {
	// Get authenticated user - this should be your Google user with resolved groups
	user, ok := auth.UserFromContext(r.Context())
	if !ok || user == nil {
		http.Error(w, "Authentication required", http.StatusUnauthorized)
		return
	}

	// Get query parameters
	verb := r.URL.Query().Get("verb")
	resource := r.URL.Query().Get("resource")
	namespace := r.URL.Query().Get("namespace")
	name := r.URL.Query().Get("name")

	if verb == "" || resource == "" {
		http.Error(w, "verb and resource parameters are required", http.StatusBadRequest)
		return
	}

	// Get impersonated clients
	clients, err := s.GetImpersonatedClients(r)
	if err != nil {
		s.logger.Error("Failed to get impersonated clients", zap.Error(err))
		http.Error(w, "Impersonated clients not available", http.StatusInternalServerError)
		return
	}

	// Check permission using helper
	permissionHelper := s.impersonationMgr.PermissionHelper()
	allowed, err := permissionHelper.Can(r.Context(), clients.Client(), verb, resource, namespace, name)
	if err != nil {
		s.logger.Error("Failed to check permission",
			zap.Error(err),
			zap.String("verb", verb),
			zap.String("resource", resource),
			zap.String("namespace", namespace),
			zap.String("name", name))
		http.Error(w, "Failed to check permission", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"allowed":   allowed,
		"verb":      verb,
		"resource":  resource,
		"namespace": namespace,
		"name":      name,
		"user":      user.Email,
	})
}

// handleGetActionPermissions returns common UI action permissions for a namespace
func (s *Server) handleGetActionPermissions(w http.ResponseWriter, r *http.Request) {
	// Get authenticated user - this should be your Google user with resolved groups
	user, ok := auth.UserFromContext(r.Context())
	if !ok || user == nil {
		http.Error(w, "Authentication required", http.StatusUnauthorized)
		return
	}

	// Get namespace from URL or query parameter
	namespace := chi.URLParam(r, "namespace")
	if namespace == "" {
		namespace = r.URL.Query().Get("namespace")
	}

	// Get impersonated clients
	clients, err := s.GetImpersonatedClients(r)
	if err != nil {
		s.logger.Error("Failed to get impersonated clients", zap.Error(err))
		http.Error(w, "Impersonated clients not available", http.StatusInternalServerError)
		return
	}

	// Get action permissions
	permissionHelper := s.impersonationMgr.PermissionHelper()
	permissions, err := permissionHelper.GetActionPermissions(r.Context(), clients.Client(), namespace)
	if err != nil {
		s.logger.Error("Failed to get action permissions",
			zap.Error(err),
			zap.String("namespace", namespace))
		http.Error(w, "Failed to get permissions", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"namespace":   namespace,
		"permissions": permissions,
		"user":        user.Email,
	})
}

// handleCheckPageAccess implements page-level access gating as required by Phase 6
func (s *Server) handleCheckPageAccess(w http.ResponseWriter, r *http.Request) {
	// Get authenticated user - this should be your Google user with resolved groups
	user, ok := auth.UserFromContext(r.Context())
	if !ok || user == nil {
		http.Error(w, "Authentication required", http.StatusUnauthorized)
		return
	}

	// Get query parameters
	resource := r.URL.Query().Get("resource")
	namespace := r.URL.Query().Get("namespace")

	if resource == "" {
		http.Error(w, "resource parameter is required", http.StatusBadRequest)
		return
	}

	// Get impersonated clients
	clients, err := s.GetImpersonatedClients(r)
	if err != nil {
		s.logger.Error("Failed to get impersonated clients", zap.Error(err))
		http.Error(w, "Impersonated clients not available", http.StatusInternalServerError)
		return
	}

	// Check page access
	permissionHelper := s.impersonationMgr.PermissionHelper()
	allowed, err := permissionHelper.CheckPageAccess(r.Context(), clients.Client(), resource, namespace)
	if err != nil {
		s.logger.Error("Failed to check page access",
			zap.Error(err),
			zap.String("resource", resource),
			zap.String("namespace", namespace))
		http.Error(w, "Failed to check page access", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"allowed":   allowed,
		"resource":  resource,
		"namespace": namespace,
		"user":      user.Email,
	})
}

// handleBulkPermissionCheck checks multiple permissions in a single request
func (s *Server) handleBulkPermissionCheck(w http.ResponseWriter, r *http.Request) {
	// Get authenticated user - this should be your Google user with resolved groups
	user, ok := auth.UserFromContext(r.Context())
	if !ok || user == nil {
		http.Error(w, "Authentication required", http.StatusUnauthorized)
		return
	}

	// Parse request body
	var req struct {
		Checks []k8s.PermissionCheck `json:"checks"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if len(req.Checks) == 0 {
		http.Error(w, "No permission checks provided", http.StatusBadRequest)
		return
	}

	// Get impersonated clients
	clients, err := s.GetImpersonatedClients(r)
	if err != nil {
		s.logger.Error("Failed to get impersonated clients", zap.Error(err))
		http.Error(w, "Impersonated clients not available", http.StatusInternalServerError)
		return
	}

	// Check permissions
	permissionHelper := s.impersonationMgr.PermissionHelper()
	results, err := permissionHelper.CheckMultipleActions(r.Context(), clients.Client(), req.Checks)
	if err != nil {
		s.logger.Error("Failed to check bulk permissions", zap.Error(err))
		http.Error(w, "Failed to check permissions", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"results": results,
		"user":    user.Email,
		"total":   len(req.Checks),
	})
}

// Phase 6 Test Page Handler - creates a test page for demonstrating SSAR UI integration
func (s *Server) handlePhase6TestPage(w http.ResponseWriter, r *http.Request) {
	// Get authenticated user - this should be your Google user with resolved groups
	user, ok := auth.UserFromContext(r.Context())
	if !ok || user == nil {
		// Redirect to login if not authenticated
		http.Redirect(w, r, "/test-login", http.StatusSeeOther)
		return
	}

	// Get namespace from query parameter, default to "default"
	namespace := r.URL.Query().Get("namespace")
	if namespace == "" {
		namespace = "default"
	}

	// Get impersonated clients
	clients, err := s.GetImpersonatedClients(r)
	if err != nil {
		s.logger.Error("Failed to get impersonated clients", zap.Error(err))
		http.Error(w, "Impersonated clients not available", http.StatusInternalServerError)
		return
	}

	// Get action permissions for the test page
	permissionHelper := s.impersonationMgr.PermissionHelper()
	permissions, err := permissionHelper.GetActionPermissions(r.Context(), clients.Client(), namespace)
	if err != nil {
		s.logger.Error("Failed to get action permissions", zap.Error(err))
		http.Error(w, "Failed to get permissions", http.StatusInternalServerError)
		return
	}

	// Create test page HTML
	html := `<!DOCTYPE html>
<html>
<head>
    <title>Phase 6 - SSAR UI Gating Test</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
        .action-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
        .action-card { border: 1px solid #ddd; border-radius: 8px; padding: 20px; }
        .allowed { background: #d4edda; border-color: #c3e6cb; }
        .denied { background: #f8d7da; border-color: #f5c6cb; }
        .button { padding: 10px 20px; margin: 5px; border: none; border-radius: 4px; cursor: pointer; }
        .button:disabled { opacity: 0.5; cursor: not-allowed; }
        .success { background: #28a745; color: white; }
        .danger { background: #dc3545; color: white; }
        .secondary { background: #6c757d; color: white; }
        .test-results { margin-top: 20px; padding: 20px; background: #f8f9fa; border-radius: 8px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🚀 Phase 6 Complete - SSAR UI Gating Test</h1>
        <p><strong>User:</strong> ` + user.Email + `</p>
        <p><strong>Namespace:</strong> ` + namespace + `</p>
        <p><strong>Groups:</strong> ` + strings.Join(user.Groups, ", ") + `</p>
    </div>

    <div class="action-grid">
        <div class="action-card ` + getCardClass(permissions.CanDeploy) + `">
            <h3>📦 Deploy Applications</h3>
            <p>Create deployments in namespace</p>
            <button class="button ` + getButtonClass(permissions.CanDeploy) + `" ` + getDisabled(permissions.CanDeploy) + `>
                Deploy App
            </button>
        </div>

        <div class="action-card ` + getCardClass(permissions.CanScale) + `">
            <h3>📈 Scale Resources</h3>
            <p>Scale deployments up/down</p>
            <button class="button ` + getButtonClass(permissions.CanScale) + `" ` + getDisabled(permissions.CanScale) + `>
                Scale Resource
            </button>
        </div>

        <div class="action-card ` + getCardClass(permissions.CanDelete) + `">
            <h3>🗑️ Delete Resources</h3>
            <p>Delete pods and other resources</p>
            <button class="button ` + getButtonClass(permissions.CanDelete) + `" ` + getDisabled(permissions.CanDelete) + `>
                Delete Resource
            </button>
        </div>

        <div class="action-card ` + getCardClass(permissions.CanEditSecrets) + `">
            <h3>🔐 Manage Secrets</h3>
            <p>Create/update secrets</p>
            <button class="button ` + getButtonClass(permissions.CanEditSecrets) + `" ` + getDisabled(permissions.CanEditSecrets) + `>
                Edit Secrets
            </button>
        </div>

        <div class="action-card ` + getCardClass(permissions.CanCreateNamespace) + `">
            <h3>🏗️ Create Namespaces</h3>
            <p>Create new namespaces</p>
            <button class="button ` + getButtonClass(permissions.CanCreateNamespace) + `" ` + getDisabled(permissions.CanCreateNamespace) + `>
                Create Namespace
            </button>
        </div>

        <div class="action-card ` + getCardClass(permissions.CanViewLogs) + `">
            <h3>📋 View Logs</h3>
            <p>View pod logs</p>
            <button class="button ` + getButtonClass(permissions.CanViewLogs) + `" ` + getDisabled(permissions.CanViewLogs) + `>
                View Logs
            </button>
        </div>

        <div class="action-card ` + getCardClass(permissions.CanExec) + `">
            <h3>💻 Execute Commands</h3>
            <p>Exec into pods</p>
            <button class="button ` + getButtonClass(permissions.CanExec) + `" ` + getDisabled(permissions.CanExec) + `>
                Exec into Pod
            </button>
        </div>
    </div>

    <div class="test-results">
        <h3>Test Individual Permissions</h3>
        <button onclick="testPermission('list', 'pods', '` + namespace + `')" class="button secondary">
            Test: List Pods
        </button>
        <button onclick="testPermission('create', 'deployments', '` + namespace + `')" class="button secondary">
            Test: Create Deployment
        </button>
        <button onclick="testPermission('delete', 'pods', '` + namespace + `')" class="button secondary">
            Test: Delete Pod
        </button>
        <button onclick="testPageAccess('pods', '` + namespace + `')" class="button secondary">
            Test: Page Access (Pods)
        </button>
        <div id="test-output" style="margin-top: 10px; white-space: pre-wrap; font-family: monospace;"></div>
    </div>

    <script>
        async function testPermission(verb, resource, namespace) {
            try {
                const url = '/api/v1/permissions/check?verb=' + verb + '&resource=' + resource + '&namespace=' + namespace;
                const response = await fetch(url);
                const data = await response.json();
                
                document.getElementById('test-output').textContent = 
                    'Permission Check: ' + verb + ' ' + resource + ' in ' + namespace + '\n' +
                    'Allowed: ' + data.allowed + '\n' +
                    'Response: ' + JSON.stringify(data, null, 2);
            } catch (error) {
                document.getElementById('test-output').textContent = 'Error: ' + error.message;
            }
        }

        async function testPageAccess(resource, namespace) {
            try {
                const url = '/api/v1/permissions/page-access?resource=' + resource + '&namespace=' + namespace;
                const response = await fetch(url);
                const data = await response.json();
                
                document.getElementById('test-output').textContent = 
                    'Page Access Check: ' + resource + ' in ' + namespace + '\n' +
                    'Allowed: ' + data.allowed + '\n' +
                    'Response: ' + JSON.stringify(data, null, 2);
            } catch (error) {
                document.getElementById('test-output').textContent = 'Error: ' + error.message;
            }
        }
    </script>
</body>
</html>`

	w.Header().Set("Content-Type", "text/html")
	w.Write([]byte(html))
}

// Helper functions for the test page
func getCardClass(allowed bool) string {
	if allowed {
		return "allowed"
	}
	return "denied"
}

func getButtonClass(allowed bool) string {
	if allowed {
		return "success"
	}
	return "danger"
}

func getDisabled(allowed bool) string {
	if allowed {
		return ""
	}
	return "disabled"
}

// handleGetUserNamespacePermissions returns granular namespace-scoped permissions for the current user
func (s *Server) handleGetUserNamespacePermissions(w http.ResponseWriter, r *http.Request) {
	// Get authenticated user
	user, ok := auth.UserFromContext(r.Context())
	if !ok || user == nil {
		http.Error(w, "Authentication required", http.StatusUnauthorized)
		return
	}

	// Get impersonated clients
	clients, err := s.GetImpersonatedClients(r)
	if err != nil {
		s.logger.Error("Failed to get impersonated clients", zap.Error(err))
		http.Error(w, "Impersonated clients not available", http.StatusInternalServerError)
		return
	}

	// Get user's namespace permissions
	clientset, ok := clients.Client().(*kubernetes.Clientset)
	if !ok {
		s.logger.Error("Failed to cast client to Clientset")
		http.Error(w, "Client type error", http.StatusInternalServerError)
		return
	}

	permissions, err := GetUserNamespacePermissions(r.Context(), clientset, user.Email)
	if err != nil {
		s.logger.Error("Failed to get user namespace permissions",
			zap.Error(err),
			zap.String("user", user.Email))
		http.Error(w, "Failed to get permissions", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(permissions)
}

// GetUserNamespacePermissions checks what the user can access in each namespace
func GetUserNamespacePermissions(ctx context.Context, clientset *kubernetes.Clientset, userEmail string) (*NamespacePermissions, error) {
	// Get all namespaces first
	namespaces, err := clientset.CoreV1().Namespaces().List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to list namespaces: %v", err)
	}

	permissions := &NamespacePermissions{
		UserEmail:   userEmail,
		Permissions: make(map[string]ResourcePermissions),
	}

	// Check permissions for each namespace
	for _, ns := range namespaces.Items {
		nsName := ns.Name

		// Skip system namespaces unless explicitly needed
		if strings.HasPrefix(nsName, "kube-") || nsName == "default" {
			continue
		}

		resourcePerms := ResourcePermissions{}

		// Check Pod permissions
		resourcePerms.Pods = checkResourcePermissions(ctx, clientset, userEmail, nsName, "", "pods", []string{"get", "list", "watch", "create", "delete"})

		// Check Deployment permissions
		resourcePerms.Deployments = checkResourcePermissions(ctx, clientset, userEmail, nsName, "apps", "deployments", []string{"get", "list", "watch", "create", "delete"})

		// Check Service permissions
		resourcePerms.Services = checkResourcePermissions(ctx, clientset, userEmail, nsName, "", "services", []string{"get", "list", "watch", "create", "delete"})

		// Check Secret permissions
		resourcePerms.Secrets = checkResourcePermissions(ctx, clientset, userEmail, nsName, "", "secrets", []string{"get", "list", "watch", "create", "delete"})

		// Only include namespace if user has any permissions
		if len(resourcePerms.Pods) > 0 || len(resourcePerms.Deployments) > 0 ||
			len(resourcePerms.Services) > 0 || len(resourcePerms.Secrets) > 0 {
			permissions.Permissions[nsName] = resourcePerms
		}
	}

	return permissions, nil
}

// checkResourcePermissions uses SubjectAccessReview to check what verbs a user can perform
func checkResourcePermissions(ctx context.Context, clientset *kubernetes.Clientset, userEmail, namespace, apiGroup, resource string, verbs []string) []string {
	var allowedVerbs []string

	for _, verb := range verbs {
		// Create SubjectAccessReview
		sar := &authzv1.SubjectAccessReview{
			Spec: authzv1.SubjectAccessReviewSpec{
				User: userEmail,
				ResourceAttributes: &authzv1.ResourceAttributes{
					Namespace: namespace,
					Verb:      verb,
					Group:     apiGroup,
					Resource:  resource,
				},
			},
		}

		// Check if user can perform this action
		result, err := clientset.AuthorizationV1().SubjectAccessReviews().Create(ctx, sar, metav1.CreateOptions{})
		if err != nil {
			// Log error but continue checking other verbs
			continue
		}

		if result.Status.Allowed {
			allowedVerbs = append(allowedVerbs, verb)
		}
	}

	return allowedVerbs
}

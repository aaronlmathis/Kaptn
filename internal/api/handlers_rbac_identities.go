package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"strings"

	"go.uber.org/zap"
	rbacv1 "k8s.io/api/rbac/v1"
)

// Identity represents a discovered RBAC identity
type Identity struct {
	Kind      string            `json:"kind"`      // User, Group, ServiceAccount
	Name      string            `json:"name"`      // Identity name
	Namespace string            `json:"namespace"` // For ServiceAccounts only
	Bindings  []IdentityBinding `json:"bindings,omitempty"`
	Roles     []IdentityRole    `json:"roles,omitempty"`
	FullName  string            `json:"fullName"` // For display: "user:alice@example.com", "group:developers", "serviceaccount:kube-system/default"
	ID        string            `json:"id"`       // Unique identifier for the identity
}

// IdentityBinding represents a binding associated with an identity
type IdentityBinding struct {
	Name      string `json:"name"`
	Namespace string `json:"namespace,omitempty"` // Empty for ClusterRoleBindings
	Kind      string `json:"kind"`                // RoleBinding or ClusterRoleBinding
	RoleName  string `json:"roleName"`
	RoleKind  string `json:"roleKind"` // Role or ClusterRole
}

// IdentityRole represents a role associated with an identity
type IdentityRole struct {
	Name      string `json:"name"`
	Namespace string `json:"namespace,omitempty"` // Empty for ClusterRoles
	Kind      string `json:"kind"`                // Role or ClusterRole
	Rules     int    `json:"rules"`               // Number of rules in the role
}

// IdentitiesResponse represents the API response for listing identities
type IdentitiesResponse struct {
	Items    []Identity `json:"items"`
	Total    int        `json:"total"`
	Page     int        `json:"page"`
	PageSize int        `json:"pageSize"`
	Continue string     `json:"continue,omitempty"`
}

// handleListRBACIdentities handles GET /api/v1/identities
// @Summary List RBAC Identities
// @Description Returns a deduplicated list of identities (Users, Groups, ServiceAccounts) discovered from Kubernetes ClusterRoleBindings and RoleBindings.
// @Tags RBAC
// @Produce json
// @Param kind query string false "Identity kind filter: user|group|serviceaccount|all (default: all)"
// @Param namespace query string false "Filter RoleBindings by namespace (optional; ignored for ClusterRoleBindings)"
// @Param q query string false "Free-text search over identity name (prefix/substring; case-insensitive)"
// @Param include query string false "CSV of expansions: bindings,roles (optional)"
// @Param limit query int false "Maximum number of results (default: 100)"
// @Param continue query string false "Opaque pagination token"
// @Param page query int false "Page number (default: 1)"
// @Success 200 {object} map[string]interface{} "Paginated list of RBAC identities"
// @Failure 400 {string} string "Bad request"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Router /api/v1/identities [get]
func (s *Server) handleListRBACIdentities(w http.ResponseWriter, r *http.Request) {
	// Parse query parameters
	kindFilter := r.URL.Query().Get("kind")
	if kindFilter == "" {
		kindFilter = "all"
	}

	namespace := r.URL.Query().Get("namespace")
	searchQuery := r.URL.Query().Get("q")
	includeStr := r.URL.Query().Get("include")
	continueToken := r.URL.Query().Get("continue")

	limit := 100
	if limitStr := r.URL.Query().Get("limit"); limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 && l <= 1000 {
			limit = l
		}
	}

	page := 1
	if pageStr := r.URL.Query().Get("page"); pageStr != "" {
		if p, err := strconv.Atoi(pageStr); err == nil && p > 0 {
			page = p
		}
	}

	// Parse include expansions
	includeBindings := false
	includeRoles := false
	if includeStr != "" {
		includes := strings.Split(includeStr, ",")
		for _, inc := range includes {
			inc = strings.TrimSpace(inc)
			switch inc {
			case "bindings":
				includeBindings = true
			case "roles":
				includeRoles = true
			}
		}
	}

	// Validate kind filter
	validKinds := map[string]bool{
		"all": true, "user": true, "group": true, "serviceaccount": true,
	}
	if !validKinds[strings.ToLower(kindFilter)] {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error":  "Invalid kind filter. Must be one of: user, group, serviceaccount, all",
			"status": "error",
		})
		return
	}

	// Discover identities from bindings
	identities, err := s.discoverRBACIdentities(r.Context(), kindFilter, namespace, includeBindings, includeRoles)
	if err != nil {
		s.logger.Error("Failed to discover RBAC identities", zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"data": IdentitiesResponse{
				Items:    []Identity{},
				Total:    0,
				Page:     page,
				PageSize: limit,
			},
			"status": "error",
			"error":  err.Error(),
		})
		return
	}

	// Apply search filter
	if searchQuery != "" {
		identities = s.filterIdentitiesBySearch(identities, searchQuery)
	}

	// Store total before pagination
	total := len(identities)

	// Sort identities by kind, then by name
	sort.Slice(identities, func(i, j int) bool {
		if identities[i].Kind != identities[j].Kind {
			return identities[i].Kind < identities[j].Kind
		}
		return identities[i].Name < identities[j].Name
	})

	// Apply pagination
	start := (page - 1) * limit
	end := start + limit
	if start > len(identities) {
		identities = []Identity{}
	} else if end > len(identities) {
		identities = identities[start:]
	} else {
		identities = identities[start:end]
	}

	// Create response
	response := map[string]interface{}{
		"status": "success",
		"data": IdentitiesResponse{
			Items:    identities,
			Total:    total,
			Page:     page,
			PageSize: limit,
			Continue: continueToken, // For future implementation
		},
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(response)
}

// discoverRBACIdentities discovers identities from RoleBindings and ClusterRoleBindings
func (s *Server) discoverRBACIdentities(ctx context.Context, kindFilter, namespaceFilter string, includeBindings, includeRoles bool) ([]Identity, error) {
	identityMap := make(map[string]*Identity) // Key: identity ID

	// Get ClusterRoleBindings
	clusterRoleBindings, err := s.resourceManager.ListClusterRoleBindings(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to list cluster role bindings: %w", err)
	}

	// Process ClusterRoleBindings
	for _, crb := range clusterRoleBindings {
		s.processBindingSubjects(crb.Subjects, crb.RoleRef, "", crb.Name, "ClusterRoleBinding", kindFilter, identityMap, includeBindings)
	}

	// Get RoleBindings
	roleBindings, err := s.resourceManager.ListRoleBindings(ctx, namespaceFilter)
	if err != nil {
		return nil, fmt.Errorf("failed to list role bindings: %w", err)
	}

	// Process RoleBindings
	for _, rb := range roleBindings {
		// Convert interface{} to *rbacv1.RoleBinding
		var roleBinding *rbacv1.RoleBinding
		switch v := rb.(type) {
		case *rbacv1.RoleBinding:
			roleBinding = v
		case rbacv1.RoleBinding:
			roleBinding = &v
		default:
			// Try JSON marshaling/unmarshaling as fallback
			roleBindingBytes, _ := json.Marshal(rb)
			roleBinding = &rbacv1.RoleBinding{}
			if err := json.Unmarshal(roleBindingBytes, roleBinding); err != nil {
				s.logger.Warn("Failed to convert role binding", zap.Error(err))
				continue
			}
		}

		s.processBindingSubjects(roleBinding.Subjects, roleBinding.RoleRef, roleBinding.Namespace, roleBinding.Name, "RoleBinding", kindFilter, identityMap, includeBindings)
	}

	// Convert map to slice
	var identities []Identity
	for _, identity := range identityMap {
		// Populate roles if requested
		if includeRoles {
			s.populateIdentityRoles(ctx, identity)
		}
		identities = append(identities, *identity)
	}

	return identities, nil
}

// processBindingSubjects processes subjects from a binding and adds them to the identity map
func (s *Server) processBindingSubjects(subjects []rbacv1.Subject, roleRef rbacv1.RoleRef, bindingNamespace, bindingName, bindingKind, kindFilter string, identityMap map[string]*Identity, includeBindings bool) {
	for _, subject := range subjects {
		// Apply kind filter
		subjectKindLower := strings.ToLower(subject.Kind)
		if kindFilter != "all" && kindFilter != subjectKindLower {
			continue
		}

		// Generate identity ID
		var identityID string
		var fullName string
		var namespace string

		switch subject.Kind {
		case "User":
			identityID = fmt.Sprintf("user:%s", subject.Name)
			fullName = fmt.Sprintf("user:%s", subject.Name)
		case "Group":
			identityID = fmt.Sprintf("group:%s", subject.Name)
			fullName = fmt.Sprintf("group:%s", subject.Name)
		case "ServiceAccount":
			saNamespace := subject.Namespace
			if saNamespace == "" {
				saNamespace = bindingNamespace // Use binding namespace as fallback
			}
			namespace = saNamespace
			identityID = fmt.Sprintf("serviceaccount:%s:%s", saNamespace, subject.Name)
			fullName = fmt.Sprintf("serviceaccount:%s/%s", saNamespace, subject.Name)
		default:
			continue // Skip unknown subject kinds
		}

		// Get or create identity
		identity, exists := identityMap[identityID]
		if !exists {
			identity = &Identity{
				ID:        identityID,
				Kind:      subject.Kind,
				Name:      subject.Name,
				Namespace: namespace,
				FullName:  fullName,
				Bindings:  []IdentityBinding{},
				Roles:     []IdentityRole{},
			}
			identityMap[identityID] = identity
		}

		// Add binding information if requested
		if includeBindings {
			binding := IdentityBinding{
				Name:      bindingName,
				Namespace: bindingNamespace,
				Kind:      bindingKind,
				RoleName:  roleRef.Name,
				RoleKind:  roleRef.Kind,
			}
			identity.Bindings = append(identity.Bindings, binding)
		}
	}
}

// populateIdentityRoles populates the roles associated with an identity
func (s *Server) populateIdentityRoles(ctx context.Context, identity *Identity) {
	roleMap := make(map[string]IdentityRole) // Deduplicate roles

	for _, binding := range identity.Bindings {
		roleKey := fmt.Sprintf("%s:%s:%s", binding.RoleKind, binding.Namespace, binding.RoleName)

		if _, exists := roleMap[roleKey]; !exists {
			role := IdentityRole{
				Name:      binding.RoleName,
				Namespace: binding.Namespace,
				Kind:      binding.RoleKind,
				Rules:     0, // Will be populated below
			}

			// Get rule count for the role
			if binding.RoleKind == "ClusterRole" {
				if clusterRole, err := s.resourceManager.GetClusterRole(ctx, binding.RoleName); err == nil {
					role.Rules = len(clusterRole.Rules)
				}
			} else if binding.RoleKind == "Role" && binding.Namespace != "" {
				if roleObj, err := s.resourceManager.GetRole(ctx, binding.Namespace, binding.RoleName); err == nil {
					role.Rules = len(roleObj.Rules)
				}
			}

			roleMap[roleKey] = role
		}
	}

	// Convert map to slice
	for _, role := range roleMap {
		identity.Roles = append(identity.Roles, role)
	}

	// Sort roles
	sort.Slice(identity.Roles, func(i, j int) bool {
		if identity.Roles[i].Kind != identity.Roles[j].Kind {
			return identity.Roles[i].Kind < identity.Roles[j].Kind
		}
		if identity.Roles[i].Namespace != identity.Roles[j].Namespace {
			return identity.Roles[i].Namespace < identity.Roles[j].Namespace
		}
		return identity.Roles[i].Name < identity.Roles[j].Name
	})
}

// filterIdentitiesBySearch filters identities based on search query
func (s *Server) filterIdentitiesBySearch(identities []Identity, searchQuery string) []Identity {
	if searchQuery == "" {
		return identities
	}

	searchLower := strings.ToLower(searchQuery)
	var filtered []Identity

	for _, identity := range identities {
		// Search in name
		if strings.Contains(strings.ToLower(identity.Name), searchLower) {
			filtered = append(filtered, identity)
			continue
		}

		// Search in full name
		if strings.Contains(strings.ToLower(identity.FullName), searchLower) {
			filtered = append(filtered, identity)
			continue
		}

		// Search in namespace (for ServiceAccounts)
		if identity.Namespace != "" && strings.Contains(strings.ToLower(identity.Namespace), searchLower) {
			filtered = append(filtered, identity)
			continue
		}
	}

	return filtered
}

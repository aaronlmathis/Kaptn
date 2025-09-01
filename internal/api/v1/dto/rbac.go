package dto

import "time"

// RoleSummary represents a summary view of a role for list views
type RoleSummary struct {
	ID                string            `json:"id"`
	Name              string            `json:"name"`
	Namespace         string            `json:"namespace"`
	Age               string            `json:"age"`
	Rules             int               `json:"rules"`        // Frontend expects 'rules', not 'ruleCount'
	RulesDisplay      string            `json:"rulesDisplay"` // Frontend expects this field
	VerbCount         int               `json:"verbCount"`
	ResourceCount     int               `json:"resourceCount"`
	CreationTimestamp time.Time         `json:"creationTimestamp"`
	Labels            map[string]string `json:"labels"`
	Annotations       map[string]string `json:"annotations"`
}

// RoleBindingSummary represents a summary view of a role binding for list views
type RoleBindingSummary struct {
	ID                  string            `json:"id"`
	Name                string            `json:"name"`
	Namespace           string            `json:"namespace"`
	Age                 string            `json:"age"`
	RoleName            string            `json:"roleName"`
	RoleKind            string            `json:"roleKind"`
	RoleRef             string            `json:"roleRef"`         // Frontend expects this field
	Subjects            int               `json:"subjects"`        // Frontend expects 'subjects', not 'subjectCount'
	SubjectsDisplay     string            `json:"subjectsDisplay"` // Frontend expects this field
	SubjectCount        int               `json:"subjectCount"`    // Keep for backward compatibility
	UserCount           int               `json:"userCount"`
	GroupCount          int               `json:"groupCount"`
	ServiceAccountCount int               `json:"serviceAccountCount"`
	CreationTimestamp   time.Time         `json:"creationTimestamp"`
	Labels              map[string]string `json:"labels"`
	Annotations         map[string]string `json:"annotations"`
}

// ClusterRoleSummary represents a summary view of a cluster role for list views
type ClusterRoleSummary struct {
	ID                string            `json:"id"`
	Name              string            `json:"name"`
	Age               string            `json:"age"`
	Rules             int               `json:"rules"`
	RulesDisplay      string            `json:"rulesDisplay"`
	VerbCount         int               `json:"verbCount"`
	ResourceCount     int               `json:"resourceCount"`
	CreationTimestamp time.Time         `json:"creationTimestamp"`
	Labels            map[string]string `json:"labels"`
	Annotations       map[string]string `json:"annotations"`
	ResourceVersion   string            `json:"resourceVersion"`
	UID               string            `json:"uid"`
}

// ClusterRoleBindingSummary represents a summary view of a cluster role binding for list views
type ClusterRoleBindingSummary struct {
	ID                  string            `json:"id"`
	Name                string            `json:"name"`
	Age                 string            `json:"age"`
	RoleName            string            `json:"roleName"`
	RoleKind            string            `json:"roleKind"`
	RoleRef             string            `json:"roleRef"`
	SubjectCount        int               `json:"subjectCount"`
	Subjects            int               `json:"subjects"`
	SubjectsDisplay     string            `json:"subjectsDisplay"`
	UserCount           int               `json:"userCount"`
	GroupCount          int               `json:"groupCount"`
	ServiceAccountCount int               `json:"serviceAccountCount"`
	CreationTimestamp   time.Time         `json:"creationTimestamp"`
	Labels              map[string]string `json:"labels"`
	Annotations         map[string]string `json:"annotations"`
}

// RBACBuilderRequest represents a request to build RBAC resources
type RBACBuilderRequest struct {
	Type        string            `json:"type"` // "role", "clusterrole", "rolebinding", "clusterrolebinding"
	Name        string            `json:"name"`
	Namespace   string            `json:"namespace,omitempty"`
	Rules       []RBACRule        `json:"rules,omitempty"`
	Subjects    []RBACSubject     `json:"subjects,omitempty"`
	RoleRef     *RBACRoleRef      `json:"roleRef,omitempty"`
	Labels      map[string]string `json:"labels,omitempty"`
	Annotations map[string]string `json:"annotations,omitempty"`
	DryRun      bool              `json:"dryRun"`
}

// RBACRule represents a rule in an RBAC policy
type RBACRule struct {
	APIGroups     []string `json:"apiGroups,omitempty"`
	Resources     []string `json:"resources,omitempty"`
	ResourceNames []string `json:"resourceNames,omitempty"`
	Verbs         []string `json:"verbs"`
}

// RBACSubject represents a subject in an RBAC binding
type RBACSubject struct {
	Kind      string `json:"kind"`
	Name      string `json:"name"`
	Namespace string `json:"namespace,omitempty"`
}

// RBACRoleRef represents a role reference in an RBAC binding
type RBACRoleRef struct {
	APIGroup string `json:"apiGroup"`
	Kind     string `json:"kind"`
	Name     string `json:"name"`
}

// RBACBuilderResponse represents the response from building RBAC resources
type RBACBuilderResponse struct {
	Success bool        `json:"success"`
	YAML    string      `json:"yaml,omitempty"`
	Preview interface{} `json:"preview,omitempty"`
	Error   string      `json:"error,omitempty"`
}

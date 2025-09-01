package actions

import (
	"github.com/aaronlmathis/kaptn/internal/config"
	"github.com/aaronlmathis/kaptn/internal/k8s"
	"go.uber.org/zap"
)

// EnhancedActionsManager provides the complete enhanced actions system
type EnhancedActionsManager struct {
	SafetyGuard *SafetyGuard
	AuditLogger *AuditLogger
	Coordinator *ActionCoordinator
	Handlers    *EnhancedActionHandlers
}

// NewEnhancedActionsManager creates a new enhanced actions manager with all components
func NewEnhancedActionsManager(
	logger *zap.Logger,
	cfg *config.Config,
	ssarHelper *k8s.SSARHelper,
	nodeActionsService *NodeActionsService,
	applyService *ApplyService,
	impersonationMgr *k8s.ImpersonationManager,
) *EnhancedActionsManager {

	// Create safety guard with production mode detection
	isProduction := cfg.Security.AuthMode == "oidc" // or however you determine production
	safetyGuard := NewSafetyGuard(logger, isProduction)

	// Create audit logger
	auditLogger := NewAuditLogger(logger)

	// Create action coordinator
	coordinator := NewActionCoordinator(
		logger,
		safetyGuard,
		auditLogger,
		ssarHelper,
		nodeActionsService,
		applyService,
		impersonationMgr,
	)

	// Create HTTP handlers
	handlers := NewEnhancedActionHandlers(logger, coordinator)

	return &EnhancedActionsManager{
		SafetyGuard: safetyGuard,
		AuditLogger: auditLogger,
		Coordinator: coordinator,
		Handlers:    handlers,
	}
}

// GetSafetyGuard returns the safety guard
func (eam *EnhancedActionsManager) GetSafetyGuard() *SafetyGuard {
	return eam.SafetyGuard
}

// GetAuditLogger returns the audit logger
func (eam *EnhancedActionsManager) GetAuditLogger() *AuditLogger {
	return eam.AuditLogger
}

// GetCoordinator returns the action coordinator
func (eam *EnhancedActionsManager) GetCoordinator() *ActionCoordinator {
	return eam.Coordinator
}

// GetHandlers returns the HTTP handlers
func (eam *EnhancedActionsManager) GetHandlers() *EnhancedActionHandlers {
	return eam.Handlers
}

// DefaultSafetyConfig returns the default safety configuration
func DefaultSafetyConfig() map[string]interface{} {
	return map[string]interface{}{
		"denied_namespaces": []string{
			"kube-system",
			"kube-public",
			"kube-node-lease",
			"monitoring",
			"prometheus",
			"grafana",
			"istio-system",
			"cert-manager",
			"ingress-nginx",
			"metallb-system",
			"calico-system",
			"tigera-operator",
			"rook-ceph",
			"longhorn-system",
			"velero",
			"argocd",
			"flux-system",
			"kaptn",
		},
		"denied_labels": map[string]string{
			"kaptn.io/protected":           "true",
			"app.kubernetes.io/managed-by": "kaptn",
			"heritage":                     "Tiller",
			"app.kubernetes.io/part-of":    "kube-system",
		},
		"bulk_operation_limit":                     50,
		"destructive_actions_require_confirmation": true,
		"production_mode":                          true,
	}
}

// ActionDefinitions returns the supported action definitions for the frontend
func ActionDefinitions() []ActionDefinition {
	return []ActionDefinition{
		{
			ID:                   "restart-pods",
			Label:                "Restart Selected Pods",
			Verb:                 "delete",
			Resource:             "pods",
			Destructive:          false,
			RequiresConfirmation: false,
			Description:          "Restart pods by deleting them (controller will recreate)",
			Icon:                 "refresh",
		},
		{
			ID:                   "delete-pods",
			Label:                "Delete Selected Pods",
			Verb:                 "delete",
			Resource:             "pods",
			Destructive:          true,
			RequiresConfirmation: true,
			Description:          "Permanently delete pods",
			Icon:                 "trash",
		},
		{
			ID:                   "restart-deployments",
			Label:                "Restart Selected Deployments",
			Verb:                 "patch",
			Resource:             "deployments",
			Destructive:          false,
			RequiresConfirmation: false,
			Description:          "Trigger a rollout restart of deployments",
			Icon:                 "refresh",
		},
		{
			ID:                   "scale-deployments",
			Label:                "Scale Selected Deployments",
			Verb:                 "patch",
			Resource:             "deployments",
			Destructive:          false,
			RequiresConfirmation: true,
			Description:          "Scale deployments to a specified number of replicas",
			Icon:                 "scale",
		},
		{
			ID:                   "delete-deployments",
			Label:                "Delete Selected Deployments",
			Verb:                 "delete",
			Resource:             "deployments",
			Destructive:          true,
			RequiresConfirmation: true,
			Description:          "Permanently delete deployments",
			Icon:                 "trash",
		},
		{
			ID:                   "cordon-nodes",
			Label:                "Cordon Selected Nodes",
			Verb:                 "patch",
			Resource:             "nodes",
			Destructive:          false,
			RequiresConfirmation: true,
			Description:          "Mark nodes as unschedulable",
			Icon:                 "pause",
		},
		{
			ID:                   "drain-nodes",
			Label:                "Drain Selected Nodes",
			Verb:                 "patch",
			Resource:             "nodes",
			Destructive:          true,
			RequiresConfirmation: true,
			Description:          "Evict all pods and cordon nodes",
			Icon:                 "droplets",
		},
		{
			ID:                   "delete-services",
			Label:                "Delete Selected Services",
			Verb:                 "delete",
			Resource:             "services",
			Destructive:          true,
			RequiresConfirmation: true,
			Description:          "Permanently delete services",
			Icon:                 "trash",
		},
		{
			ID:                   "export-yaml",
			Label:                "Export Selected as YAML",
			Verb:                 "get",
			Resource:             "", // Resource determined by context
			Destructive:          false,
			RequiresConfirmation: false,
			Description:          "Export resources as YAML files",
			Icon:                 "download",
		},
		{
			ID:                   "copy-names",
			Label:                "Copy Resource Names",
			Verb:                 "list",
			Resource:             "", // Resource determined by context
			Destructive:          false,
			RequiresConfirmation: false,
			Description:          "Copy resource names to clipboard",
			Icon:                 "copy",
		},
	}
}

// ActionDefinition represents metadata about an action
type ActionDefinition struct {
	ID                   string `json:"id"`
	Label                string `json:"label"`
	Verb                 string `json:"verb"`
	Resource             string `json:"resource"`
	Destructive          bool   `json:"destructive"`
	RequiresConfirmation bool   `json:"requires_confirmation"`
	Description          string `json:"description"`
	Icon                 string `json:"icon"`
}

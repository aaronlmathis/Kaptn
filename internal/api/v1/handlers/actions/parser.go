package actions

// Parser defines the interface for parsing action strings into resource and verb pairs
type Parser interface {
	Parse(action string) (resource, verb string)
}

// DefaultParser is the default implementation of Parser that handles all resource types
type DefaultParser struct{}

// Parse extracts resource and verb from action string using resource-scoped helpers
func (p *DefaultParser) Parse(action string) (resource, verb string) {
	// Try parsing as pods action
	if res, verb := p.parsePods(action); res != "" {
		return res, verb
	}

	// Try parsing as deployments action
	if res, verb := p.parseDeployments(action); res != "" {
		return res, verb
	}

	// Try parsing as services action
	if res, verb := p.parseServices(action); res != "" {
		return res, verb
	}

	// Try parsing as configmaps action
	if res, verb := p.parseConfigMaps(action); res != "" {
		return res, verb
	}

	// Try parsing as secrets action
	if res, verb := p.parseSecrets(action); res != "" {
		return res, verb
	}

	// Unknown action
	return "unknown", "unknown"
}

// parsePods handles pod-specific actions
func (p *DefaultParser) parsePods(action string) (resource, verb string) {
	switch action {
	case "restart-pods":
		return "pods", "update"
	case "delete-pods":
		return "pods", "delete"
	case "get-logs":
		return "pods", "get"
	case "describe-pods":
		return "pods", "get"
	}

	return "", ""
}

// parseDeployments handles deployment-specific actions
func (p *DefaultParser) parseDeployments(action string) (resource, verb string) {
	switch action {
	case "restart-deployments":
		return "deployments", "update"
	case "scale-deployments":
		return "deployments", "update"
	case "delete-deployments":
		return "deployments", "delete"
	case "describe-deployments":
		return "deployments", "get"
	}

	return "", ""
}

// parseServices handles service-specific actions
func (p *DefaultParser) parseServices(action string) (resource, verb string) {
	switch action {
	case "delete-services":
		return "services", "delete"
	case "describe-services":
		return "services", "get"
	}

	return "", ""
}

// parseConfigMaps handles configmap-specific actions
func (p *DefaultParser) parseConfigMaps(action string) (resource, verb string) {
	switch action {
	case "delete-configmaps":
		return "configmaps", "delete"
	case "edit-configmaps":
		return "configmaps", "update"
	case "describe-configmaps":
		return "configmaps", "get"
	}

	return "", ""
}

// parseSecrets handles secret-specific actions
func (p *DefaultParser) parseSecrets(action string) (resource, verb string) {
	switch action {
	case "delete-secrets":
		return "secrets", "delete"
	case "edit-secrets":
		return "secrets", "update"
	case "view-secrets":
		return "secrets", "get"
	case "describe-secrets":
		return "secrets", "get"
	}

	return "", ""
}

// NewDefaultParser creates a new DefaultParser instance
func NewDefaultParser() Parser {
	return &DefaultParser{}
}

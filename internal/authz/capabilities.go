package authz

// CapabilityCheck defines the mapping from a UI capability to Kubernetes RBAC checks
type CapabilityCheck struct {
	Group       string // Kubernetes API group (empty string for core)
	Resource    string // Kubernetes resource type
	Subresource string // Optional subresource (e.g., "log", "exec")
	Verb        string // Kubernetes verb (get, list, create, update, patch, delete)
	Namespaced  bool   // Whether this resource is namespaced or cluster-scoped
}

// Registry maps capability keys to their corresponding Kubernetes RBAC checks
var Registry = map[string]CapabilityCheck{
	// Pod operations
	"pods.delete":      {Group: "", Resource: "pods", Verb: "delete", Namespaced: true},
	"pods.logs":        {Group: "", Resource: "pods", Subresource: "log", Verb: "get", Namespaced: true},
	"pods.exec":        {Group: "", Resource: "pods", Subresource: "exec", Verb: "create", Namespaced: true},
	"pods.portforward": {Group: "", Resource: "pods", Subresource: "portforward", Verb: "create", Namespaced: true},
	"pods.get":         {Group: "", Resource: "pods", Verb: "get", Namespaced: true},
	"pods.list":        {Group: "", Resource: "pods", Verb: "list", Namespaced: true},
	"pods.watch":       {Group: "", Resource: "pods", Verb: "watch", Namespaced: true},
	"pods.create":      {Group: "", Resource: "pods", Verb: "create", Namespaced: true},
	"pods.patch":       {Group: "", Resource: "pods", Verb: "patch", Namespaced: true},

	// Deployment operations
	"deployments.restart": {Group: "apps", Resource: "deployments", Verb: "patch", Namespaced: true},
	"deployments.delete":  {Group: "apps", Resource: "deployments", Verb: "delete", Namespaced: true},
	"deployments.get":     {Group: "apps", Resource: "deployments", Verb: "get", Namespaced: true},
	"deployments.list":    {Group: "apps", Resource: "deployments", Verb: "list", Namespaced: true},
	"deployments.create":  {Group: "apps", Resource: "deployments", Verb: "create", Namespaced: true},
	"deployments.update":  {Group: "apps", Resource: "deployments", Verb: "update", Namespaced: true},
	"deployments.patch":   {Group: "apps", Resource: "deployments", Verb: "patch", Namespaced: true},

	// ConfigMap operations
	"configmaps.edit":   {Group: "", Resource: "configmaps", Verb: "update", Namespaced: true},
	"configmaps.delete": {Group: "", Resource: "configmaps", Verb: "delete", Namespaced: true},
	"configmaps.get":    {Group: "", Resource: "configmaps", Verb: "get", Namespaced: true},
	"configmaps.list":   {Group: "", Resource: "configmaps", Verb: "list", Namespaced: true},
	"configmaps.create": {Group: "", Resource: "configmaps", Verb: "create", Namespaced: true},

	// Secret operations
	"secrets.read":   {Group: "", Resource: "secrets", Verb: "get", Namespaced: true},
	"secrets.list":   {Group: "", Resource: "secrets", Verb: "list", Namespaced: true},
	"secrets.create": {Group: "", Resource: "secrets", Verb: "create", Namespaced: true},
	"secrets.update": {Group: "", Resource: "secrets", Verb: "update", Namespaced: true},
	"secrets.delete": {Group: "", Resource: "secrets", Verb: "delete", Namespaced: true},

	// Service operations
	"services.get":    {Group: "", Resource: "services", Verb: "get", Namespaced: true},
	"services.list":   {Group: "", Resource: "services", Verb: "list", Namespaced: true},
	"services.create": {Group: "", Resource: "services", Verb: "create", Namespaced: true},
	"services.update": {Group: "", Resource: "services", Verb: "update", Namespaced: true},
	"services.delete": {Group: "", Resource: "services", Verb: "delete", Namespaced: true},

	// StatefulSet operations
	"statefulsets.get":    {Group: "apps", Resource: "statefulsets", Verb: "get", Namespaced: true},
	"statefulsets.list":   {Group: "apps", Resource: "statefulsets", Verb: "list", Namespaced: true},
	"statefulsets.create": {Group: "apps", Resource: "statefulsets", Verb: "create", Namespaced: true},
	"statefulsets.update": {Group: "apps", Resource: "statefulsets", Verb: "update", Namespaced: true},
	"statefulsets.delete": {Group: "apps", Resource: "statefulsets", Verb: "delete", Namespaced: true},
	"statefulsets.patch":  {Group: "apps", Resource: "statefulsets", Verb: "patch", Namespaced: true},

	// DaemonSet operations
	"daemonsets.get":    {Group: "apps", Resource: "daemonsets", Verb: "get", Namespaced: true},
	"daemonsets.list":   {Group: "apps", Resource: "daemonsets", Verb: "list", Namespaced: true},
	"daemonsets.create": {Group: "apps", Resource: "daemonsets", Verb: "create", Namespaced: true},
	"daemonsets.update": {Group: "apps", Resource: "daemonsets", Verb: "update", Namespaced: true},
	"daemonsets.delete": {Group: "apps", Resource: "daemonsets", Verb: "delete", Namespaced: true},
	"daemonsets.patch":  {Group: "apps", Resource: "daemonsets", Verb: "patch", Namespaced: true},

	// ReplicaSet operations
	"replicasets.get":    {Group: "apps", Resource: "replicasets", Verb: "get", Namespaced: true},
	"replicasets.list":   {Group: "apps", Resource: "replicasets", Verb: "list", Namespaced: true},
	"replicasets.create": {Group: "apps", Resource: "replicasets", Verb: "create", Namespaced: true},
	"replicasets.update": {Group: "apps", Resource: "replicasets", Verb: "update", Namespaced: true},
	"replicasets.delete": {Group: "apps", Resource: "replicasets", Verb: "delete", Namespaced: true},
	"replicasets.patch":  {Group: "apps", Resource: "replicasets", Verb: "patch", Namespaced: true},

	// Job operations
	"jobs.get":    {Group: "batch", Resource: "jobs", Verb: "get", Namespaced: true},
	"jobs.list":   {Group: "batch", Resource: "jobs", Verb: "list", Namespaced: true},
	"jobs.create": {Group: "batch", Resource: "jobs", Verb: "create", Namespaced: true},
	"jobs.update": {Group: "batch", Resource: "jobs", Verb: "update", Namespaced: true},
	"jobs.delete": {Group: "batch", Resource: "jobs", Verb: "delete", Namespaced: true},

	// CronJob operations
	"cronjobs.get":    {Group: "batch", Resource: "cronjobs", Verb: "get", Namespaced: true},
	"cronjobs.list":   {Group: "batch", Resource: "cronjobs", Verb: "list", Namespaced: true},
	"cronjobs.create": {Group: "batch", Resource: "cronjobs", Verb: "create", Namespaced: true},
	"cronjobs.update": {Group: "batch", Resource: "cronjobs", Verb: "update", Namespaced: true},
	"cronjobs.delete": {Group: "batch", Resource: "cronjobs", Verb: "delete", Namespaced: true},

	// Namespace operations
	"namespaces.get":    {Group: "", Resource: "namespaces", Verb: "get", Namespaced: false},
	"namespaces.list":   {Group: "", Resource: "namespaces", Verb: "list", Namespaced: false},
	"namespaces.create": {Group: "", Resource: "namespaces", Verb: "create", Namespaced: false},
	"namespaces.update": {Group: "", Resource: "namespaces", Verb: "update", Namespaced: false},
	"namespaces.delete": {Group: "", Resource: "namespaces", Verb: "delete", Namespaced: false},

	// Node operations (cluster-scoped)
	"nodes.get":    {Group: "", Resource: "nodes", Verb: "get", Namespaced: false},
	"nodes.list":   {Group: "", Resource: "nodes", Verb: "list", Namespaced: false},
	"nodes.update": {Group: "", Resource: "nodes", Verb: "update", Namespaced: false},
	"nodes.patch":  {Group: "", Resource: "nodes", Verb: "patch", Namespaced: false},
	"nodes.shell":  {Group: "", Resource: "nodes", Subresource: "proxy", Verb: "create", Namespaced: false},

	// RBAC operations
	"roles.get":                  {Group: "rbac.authorization.k8s.io", Resource: "roles", Verb: "get", Namespaced: true},
	"roles.list":                 {Group: "rbac.authorization.k8s.io", Resource: "roles", Verb: "list", Namespaced: true},
	"roles.create":               {Group: "rbac.authorization.k8s.io", Resource: "roles", Verb: "create", Namespaced: true},
	"roles.update":               {Group: "rbac.authorization.k8s.io", Resource: "roles", Verb: "update", Namespaced: true},
	"roles.delete":               {Group: "rbac.authorization.k8s.io", Resource: "roles", Verb: "delete", Namespaced: true},
	"rolebindings.get":           {Group: "rbac.authorization.k8s.io", Resource: "rolebindings", Verb: "get", Namespaced: true},
	"rolebindings.list":          {Group: "rbac.authorization.k8s.io", Resource: "rolebindings", Verb: "list", Namespaced: true},
	"rolebindings.create":        {Group: "rbac.authorization.k8s.io", Resource: "rolebindings", Verb: "create", Namespaced: true},
	"rolebindings.update":        {Group: "rbac.authorization.k8s.io", Resource: "rolebindings", Verb: "update", Namespaced: true},
	"rolebindings.delete":        {Group: "rbac.authorization.k8s.io", Resource: "rolebindings", Verb: "delete", Namespaced: true},
	"clusterroles.get":           {Group: "rbac.authorization.k8s.io", Resource: "clusterroles", Verb: "get", Namespaced: false},
	"clusterroles.list":          {Group: "rbac.authorization.k8s.io", Resource: "clusterroles", Verb: "list", Namespaced: false},
	"clusterroles.create":        {Group: "rbac.authorization.k8s.io", Resource: "clusterroles", Verb: "create", Namespaced: false},
	"clusterroles.update":        {Group: "rbac.authorization.k8s.io", Resource: "clusterroles", Verb: "update", Namespaced: false},
	"clusterroles.delete":        {Group: "rbac.authorization.k8s.io", Resource: "clusterroles", Verb: "delete", Namespaced: false},
	"clusterrolebindings.get":    {Group: "rbac.authorization.k8s.io", Resource: "clusterrolebindings", Verb: "get", Namespaced: false},
	"clusterrolebindings.list":   {Group: "rbac.authorization.k8s.io", Resource: "clusterrolebindings", Verb: "list", Namespaced: false},
	"clusterrolebindings.create": {Group: "rbac.authorization.k8s.io", Resource: "clusterrolebindings", Verb: "create", Namespaced: false},
	"clusterrolebindings.update": {Group: "rbac.authorization.k8s.io", Resource: "clusterrolebindings", Verb: "update", Namespaced: false},
	"clusterrolebindings.delete": {Group: "rbac.authorization.k8s.io", Resource: "clusterrolebindings", Verb: "delete", Namespaced: false},

	// Event operations
	"events.get":  {Group: "", Resource: "events", Verb: "get", Namespaced: true},
	"events.list": {Group: "", Resource: "events", Verb: "list", Namespaced: true},

	// Persistent Volume operations
	"persistentvolumes.get":         {Group: "", Resource: "persistentvolumes", Verb: "get", Namespaced: false},
	"persistentvolumes.list":        {Group: "", Resource: "persistentvolumes", Verb: "list", Namespaced: false},
	"persistentvolumes.create":      {Group: "", Resource: "persistentvolumes", Verb: "create", Namespaced: false},
	"persistentvolumes.update":      {Group: "", Resource: "persistentvolumes", Verb: "update", Namespaced: false},
	"persistentvolumes.delete":      {Group: "", Resource: "persistentvolumes", Verb: "delete", Namespaced: false},
	"persistentvolumeclaims.get":    {Group: "", Resource: "persistentvolumeclaims", Verb: "get", Namespaced: true},
	"persistentvolumeclaims.list":   {Group: "", Resource: "persistentvolumeclaims", Verb: "list", Namespaced: true},
	"persistentvolumeclaims.create": {Group: "", Resource: "persistentvolumeclaims", Verb: "create", Namespaced: true},
	"persistentvolumeclaims.update": {Group: "", Resource: "persistentvolumeclaims", Verb: "update", Namespaced: true},
	"persistentvolumeclaims.delete": {Group: "", Resource: "persistentvolumeclaims", Verb: "delete", Namespaced: true},

	// Storage operations
	"storageclasses.get":    {Group: "storage.k8s.io", Resource: "storageclasses", Verb: "get", Namespaced: false},
	"storageclasses.list":   {Group: "storage.k8s.io", Resource: "storageclasses", Verb: "list", Namespaced: false},
	"storageclasses.create": {Group: "storage.k8s.io", Resource: "storageclasses", Verb: "create", Namespaced: false},
	"storageclasses.update": {Group: "storage.k8s.io", Resource: "storageclasses", Verb: "update", Namespaced: false},
	"storageclasses.delete": {Group: "storage.k8s.io", Resource: "storageclasses", Verb: "delete", Namespaced: false},

	// Ingress operations
	"ingresses.get":    {Group: "networking.k8s.io", Resource: "ingresses", Verb: "get", Namespaced: true},
	"ingresses.list":   {Group: "networking.k8s.io", Resource: "ingresses", Verb: "list", Namespaced: true},
	"ingresses.create": {Group: "networking.k8s.io", Resource: "ingresses", Verb: "create", Namespaced: true},
	"ingresses.update": {Group: "networking.k8s.io", Resource: "ingresses", Verb: "update", Namespaced: true},
	"ingresses.delete": {Group: "networking.k8s.io", Resource: "ingresses", Verb: "delete", Namespaced: true},

	// NetworkPolicy operations
	"networkpolicies.get":    {Group: "networking.k8s.io", Resource: "networkpolicies", Verb: "get", Namespaced: true},
	"networkpolicies.list":   {Group: "networking.k8s.io", Resource: "networkpolicies", Verb: "list", Namespaced: true},
	"networkpolicies.create": {Group: "networking.k8s.io", Resource: "networkpolicies", Verb: "create", Namespaced: true},
	"networkpolicies.update": {Group: "networking.k8s.io", Resource: "networkpolicies", Verb: "update", Namespaced: true},
	"networkpolicies.delete": {Group: "networking.k8s.io", Resource: "networkpolicies", Verb: "delete", Namespaced: true},
}

// GetCapabilityCheck returns the CapabilityCheck for a given capability key
func GetCapabilityCheck(capability string) (CapabilityCheck, bool) {
	check, exists := Registry[capability]
	return check, exists
}

// GetAllCapabilities returns all registered capability keys
func GetAllCapabilities() []string {
	capabilities := make([]string, 0, len(Registry))
	for capability := range Registry {
		capabilities = append(capabilities, capability)
	}
	return capabilities
}

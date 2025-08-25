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
	"pods.delete":              {Group: "", Resource: "pods", Verb: "delete", Namespaced: true},
	"pods.logs":                {Group: "", Resource: "pods", Subresource: "log", Verb: "get", Namespaced: true},
	"pods.exec":                {Group: "", Resource: "pods", Subresource: "exec", Verb: "create", Namespaced: true},
	"pods.portforward":         {Group: "", Resource: "pods", Subresource: "portforward", Verb: "create", Namespaced: true},
	"pods.get":                 {Group: "", Resource: "pods", Verb: "get", Namespaced: true},
	"pods.list":                {Group: "", Resource: "pods", Verb: "list", Namespaced: true},
	"pods.watch":               {Group: "", Resource: "pods", Verb: "watch", Namespaced: true},
	"pods.create":              {Group: "", Resource: "pods", Verb: "create", Namespaced: true},
	"pods.update":              {Group: "", Resource: "pods", Verb: "update", Namespaced: true},
	"pods.patch":               {Group: "", Resource: "pods", Verb: "patch", Namespaced: true},
	"pods.attach":              {Group: "", Resource: "pods", Subresource: "attach", Verb: "create", Namespaced: true},              // kubectl attach
	"pods.eviction":            {Group: "", Resource: "pods", Subresource: "eviction", Verb: "create", Namespaced: true},            // eviction API
	"pods.ephemeralcontainers": {Group: "", Resource: "pods", Subresource: "ephemeralcontainers", Verb: "update", Namespaced: true}, // kubectl debug (ephemeral containers)
	"pods.deletecollection":    {Group: "", Resource: "pods", Verb: "deletecollection", Namespaced: true},

	// Deployment operations
	"deployments.restart": {Group: "apps", Resource: "deployments", Verb: "patch", Namespaced: true},
	"deployments.delete":  {Group: "apps", Resource: "deployments", Verb: "delete", Namespaced: true},
	"deployments.get":     {Group: "apps", Resource: "deployments", Verb: "get", Namespaced: true},
	"deployments.list":    {Group: "apps", Resource: "deployments", Verb: "list", Namespaced: true},
	"deployments.watch":   {Group: "apps", Resource: "deployments", Verb: "watch", Namespaced: true},
	"deployments.create":  {Group: "apps", Resource: "deployments", Verb: "create", Namespaced: true},
	"deployments.update":  {Group: "apps", Resource: "deployments", Verb: "update", Namespaced: true},
	"deployments.patch":   {Group: "apps", Resource: "deployments", Verb: "patch", Namespaced: true},

	// ConfigMap operations
	"configmaps.edit":   {Group: "", Resource: "configmaps", Verb: "update", Namespaced: true},
	"configmaps.delete": {Group: "", Resource: "configmaps", Verb: "delete", Namespaced: true},
	"configmaps.get":    {Group: "", Resource: "configmaps", Verb: "get", Namespaced: true},
	"configmaps.list":   {Group: "", Resource: "configmaps", Verb: "list", Namespaced: true},
	"configmaps.create": {Group: "", Resource: "configmaps", Verb: "create", Namespaced: true},
	"configmaps.watch":  {Group: "", Resource: "configmaps", Verb: "watch", Namespaced: true},
	"configmaps.patch":  {Group: "", Resource: "configmaps", Verb: "patch", Namespaced: true},

	// Secret operations
	"secrets.read":   {Group: "", Resource: "secrets", Verb: "get", Namespaced: true},
	"secrets.list":   {Group: "", Resource: "secrets", Verb: "list", Namespaced: true},
	"secrets.create": {Group: "", Resource: "secrets", Verb: "create", Namespaced: true},
	"secrets.update": {Group: "", Resource: "secrets", Verb: "update", Namespaced: true},
	"secrets.delete": {Group: "", Resource: "secrets", Verb: "delete", Namespaced: true},
	"secrets.watch":  {Group: "", Resource: "secrets", Verb: "watch", Namespaced: true},
	"secrets.patch":  {Group: "", Resource: "secrets", Verb: "patch", Namespaced: true},

	// Service operations
	"services.get":    {Group: "", Resource: "services", Verb: "get", Namespaced: true},
	"services.list":   {Group: "", Resource: "services", Verb: "list", Namespaced: true},
	"services.create": {Group: "", Resource: "services", Verb: "create", Namespaced: true},
	"services.update": {Group: "", Resource: "services", Verb: "update", Namespaced: true},
	"services.delete": {Group: "", Resource: "services", Verb: "delete", Namespaced: true},
	"services.watch":  {Group: "", Resource: "services", Verb: "watch", Namespaced: true},
	"services.patch":  {Group: "", Resource: "services", Verb: "patch", Namespaced: true},

	// StatefulSet operations
	"statefulsets.get":    {Group: "apps", Resource: "statefulsets", Verb: "get", Namespaced: true},
	"statefulsets.list":   {Group: "apps", Resource: "statefulsets", Verb: "list", Namespaced: true},
	"statefulsets.create": {Group: "apps", Resource: "statefulsets", Verb: "create", Namespaced: true},
	"statefulsets.update": {Group: "apps", Resource: "statefulsets", Verb: "update", Namespaced: true},
	"statefulsets.delete": {Group: "apps", Resource: "statefulsets", Verb: "delete", Namespaced: true},
	"statefulsets.patch":  {Group: "apps", Resource: "statefulsets", Verb: "patch", Namespaced: true},
	"statefulsets.watch":  {Group: "apps", Resource: "statefulsets", Verb: "watch", Namespaced: true},

	// DaemonSet operations
	"daemonsets.get":    {Group: "apps", Resource: "daemonsets", Verb: "get", Namespaced: true},
	"daemonsets.list":   {Group: "apps", Resource: "daemonsets", Verb: "list", Namespaced: true},
	"daemonsets.create": {Group: "apps", Resource: "daemonsets", Verb: "create", Namespaced: true},
	"daemonsets.update": {Group: "apps", Resource: "daemonsets", Verb: "update", Namespaced: true},
	"daemonsets.delete": {Group: "apps", Resource: "daemonsets", Verb: "delete", Namespaced: true},
	"daemonsets.patch":  {Group: "apps", Resource: "daemonsets", Verb: "patch", Namespaced: true},
	"daemonsets.watch":  {Group: "apps", Resource: "daemonsets", Verb: "watch", Namespaced: true},

	// ReplicaSet operations
	"replicasets.get":    {Group: "apps", Resource: "replicasets", Verb: "get", Namespaced: true},
	"replicasets.list":   {Group: "apps", Resource: "replicasets", Verb: "list", Namespaced: true},
	"replicasets.create": {Group: "apps", Resource: "replicasets", Verb: "create", Namespaced: true},
	"replicasets.update": {Group: "apps", Resource: "replicasets", Verb: "update", Namespaced: true},
	"replicasets.delete": {Group: "apps", Resource: "replicasets", Verb: "delete", Namespaced: true},
	"replicasets.patch":  {Group: "apps", Resource: "replicasets", Verb: "patch", Namespaced: true},
	"replicasets.watch":  {Group: "apps", Resource: "replicasets", Verb: "watch", Namespaced: true},

	// Job operations
	"jobs.get":    {Group: "batch", Resource: "jobs", Verb: "get", Namespaced: true},
	"jobs.list":   {Group: "batch", Resource: "jobs", Verb: "list", Namespaced: true},
	"jobs.create": {Group: "batch", Resource: "jobs", Verb: "create", Namespaced: true},
	"jobs.update": {Group: "batch", Resource: "jobs", Verb: "update", Namespaced: true},
	"jobs.delete": {Group: "batch", Resource: "jobs", Verb: "delete", Namespaced: true},
	"jobs.patch":  {Group: "batch", Resource: "jobs", Verb: "patch", Namespaced: true},
	"jobs.watch":  {Group: "batch", Resource: "jobs", Verb: "watch", Namespaced: true},

	// CronJob operations
	"cronjobs.get":    {Group: "batch", Resource: "cronjobs", Verb: "get", Namespaced: true},
	"cronjobs.list":   {Group: "batch", Resource: "cronjobs", Verb: "list", Namespaced: true},
	"cronjobs.create": {Group: "batch", Resource: "cronjobs", Verb: "create", Namespaced: true},
	"cronjobs.update": {Group: "batch", Resource: "cronjobs", Verb: "update", Namespaced: true},
	"cronjobs.delete": {Group: "batch", Resource: "cronjobs", Verb: "delete", Namespaced: true},
	"cronjobs.patch":  {Group: "batch", Resource: "cronjobs", Verb: "patch", Namespaced: true},
	"cronjobs.watch":  {Group: "batch", Resource: "cronjobs", Verb: "watch", Namespaced: true},

	// Namespace operations
	"namespaces.get":    {Group: "", Resource: "namespaces", Verb: "get", Namespaced: false},
	"namespaces.list":   {Group: "", Resource: "namespaces", Verb: "list", Namespaced: false},
	"namespaces.create": {Group: "", Resource: "namespaces", Verb: "create", Namespaced: false},
	"namespaces.update": {Group: "", Resource: "namespaces", Verb: "update", Namespaced: false},
	"namespaces.delete": {Group: "", Resource: "namespaces", Verb: "delete", Namespaced: false},
	"namespaces.patch":  {Group: "", Resource: "namespaces", Verb: "patch", Namespaced: false},
	"namespaces.watch":  {Group: "", Resource: "namespaces", Verb: "watch", Namespaced: false},

	// Node operations (cluster-scoped)
	"nodes.get":       {Group: "", Resource: "nodes", Verb: "get", Namespaced: false},
	"nodes.list":      {Group: "", Resource: "nodes", Verb: "list", Namespaced: false},
	"nodes.update":    {Group: "", Resource: "nodes", Verb: "update", Namespaced: false},
	"nodes.patch":     {Group: "", Resource: "nodes", Verb: "patch", Namespaced: false},
	"nodes.shell":     {Group: "", Resource: "nodes", Subresource: "proxy", Verb: "create", Namespaced: false},
	"nodes.proxy.get": {Group: "", Resource: "nodes", Subresource: "proxy", Verb: "get", Namespaced: false},

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
	"events.get":    {Group: "", Resource: "events", Verb: "get", Namespaced: true},
	"events.list":   {Group: "", Resource: "events", Verb: "list", Namespaced: true},
	"events.watch":  {Group: "", Resource: "events", Verb: "watch", Namespaced: true},
	"events.create": {Group: "", Resource: "events", Verb: "create", Namespaced: true},

	// Persistent Volume operations
	"persistentvolumes.get":         {Group: "", Resource: "persistentvolumes", Verb: "get", Namespaced: false},
	"persistentvolumes.list":        {Group: "", Resource: "persistentvolumes", Verb: "list", Namespaced: false},
	"persistentvolumes.create":      {Group: "", Resource: "persistentvolumes", Verb: "create", Namespaced: false},
	"persistentvolumes.update":      {Group: "", Resource: "persistentvolumes", Verb: "update", Namespaced: false},
	"persistentvolumes.delete":      {Group: "", Resource: "persistentvolumes", Verb: "delete", Namespaced: false},
	"persistentvolumes.patch":       {Group: "", Resource: "persistentvolumes", Verb: "patch", Namespaced: false},
	"persistentvolumes.watch":       {Group: "", Resource: "persistentvolumes", Verb: "watch", Namespaced: false},
	"persistentvolumeclaims.get":    {Group: "", Resource: "persistentvolumeclaims", Verb: "get", Namespaced: true},
	"persistentvolumeclaims.list":   {Group: "", Resource: "persistentvolumeclaims", Verb: "list", Namespaced: true},
	"persistentvolumeclaims.create": {Group: "", Resource: "persistentvolumeclaims", Verb: "create", Namespaced: true},
	"persistentvolumeclaims.update": {Group: "", Resource: "persistentvolumeclaims", Verb: "update", Namespaced: true},
	"persistentvolumeclaims.delete": {Group: "", Resource: "persistentvolumeclaims", Verb: "delete", Namespaced: true},
	"persistentvolumeclaims.patch":  {Group: "", Resource: "persistentvolumeclaims", Verb: "patch", Namespaced: true},
	"persistentvolumeclaims.watch":  {Group: "", Resource: "persistentvolumeclaims", Verb: "watch", Namespaced: true},

	// Storage operations
	"storageclasses.get":    {Group: "storage.k8s.io", Resource: "storageclasses", Verb: "get", Namespaced: false},
	"storageclasses.list":   {Group: "storage.k8s.io", Resource: "storageclasses", Verb: "list", Namespaced: false},
	"storageclasses.create": {Group: "storage.k8s.io", Resource: "storageclasses", Verb: "create", Namespaced: false},
	"storageclasses.update": {Group: "storage.k8s.io", Resource: "storageclasses", Verb: "update", Namespaced: false},
	"storageclasses.delete": {Group: "storage.k8s.io", Resource: "storageclasses", Verb: "delete", Namespaced: false},
	"storageclasses.patch":  {Group: "storage.k8s.io", Resource: "storageclasses", Verb: "patch", Namespaced: false},
	"storageclasses.watch":  {Group: "storage.k8s.io", Resource: "storageclasses", Verb: "watch", Namespaced: false},

	// Ingress operations
	"ingresses.get":    {Group: "networking.k8s.io", Resource: "ingresses", Verb: "get", Namespaced: true},
	"ingresses.list":   {Group: "networking.k8s.io", Resource: "ingresses", Verb: "list", Namespaced: true},
	"ingresses.create": {Group: "networking.k8s.io", Resource: "ingresses", Verb: "create", Namespaced: true},
	"ingresses.update": {Group: "networking.k8s.io", Resource: "ingresses", Verb: "update", Namespaced: true},
	"ingresses.delete": {Group: "networking.k8s.io", Resource: "ingresses", Verb: "delete", Namespaced: true},
	"ingresses.patch":  {Group: "networking.k8s.io", Resource: "ingresses", Verb: "patch", Namespaced: true},
	"ingresses.watch":  {Group: "networking.k8s.io", Resource: "ingresses", Verb: "watch", Namespaced: true},

	// NetworkPolicy operations
	"networkpolicies.get":    {Group: "networking.k8s.io", Resource: "networkpolicies", Verb: "get", Namespaced: true},
	"networkpolicies.list":   {Group: "networking.k8s.io", Resource: "networkpolicies", Verb: "list", Namespaced: true},
	"networkpolicies.create": {Group: "networking.k8s.io", Resource: "networkpolicies", Verb: "create", Namespaced: true},
	"networkpolicies.update": {Group: "networking.k8s.io", Resource: "networkpolicies", Verb: "update", Namespaced: true},
	"networkpolicies.delete": {Group: "networking.k8s.io", Resource: "networkpolicies", Verb: "delete", Namespaced: true},
	"networkpolicies.patch":  {Group: "networking.k8s.io", Resource: "networkpolicies", Verb: "patch", Namespaced: true},
	"networkpolicies.watch":  {Group: "networking.k8s.io", Resource: "networkpolicies", Verb: "watch", Namespaced: true},

	// ---- Scale subresource (get/update/patch) for scalable resources ----
	"deployments.scale.get":    {Group: "apps", Resource: "deployments", Subresource: "scale", Verb: "get", Namespaced: true},
	"deployments.scale.update": {Group: "apps", Resource: "deployments", Subresource: "scale", Verb: "update", Namespaced: true},
	"deployments.scale.patch":  {Group: "apps", Resource: "deployments", Subresource: "scale", Verb: "patch", Namespaced: true},

	"statefulsets.scale.get":    {Group: "apps", Resource: "statefulsets", Subresource: "scale", Verb: "get", Namespaced: true},
	"statefulsets.scale.update": {Group: "apps", Resource: "statefulsets", Subresource: "scale", Verb: "update", Namespaced: true},
	"statefulsets.scale.patch":  {Group: "apps", Resource: "statefulsets", Subresource: "scale", Verb: "patch", Namespaced: true},

	"replicasets.scale.get":    {Group: "apps", Resource: "replicasets", Subresource: "scale", Verb: "get", Namespaced: true},
	"replicasets.scale.update": {Group: "apps", Resource: "replicasets", Subresource: "scale", Verb: "update", Namespaced: true},
	"replicasets.scale.patch":  {Group: "apps", Resource: "replicasets", Subresource: "scale", Verb: "patch", Namespaced: true},

	"replicationcontrollers.get":          {Group: "", Resource: "replicationcontrollers", Verb: "get", Namespaced: true},
	"replicationcontrollers.list":         {Group: "", Resource: "replicationcontrollers", Verb: "list", Namespaced: true},
	"replicationcontrollers.create":       {Group: "", Resource: "replicationcontrollers", Verb: "create", Namespaced: true},
	"replicationcontrollers.update":       {Group: "", Resource: "replicationcontrollers", Verb: "update", Namespaced: true},
	"replicationcontrollers.delete":       {Group: "", Resource: "replicationcontrollers", Verb: "delete", Namespaced: true},
	"replicationcontrollers.patch":        {Group: "", Resource: "replicationcontrollers", Verb: "patch", Namespaced: true},
	"replicationcontrollers.watch":        {Group: "", Resource: "replicationcontrollers", Verb: "watch", Namespaced: true},
	"replicationcontrollers.scale.get":    {Group: "", Resource: "replicationcontrollers", Subresource: "scale", Verb: "get", Namespaced: true},
	"replicationcontrollers.scale.update": {Group: "", Resource: "replicationcontrollers", Subresource: "scale", Verb: "update", Namespaced: true},
	"replicationcontrollers.scale.patch":  {Group: "", Resource: "replicationcontrollers", Subresource: "scale", Verb: "patch", Namespaced: true},

	// HPAs
	"horizontalpodautoscalers.get":    {Group: "autoscaling", Resource: "horizontalpodautoscalers", Verb: "get", Namespaced: true},
	"horizontalpodautoscalers.list":   {Group: "autoscaling", Resource: "horizontalpodautoscalers", Verb: "list", Namespaced: true},
	"horizontalpodautoscalers.watch":  {Group: "autoscaling", Resource: "horizontalpodautoscalers", Verb: "watch", Namespaced: true},
	"horizontalpodautoscalers.create": {Group: "autoscaling", Resource: "horizontalpodautoscalers", Verb: "create", Namespaced: true},
	"horizontalpodautoscalers.update": {Group: "autoscaling", Resource: "horizontalpodautoscalers", Verb: "update", Namespaced: true},
	"horizontalpodautoscalers.patch":  {Group: "autoscaling", Resource: "horizontalpodautoscalers", Verb: "patch", Namespaced: true},
	"horizontalpodautoscalers.delete": {Group: "autoscaling", Resource: "horizontalpodautoscalers", Verb: "delete", Namespaced: true},

	// ControllerRevisions
	"controllerrevisions.get":    {Group: "apps", Resource: "controllerrevisions", Verb: "get", Namespaced: true},
	"controllerrevisions.list":   {Group: "apps", Resource: "controllerrevisions", Verb: "list", Namespaced: true},
	"controllerrevisions.watch":  {Group: "apps", Resource: "controllerrevisions", Verb: "watch", Namespaced: true},
	"controllerrevisions.create": {Group: "apps", Resource: "controllerrevisions", Verb: "create", Namespaced: true},
	"controllerrevisions.update": {Group: "apps", Resource: "controllerrevisions", Verb: "update", Namespaced: true},
	"controllerrevisions.patch":  {Group: "apps", Resource: "controllerrevisions", Verb: "patch", Namespaced: true},
	"controllerrevisions.delete": {Group: "apps", Resource: "controllerrevisions", Verb: "delete", Namespaced: true},

	// PodTemplates
	"podtemplates.get":    {Group: "", Resource: "podtemplates", Verb: "get", Namespaced: true},
	"podtemplates.list":   {Group: "", Resource: "podtemplates", Verb: "list", Namespaced: true},
	"podtemplates.watch":  {Group: "", Resource: "podtemplates", Verb: "watch", Namespaced: true},
	"podtemplates.create": {Group: "", Resource: "podtemplates", Verb: "create", Namespaced: true},
	"podtemplates.update": {Group: "", Resource: "podtemplates", Verb: "update", Namespaced: true},
	"podtemplates.patch":  {Group: "", Resource: "podtemplates", Verb: "patch", Namespaced: true},
	"podtemplates.delete": {Group: "", Resource: "podtemplates", Verb: "delete", Namespaced: true},
	// Bindings
	"bindings.create": {Group: "", Resource: "bindings", Verb: "create", Namespaced: true},

	// Proxy subresources
	"pods.proxy.get":        {Group: "", Resource: "pods", Subresource: "proxy", Verb: "get", Namespaced: true},
	"pods.proxy.create":     {Group: "", Resource: "pods", Subresource: "proxy", Verb: "create", Namespaced: true},
	"services.proxy.get":    {Group: "", Resource: "services", Subresource: "proxy", Verb: "get", Namespaced: true},
	"services.proxy.create": {Group: "", Resource: "services", Subresource: "proxy", Verb: "create", Namespaced: true},

	// Namespace finalize
	"namespaces.finalize.update": {Group: "", Resource: "namespaces", Subresource: "finalize", Verb: "update", Namespaced: false},

	// RuntimeClass full CRUD
	"runtimeclasses.create": {Group: "node.k8s.io", Resource: "runtimeclasses", Verb: "create", Namespaced: false},
	"runtimeclasses.update": {Group: "node.k8s.io", Resource: "runtimeclasses", Verb: "update", Namespaced: false},
	"runtimeclasses.patch":  {Group: "node.k8s.io", Resource: "runtimeclasses", Verb: "patch", Namespaced: false},
	"runtimeclasses.delete": {Group: "node.k8s.io", Resource: "runtimeclasses", Verb: "delete", Namespaced: false},

	// Endpoints create/delete
	"endpoints.create": {Group: "", Resource: "endpoints", Verb: "create", Namespaced: true},
	"endpoints.delete": {Group: "", Resource: "endpoints", Verb: "delete", Namespaced: true},

	// SelfSubjectReview (whoami)
	"selfsubjectreviews.create": {Group: "authentication.k8s.io", Resource: "selfsubjectreviews", Verb: "create", Namespaced: false},

	// Dynamic Resource Allocation
	"resourceclaims.*":         {Group: "resource.k8s.io", Resource: "resourceclaims", Verb: "list", Namespaced: true},         // + get/watch/create/update/patch/delete
	"resourceclaimtemplates.*": {Group: "resource.k8s.io", Resource: "resourceclaimtemplates", Verb: "list", Namespaced: true}, // + get/watch/create/update/patch/delete
	"resourceclasses.*":        {Group: "resource.k8s.io", Resource: "resourceclasses", Verb: "list", Namespaced: false},       // + get/watch/create/update/patch/delete

	// ---- Services & discovery ----
	"endpoints.get":    {Group: "", Resource: "endpoints", Verb: "get", Namespaced: true},
	"endpoints.list":   {Group: "", Resource: "endpoints", Verb: "list", Namespaced: true},
	"endpoints.watch":  {Group: "", Resource: "endpoints", Verb: "watch", Namespaced: true},
	"endpoints.update": {Group: "", Resource: "endpoints", Verb: "update", Namespaced: true},
	"endpoints.patch":  {Group: "", Resource: "endpoints", Verb: "patch", Namespaced: true},

	"endpointslices.get":    {Group: "discovery.k8s.io", Resource: "endpointslices", Verb: "get", Namespaced: true},
	"endpointslices.list":   {Group: "discovery.k8s.io", Resource: "endpointslices", Verb: "list", Namespaced: true},
	"endpointslices.watch":  {Group: "discovery.k8s.io", Resource: "endpointslices", Verb: "watch", Namespaced: true},
	"endpointslices.create": {Group: "discovery.k8s.io", Resource: "endpointslices", Verb: "create", Namespaced: true},
	"endpointslices.update": {Group: "discovery.k8s.io", Resource: "endpointslices", Verb: "update", Namespaced: true},
	"endpointslices.delete": {Group: "discovery.k8s.io", Resource: "endpointslices", Verb: "delete", Namespaced: true},
	"endpointslices.patch":  {Group: "discovery.k8s.io", Resource: "endpointslices", Verb: "patch", Namespaced: true},

	// ---- Accounts & quotas ----
	"serviceaccounts.get":    {Group: "", Resource: "serviceaccounts", Verb: "get", Namespaced: true},
	"serviceaccounts.list":   {Group: "", Resource: "serviceaccounts", Verb: "list", Namespaced: true},
	"serviceaccounts.create": {Group: "", Resource: "serviceaccounts", Verb: "create", Namespaced: true},
	"serviceaccounts.update": {Group: "", Resource: "serviceaccounts", Verb: "update", Namespaced: true},
	"serviceaccounts.delete": {Group: "", Resource: "serviceaccounts", Verb: "delete", Namespaced: true},
	"serviceaccounts.patch":  {Group: "", Resource: "serviceaccounts", Verb: "patch", Namespaced: true},
	// TokenRequest subresource (for projected/bound tokens)
	"serviceaccounts.token": {Group: "", Resource: "serviceaccounts", Subresource: "token", Verb: "create", Namespaced: true},

	"resourcequotas.get":    {Group: "", Resource: "resourcequotas", Verb: "get", Namespaced: true},
	"resourcequotas.list":   {Group: "", Resource: "resourcequotas", Verb: "list", Namespaced: true},
	"resourcequotas.create": {Group: "", Resource: "resourcequotas", Verb: "create", Namespaced: true},
	"resourcequotas.update": {Group: "", Resource: "resourcequotas", Verb: "update", Namespaced: true},
	"resourcequotas.delete": {Group: "", Resource: "resourcequotas", Verb: "delete", Namespaced: true},
	"resourcequotas.patch":  {Group: "", Resource: "resourcequotas", Verb: "patch", Namespaced: true},
	"resourcequotas.watch":  {Group: "", Resource: "resourcequotas", Verb: "watch", Namespaced: true},

	"limitranges.get":   {Group: "", Resource: "limitranges", Verb: "get", Namespaced: true},
	"limitranges.list":  {Group: "", Resource: "limitranges", Verb: "list", Namespaced: true},
	"limitranges.watch": {Group: "", Resource: "limitranges", Verb: "watch", Namespaced: true},

	// ---- Ingress classes ----
	"ingressclasses.get":    {Group: "networking.k8s.io", Resource: "ingressclasses", Verb: "get", Namespaced: false},
	"ingressclasses.list":   {Group: "networking.k8s.io", Resource: "ingressclasses", Verb: "list", Namespaced: false},
	"ingressclasses.watch":  {Group: "networking.k8s.io", Resource: "ingressclasses", Verb: "watch", Namespaced: false},
	"ingressclasses.create": {Group: "networking.k8s.io", Resource: "ingressclasses", Verb: "create", Namespaced: false},
	"ingressclasses.update": {Group: "networking.k8s.io", Resource: "ingressclasses", Verb: "update", Namespaced: false},
	"ingressclasses.delete": {Group: "networking.k8s.io", Resource: "ingressclasses", Verb: "delete", Namespaced: false},
	"ingressclasses.patch":  {Group: "networking.k8s.io", Resource: "ingressclasses", Verb: "patch", Namespaced: false},

	// ---- Coordination / Scheduling / Node classes ----
	"leases.get":    {Group: "coordination.k8s.io", Resource: "leases", Verb: "get", Namespaced: true},
	"leases.list":   {Group: "coordination.k8s.io", Resource: "leases", Verb: "list", Namespaced: true},
	"leases.create": {Group: "coordination.k8s.io", Resource: "leases", Verb: "create", Namespaced: true},
	"leases.update": {Group: "coordination.k8s.io", Resource: "leases", Verb: "update", Namespaced: true},
	"leases.delete": {Group: "coordination.k8s.io", Resource: "leases", Verb: "delete", Namespaced: true},
	"leases.patch":  {Group: "coordination.k8s.io", Resource: "leases", Verb: "patch", Namespaced: true},
	"leases.watch":  {Group: "coordination.k8s.io", Resource: "leases", Verb: "watch", Namespaced: true},

	"priorityclasses.get":    {Group: "scheduling.k8s.io", Resource: "priorityclasses", Verb: "get", Namespaced: false},
	"priorityclasses.list":   {Group: "scheduling.k8s.io", Resource: "priorityclasses", Verb: "list", Namespaced: false},
	"priorityclasses.watch":  {Group: "scheduling.k8s.io", Resource: "priorityclasses", Verb: "watch", Namespaced: false},
	"priorityclasses.create": {Group: "scheduling.k8s.io", Resource: "priorityclasses", Verb: "create", Namespaced: false},
	"priorityclasses.update": {Group: "scheduling.k8s.io", Resource: "priorityclasses", Verb: "update", Namespaced: false},
	"priorityclasses.delete": {Group: "scheduling.k8s.io", Resource: "priorityclasses", Verb: "delete", Namespaced: false},
	"priorityclasses.patch":  {Group: "scheduling.k8s.io", Resource: "priorityclasses", Verb: "patch", Namespaced: false},

	"runtimeclasses.get":   {Group: "node.k8s.io", Resource: "runtimeclasses", Verb: "get", Namespaced: false},
	"runtimeclasses.list":  {Group: "node.k8s.io", Resource: "runtimeclasses", Verb: "list", Namespaced: false},
	"runtimeclasses.watch": {Group: "node.k8s.io", Resource: "runtimeclasses", Verb: "watch", Namespaced: false},

	// ---- Admission / API registration / CRDs ----
	"mutatingwebhookconfigurations.get":    {Group: "admissionregistration.k8s.io", Resource: "mutatingwebhookconfigurations", Verb: "get", Namespaced: false},
	"mutatingwebhookconfigurations.list":   {Group: "admissionregistration.k8s.io", Resource: "mutatingwebhookconfigurations", Verb: "list", Namespaced: false},
	"mutatingwebhookconfigurations.watch":  {Group: "admissionregistration.k8s.io", Resource: "mutatingwebhookconfigurations", Verb: "watch", Namespaced: false},
	"mutatingwebhookconfigurations.create": {Group: "admissionregistration.k8s.io", Resource: "mutatingwebhookconfigurations", Verb: "create", Namespaced: false},
	"mutatingwebhookconfigurations.update": {Group: "admissionregistration.k8s.io", Resource: "mutatingwebhookconfigurations", Verb: "update", Namespaced: false},
	"mutatingwebhookconfigurations.delete": {Group: "admissionregistration.k8s.io", Resource: "mutatingwebhookconfigurations", Verb: "delete", Namespaced: false},
	"mutatingwebhookconfigurations.patch":  {Group: "admissionregistration.k8s.io", Resource: "mutatingwebhookconfigurations", Verb: "patch", Namespaced: false},

	"validatingwebhookconfigurations.get":    {Group: "admissionregistration.k8s.io", Resource: "validatingwebhookconfigurations", Verb: "get", Namespaced: false},
	"validatingwebhookconfigurations.list":   {Group: "admissionregistration.k8s.io", Resource: "validatingwebhookconfigurations", Verb: "list", Namespaced: false},
	"validatingwebhookconfigurations.watch":  {Group: "admissionregistration.k8s.io", Resource: "validatingwebhookconfigurations", Verb: "watch", Namespaced: false},
	"validatingwebhookconfigurations.create": {Group: "admissionregistration.k8s.io", Resource: "validatingwebhookconfigurations", Verb: "create", Namespaced: false},
	"validatingwebhookconfigurations.update": {Group: "admissionregistration.k8s.io", Resource: "validatingwebhookconfigurations", Verb: "update", Namespaced: false},
	"validatingwebhookconfigurations.delete": {Group: "admissionregistration.k8s.io", Resource: "validatingwebhookconfigurations", Verb: "delete", Namespaced: false},
	"validatingwebhookconfigurations.patch":  {Group: "admissionregistration.k8s.io", Resource: "validatingwebhookconfigurations", Verb: "patch", Namespaced: false},

	"validatingadmissionpolicies.*":       {Group: "admissionregistration.k8s.io", Resource: "validatingadmissionpolicies", Verb: "list", Namespaced: false},       // + get/watch/create/update/delete/patch as needed
	"validatingadmissionpolicybindings.*": {Group: "admissionregistration.k8s.io", Resource: "validatingadmissionpolicybindings", Verb: "list", Namespaced: false}, // + get/watch/create/update/delete/patch

	"customresourcedefinitions.get":    {Group: "apiextensions.k8s.io", Resource: "customresourcedefinitions", Verb: "get", Namespaced: false},
	"customresourcedefinitions.list":   {Group: "apiextensions.k8s.io", Resource: "customresourcedefinitions", Verb: "list", Namespaced: false},
	"customresourcedefinitions.watch":  {Group: "apiextensions.k8s.io", Resource: "customresourcedefinitions", Verb: "watch", Namespaced: false},
	"customresourcedefinitions.create": {Group: "apiextensions.k8s.io", Resource: "customresourcedefinitions", Verb: "create", Namespaced: false},
	"customresourcedefinitions.update": {Group: "apiextensions.k8s.io", Resource: "customresourcedefinitions", Verb: "update", Namespaced: false},
	"customresourcedefinitions.delete": {Group: "apiextensions.k8s.io", Resource: "customresourcedefinitions", Verb: "delete", Namespaced: false},
	"customresourcedefinitions.patch":  {Group: "apiextensions.k8s.io", Resource: "customresourcedefinitions", Verb: "patch", Namespaced: false},

	"apiservices.get":    {Group: "apiregistration.k8s.io", Resource: "apiservices", Verb: "get", Namespaced: false},
	"apiservices.list":   {Group: "apiregistration.k8s.io", Resource: "apiservices", Verb: "list", Namespaced: false},
	"apiservices.watch":  {Group: "apiregistration.k8s.io", Resource: "apiservices", Verb: "watch", Namespaced: false},
	"apiservices.create": {Group: "apiregistration.k8s.io", Resource: "apiservices", Verb: "create", Namespaced: false},
	"apiservices.update": {Group: "apiregistration.k8s.io", Resource: "apiservices", Verb: "update", Namespaced: false},
	"apiservices.delete": {Group: "apiregistration.k8s.io", Resource: "apiservices", Verb: "delete", Namespaced: false},
	"apiservices.patch":  {Group: "apiregistration.k8s.io", Resource: "apiservices", Verb: "patch", Namespaced: false},

	// ---- Certificates (CSR + approvals) ----
	"certificatesigningrequests.get":    {Group: "certificates.k8s.io", Resource: "certificatesigningrequests", Verb: "get", Namespaced: false},
	"certificatesigningrequests.list":   {Group: "certificates.k8s.io", Resource: "certificatesigningrequests", Verb: "list", Namespaced: false},
	"certificatesigningrequests.watch":  {Group: "certificates.k8s.io", Resource: "certificatesigningrequests", Verb: "watch", Namespaced: false},
	"certificatesigningrequests.create": {Group: "certificates.k8s.io", Resource: "certificatesigningrequests", Verb: "create", Namespaced: false},
	"certificatesigningrequests.update": {Group: "certificates.k8s.io", Resource: "certificatesigningrequests", Verb: "update", Namespaced: false},
	"certificatesigningrequests.delete": {Group: "certificates.k8s.io", Resource: "certificatesigningrequests", Verb: "delete", Namespaced: false},
	"certificatesigningrequests.patch":  {Group: "certificates.k8s.io", Resource: "certificatesigningrequests", Verb: "patch", Namespaced: false},
	// CSR subresources
	"certificatesigningrequests.approval": {Group: "certificates.k8s.io", Resource: "certificatesigningrequests", Subresource: "approval", Verb: "update", Namespaced: false},
	"certificatesigningrequests.status":   {Group: "certificates.k8s.io", Resource: "certificatesigningrequests", Subresource: "status", Verb: "update", Namespaced: false},

	// ---- AuthN / AuthZ review APIs ----
	"tokenreviews.create":              {Group: "authentication.k8s.io", Resource: "tokenreviews", Verb: "create", Namespaced: false},
	"subjectaccessreviews.create":      {Group: "authorization.k8s.io", Resource: "subjectaccessreviews", Verb: "create", Namespaced: false},
	"selfsubjectaccessreviews.create":  {Group: "authorization.k8s.io", Resource: "selfsubjectaccessreviews", Verb: "create", Namespaced: false},
	"selfsubjectrulesreviews.create":   {Group: "authorization.k8s.io", Resource: "selfsubjectrulesreviews", Verb: "create", Namespaced: false},
	"localsubjectaccessreviews.create": {Group: "authorization.k8s.io", Resource: "localsubjectaccessreviews", Verb: "create", Namespaced: true},

	// ---- API Priority & Fairness ----
	"prioritylevelconfigurations.*": {Group: "flowcontrol.apiserver.k8s.io", Resource: "prioritylevelconfigurations", Verb: "list", Namespaced: false}, // + get/watch/create/update/delete/patch
	"flowschemas.*":                 {Group: "flowcontrol.apiserver.k8s.io", Resource: "flowschemas", Verb: "list", Namespaced: false},                 // + get/watch/create/update/delete/patch

	// ---- Storage: CSI & attachments ----
	"csidrivers.*":           {Group: "storage.k8s.io", Resource: "csidrivers", Verb: "list", Namespaced: false},          // + get/watch/create/update/delete/patch
	"csinodes.*":             {Group: "storage.k8s.io", Resource: "csinodes", Verb: "list", Namespaced: false},            // + get/watch/create/update/delete/patch
	"csistoragecapacities.*": {Group: "storage.k8s.io", Resource: "csistoragecapacities", Verb: "list", Namespaced: true}, // + get/watch/create/update/delete/patch
	"volumeattachments.*":    {Group: "storage.k8s.io", Resource: "volumeattachments", Verb: "list", Namespaced: false},   // + get/watch/create/update/delete/patch

	// ---- Events: prefer events.k8s.io/v1 with fallback to core/v1 ----
	"events.v1.get":    {Group: "events.k8s.io", Resource: "events", Verb: "get", Namespaced: true},
	"events.v1.list":   {Group: "events.k8s.io", Resource: "events", Verb: "list", Namespaced: true},
	"events.v1.watch":  {Group: "events.k8s.io", Resource: "events", Verb: "watch", Namespaced: true},
	"events.v1.create": {Group: "events.k8s.io", Resource: "events", Verb: "create", Namespaced: true},

	// ---- Policy: PodDisruptionBudget ----
	"poddisruptionbudgets.get":    {Group: "policy", Resource: "poddisruptionbudgets", Verb: "get", Namespaced: true},
	"poddisruptionbudgets.list":   {Group: "policy", Resource: "poddisruptionbudgets", Verb: "list", Namespaced: true},
	"poddisruptionbudgets.watch":  {Group: "policy", Resource: "poddisruptionbudgets", Verb: "watch", Namespaced: true},
	"poddisruptionbudgets.create": {Group: "policy", Resource: "poddisruptionbudgets", Verb: "create", Namespaced: true},
	"poddisruptionbudgets.update": {Group: "policy", Resource: "poddisruptionbudgets", Verb: "update", Namespaced: true},
	"poddisruptionbudgets.delete": {Group: "policy", Resource: "poddisruptionbudgets", Verb: "delete", Namespaced: true},
	"poddisruptionbudgets.patch":  {Group: "policy", Resource: "poddisruptionbudgets", Verb: "patch", Namespaced: true},

	// ---- RBAC special verbs: bind / escalate / impersonate ----
	"rbac.roles.bind":            {Group: "rbac.authorization.k8s.io", Resource: "roles", Verb: "bind", Namespaced: true},
	"rbac.clusterroles.bind":     {Group: "rbac.authorization.k8s.io", Resource: "clusterroles", Verb: "bind", Namespaced: false},
	"rbac.roles.escalate":        {Group: "rbac.authorization.k8s.io", Resource: "roles", Verb: "escalate", Namespaced: true},
	"rbac.clusterroles.escalate": {Group: "rbac.authorization.k8s.io", Resource: "clusterroles", Verb: "escalate", Namespaced: false},

	// Impersonation (used by your backend to Impersonate-User/Group/SA)
	"rbac.impersonate.users":             {Group: "", Resource: "users", Verb: "impersonate", Namespaced: false},
	"rbac.impersonate.groups":            {Group: "", Resource: "groups", Verb: "impersonate", Namespaced: false},
	"rbac.impersonate.serviceaccounts":   {Group: "", Resource: "serviceaccounts", Verb: "impersonate", Namespaced: false},
	"rbac.impersonate.userextras.scopes": {Group: "authentication.k8s.io", Resource: "userextras", Subresource: "scopes", Verb: "impersonate", Namespaced: false},
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

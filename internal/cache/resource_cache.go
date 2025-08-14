package cache

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"time"

	"go.uber.org/zap"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
)

// ResourceCacheItem represents a cached resource item
type ResourceCacheItem struct {
	ID             string                 `json:"id"`
	Name           string                 `json:"name"`
	Namespace      string                 `json:"namespace,omitempty"`
	ResourceType   string                 `json:"resourceType"`
	Kind           string                 `json:"kind"`
	Labels         map[string]string      `json:"labels,omitempty"`
	Annotations    map[string]string      `json:"annotations,omitempty"`
	Age            string                 `json:"age,omitempty"`
	CreationTime   time.Time              `json:"creationTimestamp"`
	LastUpdated    time.Time              `json:"lastUpdated"`
	SearchableText string                 `json:"-"` // Combined text for searching
	RawData        map[string]interface{} `json:"rawData,omitempty"`
}

// ResourceCache manages in-memory cache of Kubernetes resources
type ResourceCache struct {
	mu            sync.RWMutex
	logger        *zap.Logger
	kubeClient    kubernetes.Interface
	resources     map[string]*ResourceCacheItem // key: resourceType:namespace:name
	lastRefresh   time.Time
	refreshTTL    time.Duration
	maxSize       int
	enabledTypes  map[string]bool
	stopCh        chan struct{}
	refreshTicker *time.Ticker
}

// CacheConfig represents configuration for the resource cache
type CacheConfig struct {
	RefreshInterval time.Duration
	MaxSize         int
	EnabledTypes    []string // resource types to cache
}

// DefaultCacheConfig returns default cache configuration
func DefaultCacheConfig() *CacheConfig {
	return &CacheConfig{
		RefreshInterval: 30 * time.Second,
		MaxSize:         10000,
		EnabledTypes: []string{
			"pods",
			"deployments",
			"services",
			"configmaps",
			"secrets",
			"nodes",
			"namespaces",
			"statefulsets",
			"daemonsets",
			"replicasets",
			"jobs",
			"cronjobs",
			"ingresses",
			"endpoints",
			"persistentvolumes",
			"persistentvolumeclaims",
			"storageClasses",
			"networkpolicies",
			"roles",
			"rolebindings",
			"clusterroles",
			"clusterrolebindings",
			"serviceaccounts",
		},
	}
}

// NewResourceCache creates a new resource cache
func NewResourceCache(logger *zap.Logger, kubeClient kubernetes.Interface, config *CacheConfig) *ResourceCache {
	if config == nil {
		config = DefaultCacheConfig()
	}

	enabledTypes := make(map[string]bool)
	for _, resType := range config.EnabledTypes {
		enabledTypes[resType] = true
	}

	cache := &ResourceCache{
		logger:       logger,
		kubeClient:   kubeClient,
		resources:    make(map[string]*ResourceCacheItem),
		refreshTTL:   config.RefreshInterval,
		maxSize:      config.MaxSize,
		enabledTypes: enabledTypes,
		stopCh:       make(chan struct{}),
	}

	return cache
}

// Start begins the background refresh process
func (rc *ResourceCache) Start(ctx context.Context) error {
	rc.logger.Info("Starting resource cache",
		zap.Duration("refreshInterval", rc.refreshTTL),
		zap.Int("maxSize", rc.maxSize),
		zap.Int("enabledTypes", len(rc.enabledTypes)))

	// Initial population
	if err := rc.refresh(ctx); err != nil {
		return fmt.Errorf("failed initial cache refresh: %w", err)
	}

	// Start periodic refresh
	rc.refreshTicker = time.NewTicker(rc.refreshTTL)
	go rc.backgroundRefresh(ctx)

	return nil
}

// Stop stops the background refresh process
func (rc *ResourceCache) Stop() {
	rc.logger.Info("Stopping resource cache")
	if rc.refreshTicker != nil {
		rc.refreshTicker.Stop()
	}
	close(rc.stopCh)
}

// backgroundRefresh runs the periodic refresh in a goroutine
func (rc *ResourceCache) backgroundRefresh(ctx context.Context) {
	for {
		select {
		case <-rc.refreshTicker.C:
			if err := rc.refresh(ctx); err != nil {
				rc.logger.Error("Failed to refresh cache", zap.Error(err))
			}
		case <-rc.stopCh:
			return
		case <-ctx.Done():
			return
		}
	}
}

// refresh updates the cache with fresh data from Kubernetes
func (rc *ResourceCache) refresh(ctx context.Context) error {
	rc.logger.Debug("Refreshing resource cache")
	start := time.Now()

	newResources := make(map[string]*ResourceCacheItem)

	// Refresh each enabled resource type
	for resourceType := range rc.enabledTypes {
		if err := rc.refreshResourceType(ctx, resourceType, newResources); err != nil {
			rc.logger.Error("Failed to refresh resource type",
				zap.String("resourceType", resourceType),
				zap.Error(err))
			// Continue with other resource types
		}
	}

	rc.mu.Lock()
	rc.resources = newResources
	rc.lastRefresh = time.Now()
	rc.mu.Unlock()

	duration := time.Since(start)
	rc.logger.Info("Cache refresh completed",
		zap.Duration("duration", duration),
		zap.Int("totalResources", len(newResources)))

	return nil
}

// refreshResourceType refreshes a specific resource type
func (rc *ResourceCache) refreshResourceType(ctx context.Context, resourceType string, newResources map[string]*ResourceCacheItem) error {
	switch resourceType {
	case "pods":
		return rc.refreshPods(ctx, newResources)
	case "deployments":
		return rc.refreshDeployments(ctx, newResources)
	case "services":
		return rc.refreshServices(ctx, newResources)
	case "configmaps":
		return rc.refreshConfigMaps(ctx, newResources)
	case "secrets":
		return rc.refreshSecrets(ctx, newResources)
	case "nodes":
		return rc.refreshNodes(ctx, newResources)
	case "namespaces":
		return rc.refreshNamespaces(ctx, newResources)
	case "statefulsets":
		return rc.refreshStatefulSets(ctx, newResources)
	case "daemonsets":
		return rc.refreshDaemonSets(ctx, newResources)
	case "replicasets":
		return rc.refreshReplicaSets(ctx, newResources)
	case "jobs":
		return rc.refreshJobs(ctx, newResources)
	case "cronjobs":
		return rc.refreshCronJobs(ctx, newResources)
	case "serviceaccounts":
		return rc.refreshServiceAccounts(ctx, newResources)
	default:
		rc.logger.Debug("Unsupported resource type for caching", zap.String("resourceType", resourceType))
		return nil
	}
}

// refreshPods refreshes pods in the cache
func (rc *ResourceCache) refreshPods(ctx context.Context, newResources map[string]*ResourceCacheItem) error {
	pods, err := rc.kubeClient.CoreV1().Pods("").List(ctx, metav1.ListOptions{})
	if err != nil {
		return fmt.Errorf("failed to list pods: %w", err)
	}

	for _, pod := range pods.Items {
		key := fmt.Sprintf("pods:%s:%s", pod.Namespace, pod.Name)
		item := &ResourceCacheItem{
			ID:           key,
			Name:         pod.Name,
			Namespace:    pod.Namespace,
			ResourceType: "pods",
			Kind:         "Pod",
			Labels:       pod.Labels,
			Annotations:  pod.Annotations,
			CreationTime: pod.CreationTimestamp.Time,
			LastUpdated:  time.Now(),
		}

		// Calculate age
		item.Age = rc.formatAge(item.CreationTime)

		// Build searchable text
		item.SearchableText = rc.buildSearchableText(item.Name, item.Namespace, item.Labels, item.Annotations)

		newResources[key] = item
	}

	return nil
}

// refreshDeployments refreshes deployments in the cache
func (rc *ResourceCache) refreshDeployments(ctx context.Context, newResources map[string]*ResourceCacheItem) error {
	deployments, err := rc.kubeClient.AppsV1().Deployments("").List(ctx, metav1.ListOptions{})
	if err != nil {
		return fmt.Errorf("failed to list deployments: %w", err)
	}

	for _, deployment := range deployments.Items {
		key := fmt.Sprintf("deployments:%s:%s", deployment.Namespace, deployment.Name)
		item := &ResourceCacheItem{
			ID:           key,
			Name:         deployment.Name,
			Namespace:    deployment.Namespace,
			ResourceType: "deployments",
			Kind:         "Deployment",
			Labels:       deployment.Labels,
			Annotations:  deployment.Annotations,
			CreationTime: deployment.CreationTimestamp.Time,
			LastUpdated:  time.Now(),
		}

		item.Age = rc.formatAge(item.CreationTime)
		item.SearchableText = rc.buildSearchableText(item.Name, item.Namespace, item.Labels, item.Annotations)

		newResources[key] = item
	}

	return nil
}

// refreshServices refreshes services in the cache
func (rc *ResourceCache) refreshServices(ctx context.Context, newResources map[string]*ResourceCacheItem) error {
	services, err := rc.kubeClient.CoreV1().Services("").List(ctx, metav1.ListOptions{})
	if err != nil {
		return fmt.Errorf("failed to list services: %w", err)
	}

	for _, service := range services.Items {
		key := fmt.Sprintf("services:%s:%s", service.Namespace, service.Name)
		item := &ResourceCacheItem{
			ID:           key,
			Name:         service.Name,
			Namespace:    service.Namespace,
			ResourceType: "services",
			Kind:         "Service",
			Labels:       service.Labels,
			Annotations:  service.Annotations,
			CreationTime: service.CreationTimestamp.Time,
			LastUpdated:  time.Now(),
		}

		item.Age = rc.formatAge(item.CreationTime)
		item.SearchableText = rc.buildSearchableText(item.Name, item.Namespace, item.Labels, item.Annotations)

		newResources[key] = item
	}

	return nil
}

// refreshConfigMaps refreshes configmaps in the cache
func (rc *ResourceCache) refreshConfigMaps(ctx context.Context, newResources map[string]*ResourceCacheItem) error {
	configMaps, err := rc.kubeClient.CoreV1().ConfigMaps("").List(ctx, metav1.ListOptions{})
	if err != nil {
		return fmt.Errorf("failed to list configmaps: %w", err)
	}

	for _, cm := range configMaps.Items {
		key := fmt.Sprintf("configmaps:%s:%s", cm.Namespace, cm.Name)
		item := &ResourceCacheItem{
			ID:           key,
			Name:         cm.Name,
			Namespace:    cm.Namespace,
			ResourceType: "configmaps",
			Kind:         "ConfigMap",
			Labels:       cm.Labels,
			Annotations:  cm.Annotations,
			CreationTime: cm.CreationTimestamp.Time,
			LastUpdated:  time.Now(),
		}

		item.Age = rc.formatAge(item.CreationTime)
		item.SearchableText = rc.buildSearchableText(item.Name, item.Namespace, item.Labels, item.Annotations)

		newResources[key] = item
	}

	return nil
}

// refreshSecrets refreshes secrets in the cache
func (rc *ResourceCache) refreshSecrets(ctx context.Context, newResources map[string]*ResourceCacheItem) error {
	secrets, err := rc.kubeClient.CoreV1().Secrets("").List(ctx, metav1.ListOptions{})
	if err != nil {
		return fmt.Errorf("failed to list secrets: %w", err)
	}

	for _, secret := range secrets.Items {
		key := fmt.Sprintf("secrets:%s:%s", secret.Namespace, secret.Name)
		item := &ResourceCacheItem{
			ID:           key,
			Name:         secret.Name,
			Namespace:    secret.Namespace,
			ResourceType: "secrets",
			Kind:         "Secret",
			Labels:       secret.Labels,
			Annotations:  secret.Annotations,
			CreationTime: secret.CreationTimestamp.Time,
			LastUpdated:  time.Now(),
		}

		item.Age = rc.formatAge(item.CreationTime)
		item.SearchableText = rc.buildSearchableText(item.Name, item.Namespace, item.Labels, item.Annotations)

		newResources[key] = item
	}

	return nil
}

// refreshNodes refreshes nodes in the cache
func (rc *ResourceCache) refreshNodes(ctx context.Context, newResources map[string]*ResourceCacheItem) error {
	nodes, err := rc.kubeClient.CoreV1().Nodes().List(ctx, metav1.ListOptions{})
	if err != nil {
		return fmt.Errorf("failed to list nodes: %w", err)
	}

	for _, node := range nodes.Items {
		key := fmt.Sprintf("nodes::%s", node.Name) // nodes are cluster-scoped
		item := &ResourceCacheItem{
			ID:           key,
			Name:         node.Name,
			ResourceType: "nodes",
			Kind:         "Node",
			Labels:       node.Labels,
			Annotations:  node.Annotations,
			CreationTime: node.CreationTimestamp.Time,
			LastUpdated:  time.Now(),
		}

		item.Age = rc.formatAge(item.CreationTime)
		item.SearchableText = rc.buildSearchableText(item.Name, "", item.Labels, item.Annotations)

		newResources[key] = item
	}

	return nil
}

// refreshNamespaces refreshes namespaces in the cache
func (rc *ResourceCache) refreshNamespaces(ctx context.Context, newResources map[string]*ResourceCacheItem) error {
	namespaces, err := rc.kubeClient.CoreV1().Namespaces().List(ctx, metav1.ListOptions{})
	if err != nil {
		return fmt.Errorf("failed to list namespaces: %w", err)
	}

	for _, ns := range namespaces.Items {
		key := fmt.Sprintf("namespaces::%s", ns.Name) // namespaces are cluster-scoped
		item := &ResourceCacheItem{
			ID:           key,
			Name:         ns.Name,
			ResourceType: "namespaces",
			Kind:         "Namespace",
			Labels:       ns.Labels,
			Annotations:  ns.Annotations,
			CreationTime: ns.CreationTimestamp.Time,
			LastUpdated:  time.Now(),
		}

		item.Age = rc.formatAge(item.CreationTime)
		item.SearchableText = rc.buildSearchableText(item.Name, "", item.Labels, item.Annotations)

		newResources[key] = item
	}

	return nil
}

// refreshStatefulSets refreshes statefulsets in the cache
func (rc *ResourceCache) refreshStatefulSets(ctx context.Context, newResources map[string]*ResourceCacheItem) error {
	statefulSets, err := rc.kubeClient.AppsV1().StatefulSets("").List(ctx, metav1.ListOptions{})
	if err != nil {
		return fmt.Errorf("failed to list statefulsets: %w", err)
	}

	for _, sts := range statefulSets.Items {
		key := fmt.Sprintf("statefulsets:%s:%s", sts.Namespace, sts.Name)
		item := &ResourceCacheItem{
			ID:           key,
			Name:         sts.Name,
			Namespace:    sts.Namespace,
			ResourceType: "statefulsets",
			Kind:         "StatefulSet",
			Labels:       sts.Labels,
			Annotations:  sts.Annotations,
			CreationTime: sts.CreationTimestamp.Time,
			LastUpdated:  time.Now(),
		}

		item.Age = rc.formatAge(item.CreationTime)
		item.SearchableText = rc.buildSearchableText(item.Name, item.Namespace, item.Labels, item.Annotations)

		newResources[key] = item
	}

	return nil
}

// refreshDaemonSets refreshes daemonsets in the cache
func (rc *ResourceCache) refreshDaemonSets(ctx context.Context, newResources map[string]*ResourceCacheItem) error {
	daemonSets, err := rc.kubeClient.AppsV1().DaemonSets("").List(ctx, metav1.ListOptions{})
	if err != nil {
		return fmt.Errorf("failed to list daemonsets: %w", err)
	}

	for _, ds := range daemonSets.Items {
		key := fmt.Sprintf("daemonsets:%s:%s", ds.Namespace, ds.Name)
		item := &ResourceCacheItem{
			ID:           key,
			Name:         ds.Name,
			Namespace:    ds.Namespace,
			ResourceType: "daemonsets",
			Kind:         "DaemonSet",
			Labels:       ds.Labels,
			Annotations:  ds.Annotations,
			CreationTime: ds.CreationTimestamp.Time,
			LastUpdated:  time.Now(),
		}

		item.Age = rc.formatAge(item.CreationTime)
		item.SearchableText = rc.buildSearchableText(item.Name, item.Namespace, item.Labels, item.Annotations)

		newResources[key] = item
	}

	return nil
}

// refreshReplicaSets refreshes replicasets in the cache
func (rc *ResourceCache) refreshReplicaSets(ctx context.Context, newResources map[string]*ResourceCacheItem) error {
	replicaSets, err := rc.kubeClient.AppsV1().ReplicaSets("").List(ctx, metav1.ListOptions{})
	if err != nil {
		return fmt.Errorf("failed to list replicasets: %w", err)
	}

	for _, rs := range replicaSets.Items {
		key := fmt.Sprintf("replicasets:%s:%s", rs.Namespace, rs.Name)
		item := &ResourceCacheItem{
			ID:           key,
			Name:         rs.Name,
			Namespace:    rs.Namespace,
			ResourceType: "replicasets",
			Kind:         "ReplicaSet",
			Labels:       rs.Labels,
			Annotations:  rs.Annotations,
			CreationTime: rs.CreationTimestamp.Time,
			LastUpdated:  time.Now(),
		}

		item.Age = rc.formatAge(item.CreationTime)
		item.SearchableText = rc.buildSearchableText(item.Name, item.Namespace, item.Labels, item.Annotations)

		newResources[key] = item
	}

	return nil
}

// refreshJobs refreshes jobs in the cache
func (rc *ResourceCache) refreshJobs(ctx context.Context, newResources map[string]*ResourceCacheItem) error {
	jobs, err := rc.kubeClient.BatchV1().Jobs("").List(ctx, metav1.ListOptions{})
	if err != nil {
		return fmt.Errorf("failed to list jobs: %w", err)
	}

	for _, job := range jobs.Items {
		key := fmt.Sprintf("jobs:%s:%s", job.Namespace, job.Name)
		item := &ResourceCacheItem{
			ID:           key,
			Name:         job.Name,
			Namespace:    job.Namespace,
			ResourceType: "jobs",
			Kind:         "Job",
			Labels:       job.Labels,
			Annotations:  job.Annotations,
			CreationTime: job.CreationTimestamp.Time,
			LastUpdated:  time.Now(),
		}

		item.Age = rc.formatAge(item.CreationTime)
		item.SearchableText = rc.buildSearchableText(item.Name, item.Namespace, item.Labels, item.Annotations)

		newResources[key] = item
	}

	return nil
}

// refreshCronJobs refreshes cronjobs in the cache
func (rc *ResourceCache) refreshCronJobs(ctx context.Context, newResources map[string]*ResourceCacheItem) error {
	cronJobs, err := rc.kubeClient.BatchV1().CronJobs("").List(ctx, metav1.ListOptions{})
	if err != nil {
		return fmt.Errorf("failed to list cronjobs: %w", err)
	}

	for _, cj := range cronJobs.Items {
		key := fmt.Sprintf("cronjobs:%s:%s", cj.Namespace, cj.Name)
		item := &ResourceCacheItem{
			ID:           key,
			Name:         cj.Name,
			Namespace:    cj.Namespace,
			ResourceType: "cronjobs",
			Kind:         "CronJob",
			Labels:       cj.Labels,
			Annotations:  cj.Annotations,
			CreationTime: cj.CreationTimestamp.Time,
			LastUpdated:  time.Now(),
		}

		item.Age = rc.formatAge(item.CreationTime)
		item.SearchableText = rc.buildSearchableText(item.Name, item.Namespace, item.Labels, item.Annotations)

		newResources[key] = item
	}

	return nil
}

// refreshServiceAccounts refreshes service accounts in the cache
func (rc *ResourceCache) refreshServiceAccounts(ctx context.Context, newResources map[string]*ResourceCacheItem) error {
	serviceAccounts, err := rc.kubeClient.CoreV1().ServiceAccounts("").List(ctx, metav1.ListOptions{})
	if err != nil {
		return fmt.Errorf("failed to list serviceaccounts: %w", err)
	}

	for _, sa := range serviceAccounts.Items {
		key := fmt.Sprintf("serviceaccounts:%s:%s", sa.Namespace, sa.Name)
		item := &ResourceCacheItem{
			ID:           key,
			Name:         sa.Name,
			Namespace:    sa.Namespace,
			ResourceType: "serviceaccounts",
			Kind:         "ServiceAccount",
			Labels:       sa.Labels,
			Annotations:  sa.Annotations,
			CreationTime: sa.CreationTimestamp.Time,
			LastUpdated:  time.Now(),
		}

		item.Age = rc.formatAge(item.CreationTime)
		item.SearchableText = rc.buildSearchableText(item.Name, item.Namespace, item.Labels, item.Annotations)

		newResources[key] = item
	}

	return nil
}

// buildSearchableText creates a searchable text string from resource metadata
func (rc *ResourceCache) buildSearchableText(name, namespace string, labels, annotations map[string]string) string {
	var parts []string

	parts = append(parts, strings.ToLower(name))
	if namespace != "" {
		parts = append(parts, strings.ToLower(namespace))
	}

	for key, value := range labels {
		parts = append(parts, strings.ToLower(fmt.Sprintf("%s:%s", key, value)))
		parts = append(parts, strings.ToLower(key))
		parts = append(parts, strings.ToLower(value))
	}

	for key, value := range annotations {
		parts = append(parts, strings.ToLower(fmt.Sprintf("%s:%s", key, value)))
		parts = append(parts, strings.ToLower(key))
		parts = append(parts, strings.ToLower(value))
	}

	return strings.Join(parts, " ")
}

// formatAge formats time duration as human-readable age
func (rc *ResourceCache) formatAge(t time.Time) string {
	duration := time.Since(t)

	if duration < time.Minute {
		return fmt.Sprintf("%ds", int(duration.Seconds()))
	} else if duration < time.Hour {
		return fmt.Sprintf("%dm", int(duration.Minutes()))
	} else if duration < 24*time.Hour {
		return fmt.Sprintf("%dh", int(duration.Hours()))
	} else {
		return fmt.Sprintf("%dd", int(duration.Hours()/24))
	}
}

// Search searches for resources matching the query
func (rc *ResourceCache) Search(query string, resourceTypes []string, namespace string, limit int) ([]*ResourceCacheItem, error) {
	if query = strings.TrimSpace(query); query == "" {
		return []*ResourceCacheItem{}, nil
	}

	rc.mu.RLock()
	defer rc.mu.RUnlock()

	queryLower := strings.ToLower(query)
	var results []*ResourceCacheItem

	// Filter by resource types if specified
	typeFilter := make(map[string]bool)
	if len(resourceTypes) > 0 {
		for _, t := range resourceTypes {
			typeFilter[t] = true
		}
	}

	for _, item := range rc.resources {
		// Filter by resource type
		if len(typeFilter) > 0 && !typeFilter[item.ResourceType] {
			continue
		}

		// Filter by namespace if specified
		if namespace != "" && item.Namespace != namespace {
			continue
		}

		// Check if query matches searchable text
		if strings.Contains(item.SearchableText, queryLower) {
			results = append(results, item)
		}

		// Apply limit
		if limit > 0 && len(results) >= limit {
			break
		}
	}

	return results, nil
}

// GetStats returns cache statistics
func (rc *ResourceCache) GetStats() map[string]interface{} {
	rc.mu.RLock()
	defer rc.mu.RUnlock()

	stats := make(map[string]interface{})
	stats["totalResources"] = len(rc.resources)
	stats["lastRefresh"] = rc.lastRefresh
	stats["refreshInterval"] = rc.refreshTTL
	stats["maxSize"] = rc.maxSize

	// Count by resource type
	typeCount := make(map[string]int)
	for _, item := range rc.resources {
		typeCount[item.ResourceType]++
	}
	stats["resourcesByType"] = typeCount

	return stats
}

// ForceRefresh forces an immediate cache refresh
func (rc *ResourceCache) ForceRefresh(ctx context.Context) error {
	return rc.refresh(ctx)
}

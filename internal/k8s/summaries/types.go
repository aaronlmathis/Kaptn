package summaries

import (
	"fmt"
	"time"
)

// ResourceSummary represents summary data for a specific resource type
type ResourceSummary struct {
	Resource     string             `json:"resource"`
	Namespace    string             `json:"namespace,omitempty"`
	Total        int                `json:"total"`
	Status       map[string]int     `json:"status,omitempty"`
	Capacity     map[string]float64 `json:"capacity,omitempty"`
	Usage        map[string]float64 `json:"usage,omitempty"`
	Activity     map[string]int     `json:"activity,omitempty"`
	Distribution map[string]int     `json:"distribution,omitempty"`
	Cards        []SummaryCard      `json:"cards"`
	LastUpdated  time.Time          `json:"lastUpdated"`
	CacheHit     bool               `json:"cacheHit,omitempty"`
}

// SummaryCard represents a single summary metric card
type SummaryCard struct {
	Title       string                 `json:"title"`
	Value       string                 `json:"value"`
	Subtitle    string                 `json:"subtitle"`
	Footer      string                 `json:"footer"`
	Description string                 `json:"description,omitempty"`
	Count       int                    `json:"count"`
	Healthy     int                    `json:"healthy"`
	Icon        string                 `json:"icon,omitempty"`
	Color       string                 `json:"color,omitempty"`
	Trend       map[string]interface{} `json:"trend,omitempty"`
	Status      string                 `json:"status,omitempty"` // "healthy", "warning", "error"
	LastUpdated time.Time              `json:"lastUpdated"`
}

// CacheItem represents a cached summary with expiration
type CacheItem struct {
	Summary   *ResourceSummary
	ExpiresAt time.Time
}

// SummaryConfig holds configuration for summary computations
type SummaryConfig struct {
	EnableWebSocketUpdates bool                     `yaml:"enable_websocket_updates"`
	RealtimeResources      []string                 `yaml:"realtime_resources"`
	CacheTTL               map[string]string        `yaml:"cache_ttl"`
	MaxCacheSize           int                      `yaml:"max_cache_size"`
	BackgroundRefresh      bool                     `yaml:"background_refresh"`
	cacheTTLDurations      map[string]time.Duration // parsed from CacheTTL
}

// GetCacheTTL returns the cache TTL duration for a resource type
func (c *SummaryConfig) GetCacheTTL(resource string) time.Duration {
	if c.cacheTTLDurations == nil {
		return 60 * time.Second // default
	}

	if duration, exists := c.cacheTTLDurations[resource]; exists {
		return duration
	}

	// Default TTLs based on resource volatility
	switch resource {
	case "pods", "nodes":
		return 5 * time.Second
	case "deployments", "services", "replicasets":
		return 15 * time.Second
	case "statefulsets", "daemonsets", "configmaps", "secrets":
		return 60 * time.Second
	case "persistentvolumes", "storageclasses", "roles", "clusterroles":
		return 300 * time.Second
	default:
		return 60 * time.Second
	}
}

// IsRealtimeResource checks if a resource should receive real-time updates
func (c *SummaryConfig) IsRealtimeResource(resource string) bool {
	for _, r := range c.RealtimeResources {
		if r == resource {
			return true
		}
	}
	return false
}

// ParseCacheTTLs converts string durations to time.Duration values
func (c *SummaryConfig) ParseCacheTTLs() error {
	c.cacheTTLDurations = make(map[string]time.Duration)

	for resource, ttlStr := range c.CacheTTL {
		duration, err := time.ParseDuration(ttlStr)
		if err != nil {
			return err
		}
		c.cacheTTLDurations[resource] = duration
	}

	return nil
}

// Initialize parses the TTL configuration strings into durations
func (c *SummaryConfig) Initialize() error {
	c.cacheTTLDurations = make(map[string]time.Duration)

	for resource, ttlStr := range c.CacheTTL {
		duration, err := time.ParseDuration(ttlStr)
		if err != nil {
			return fmt.Errorf("invalid TTL for resource %s: %w", resource, err)
		}
		c.cacheTTLDurations[resource] = duration
	}

	return nil
}

// DefaultSummaryConfig returns a default configuration
func DefaultSummaryConfig() *SummaryConfig {
	return &SummaryConfig{
		EnableWebSocketUpdates: true,
		RealtimeResources: []string{
			"pods", "nodes", "deployments", "services",
		},
		CacheTTL: map[string]string{
			"pods":              "5s",
			"nodes":             "10s",
			"deployments":       "15s",
			"services":          "30s",
			"replicasets":       "30s",
			"statefulsets":      "60s",
			"daemonsets":        "60s",
			"configmaps":        "60s",
			"secrets":           "60s",
			"endpoints":         "30s",
			"persistentvolumes": "300s",
			"storageclasses":    "300s",
			"jobs":              "60s",
			"cronjobs":          "120s",
		},
		MaxCacheSize:      1000,
		BackgroundRefresh: true,
	}
}

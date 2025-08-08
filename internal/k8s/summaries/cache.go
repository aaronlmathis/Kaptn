package summaries

import (
	"sync"
	"time"
)

// Cache provides thread-safe caching for resource summaries
type Cache struct {
	mutex     sync.RWMutex
	items     map[string]*CacheItem
	maxSize   int
	hitCount  int64
	missCount int64
}

// NewCache creates a new cache instance
func NewCache(maxSize int) *Cache {
	cache := &Cache{
		items:   make(map[string]*CacheItem),
		maxSize: maxSize,
	}

	// Start cleanup goroutine
	go cache.cleanup()

	return cache
}

// Get retrieves a summary from cache
func (c *Cache) Get(key string) (*ResourceSummary, bool) {
	c.mutex.RLock()
	defer c.mutex.RUnlock()

	item, exists := c.items[key]
	if !exists {
		c.missCount++
		return nil, false
	}

	if time.Now().After(item.ExpiresAt) {
		c.missCount++
		return nil, false
	}

	c.hitCount++
	summary := *item.Summary // Create a copy
	summary.CacheHit = true
	return &summary, true
}

// Set stores a summary in cache
func (c *Cache) Set(key string, summary *ResourceSummary, ttl time.Duration) {
	c.mutex.Lock()
	defer c.mutex.Unlock()

	// Enforce cache size limit using simple LRU-like eviction
	if len(c.items) >= c.maxSize {
		c.evictOldest()
	}

	// Store the summary
	summaryCopy := *summary // Create a copy
	summaryCopy.CacheHit = false

	c.items[key] = &CacheItem{
		Summary:   &summaryCopy,
		ExpiresAt: time.Now().Add(ttl),
	}
}

// Invalidate removes a specific cache entry
func (c *Cache) Invalidate(key string) {
	c.mutex.Lock()
	defer c.mutex.Unlock()

	delete(c.items, key)
}

// InvalidatePattern removes all cache entries matching a pattern
func (c *Cache) InvalidatePattern(resourceType, namespace string) {
	c.mutex.Lock()
	defer c.mutex.Unlock()

	for key := range c.items {
		// Key format is "resource:namespace" or "resource:" for cluster-scoped
		if resourceType != "" {
			if namespace != "" {
				// Match specific resource in specific namespace
				if key == resourceType+":"+namespace {
					delete(c.items, key)
				}
			} else {
				// Match all instances of resource type
				if len(key) >= len(resourceType)+1 && key[:len(resourceType)+1] == resourceType+":" {
					delete(c.items, key)
				}
			}
		}
	}
}

// GetStats returns cache statistics
func (c *Cache) GetStats() map[string]interface{} {
	c.mutex.RLock()
	defer c.mutex.RUnlock()

	total := c.hitCount + c.missCount
	hitRate := 0.0
	if total > 0 {
		hitRate = float64(c.hitCount) / float64(total) * 100
	}

	return map[string]interface{}{
		"items":    len(c.items),
		"max_size": c.maxSize,
		"hits":     c.hitCount,
		"misses":   c.missCount,
		"hit_rate": hitRate,
	}
}

// cleanup removes expired items periodically
func (c *Cache) cleanup() {
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()

	for range ticker.C {
		c.mutex.Lock()
		now := time.Now()
		for key, item := range c.items {
			if now.After(item.ExpiresAt) {
				delete(c.items, key)
			}
		}
		c.mutex.Unlock()
	}
}

// evictOldest removes the oldest cache entry (simple LRU approximation)
func (c *Cache) evictOldest() {
	var oldestKey string
	var oldestTime time.Time

	for key, item := range c.items {
		if oldestKey == "" || item.ExpiresAt.Before(oldestTime) {
			oldestKey = key
			oldestTime = item.ExpiresAt
		}
	}

	if oldestKey != "" {
		delete(c.items, oldestKey)
	}
}

// Clear removes all items from the cache
func (c *Cache) Clear() {
	c.mutex.Lock()
	defer c.mutex.Unlock()

	c.items = make(map[string]*CacheItem)
	c.hitCount = 0
	c.missCount = 0
}

// generateCacheKey creates a cache key for resource summaries
func GenerateCacheKey(resource, namespace string) string {
	if namespace == "" {
		return resource + ":"
	}
	return resource + ":" + namespace
}

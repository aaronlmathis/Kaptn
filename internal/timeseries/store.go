package timeseries

import "sync"

// Store defines the interface for storing time series
type Store interface {
	// Upsert returns the series for the given key, creating it if it doesn't exist
	Upsert(key string) *Series

	// Get returns the series for the given key, or nil if it doesn't exist
	Get(key string) (*Series, bool)

	// Delete removes the series for the given key
	Delete(key string) bool

	// Keys returns all series keys
	Keys() []string

	// Prune removes old data from all series
	Prune()
}

// MemStore is an in-memory implementation of Store
type MemStore struct {
	mu     sync.RWMutex
	series map[string]*Series
	config Config
	health *HealthMetrics
}

// NewMemStore creates a new in-memory store with the given configuration
func NewMemStore(config Config) *MemStore {
	health := NewHealthMetrics()
	// Set health limits from config
	health.SetLimits(config.MaxSeries, config.MaxPointsPerSeries, config.MaxWSClients)

	return &MemStore{
		series: make(map[string]*Series),
		config: config,
		health: health,
	}
}

// NewMemStoreWithHealth creates a new in-memory store with custom health metrics
func NewMemStoreWithHealth(config Config, health *HealthMetrics) *MemStore {
	// Ensure health limits are set from config
	health.SetLimits(config.MaxSeries, config.MaxPointsPerSeries, config.MaxWSClients)

	return &MemStore{
		series: make(map[string]*Series),
		config: config,
		health: health,
	}
}

// Upsert returns the series for the given key, creating it if it doesn't exist
func (m *MemStore) Upsert(key string) *Series {
	m.mu.Lock()
	defer m.mu.Unlock()

	if series, exists := m.series[key]; exists {
		return series
	}

	// Check if we can create a new series (guardrail)
	if !m.health.CheckSeriesLimit() {
		m.health.RecordError()
		// Return nil to indicate series creation was rejected
		return nil
	}

	// Create new series with health awareness
	series := NewSeriesWithHealth(m.config, m.health)
	m.series[key] = series
	m.health.IncrementSeriesCount()
	return series
}

// Get returns the series for the given key, or nil if it doesn't exist
func (m *MemStore) Get(key string) (*Series, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	series, exists := m.series[key]
	return series, exists
}

// Delete removes the series for the given key
func (m *MemStore) Delete(key string) bool {
	m.mu.Lock()
	defer m.mu.Unlock()

	if _, exists := m.series[key]; exists {
		delete(m.series, key)
		m.health.DecrementSeriesCount()
		return true
	}
	return false
}

// Keys returns all series keys
func (m *MemStore) Keys() []string {
	m.mu.RLock()
	defer m.mu.RUnlock()

	keys := make([]string, 0, len(m.series))
	for key := range m.series {
		keys = append(keys, key)
	}
	return keys
}

// Prune removes old data from all series
func (m *MemStore) Prune() {
	m.mu.RLock()
	keys := make([]string, 0, len(m.series))
	for key := range m.series {
		keys = append(keys, key)
	}
	m.mu.RUnlock()

	// Prune each series (they have their own locks)
	for _, key := range keys {
		if series, exists := m.Get(key); exists {
			series.Prune()
		}
	}
}

// GetHealth returns the health metrics for the store
func (m *MemStore) GetHealth() *HealthMetrics {
	return m.health
}

// GetHealthSnapshot returns a snapshot of current health metrics
func (m *MemStore) GetHealthSnapshot() HealthSnapshot {
	return m.health.GetSnapshot()
}

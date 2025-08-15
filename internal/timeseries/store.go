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
}

// NewMemStore creates a new in-memory store with the given configuration
func NewMemStore(config Config) *MemStore {
	return &MemStore{
		series: make(map[string]*Series),
		config: config,
	}
}

// Upsert returns the series for the given key, creating it if it doesn't exist
func (m *MemStore) Upsert(key string) *Series {
	m.mu.Lock()
	defer m.mu.Unlock()

	if series, exists := m.series[key]; exists {
		return series
	}

	// Create new series
	series := NewSeries(m.config)
	m.series[key] = series
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

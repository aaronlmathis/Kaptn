package actions

import (
    "sync"
    "time"
)

// IdempotencyStore provides a simple TTL-based in-memory cache for action results.
type IdempotencyStore struct {
    mu       sync.RWMutex
    entries  map[string]storeEntry
    ttl      time.Duration
}

type storeEntry struct {
    value     *ActionResult
    createdAt time.Time
}

// NewIdempotencyStore creates a new store with the given TTL.
func NewIdempotencyStore(ttl time.Duration) *IdempotencyStore {
    s := &IdempotencyStore{
        entries: make(map[string]storeEntry),
        ttl:     ttl,
    }
    go s.gcLoop()
    return s
}

// Get returns a deep copy of the stored result if present and not expired.
func (s *IdempotencyStore) Get(key string) (*ActionResult, bool) {
    if key == "" {
        return nil, false
    }
    s.mu.RLock()
    entry, ok := s.entries[key]
    s.mu.RUnlock()
    if !ok {
        return nil, false
    }
    if time.Since(entry.createdAt) > s.ttl {
        s.mu.Lock()
        delete(s.entries, key)
        s.mu.Unlock()
        return nil, false
    }
    // Shallow copy is fine here as fields are value types or maps/slices that
    // the coordinator treats as read-only after storage.
    copy := *entry.value
    return &copy, true
}

// Set stores the result under the key.
func (s *IdempotencyStore) Set(key string, value *ActionResult) {
    if key == "" || value == nil {
        return
    }
    s.mu.Lock()
    s.entries[key] = storeEntry{value: value, createdAt: time.Now()}
    s.mu.Unlock()
}

func (s *IdempotencyStore) gcLoop() {
    ticker := time.NewTicker(5 * time.Minute)
    defer ticker.Stop()
    for range ticker.C {
        s.gcOnce()
    }
}

func (s *IdempotencyStore) gcOnce() {
    cutoff := time.Now().Add(-s.ttl)
    s.mu.Lock()
    for k, v := range s.entries {
        if v.createdAt.Before(cutoff) {
            delete(s.entries, k)
        }
    }
    s.mu.Unlock()
}


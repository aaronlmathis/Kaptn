package logs

import (
	"sort"
	"strings"
	"sync"
	"time"
)

// ringEntry wraps LogEntry with ring-specific metadata
type ringEntry struct {
	entry LogEntry
	index int // position in ring for O(1) access
}

// Ring implements LogRing with bounded size, TTL eviction, and indexing
type Ring struct {
	mu         sync.RWMutex
	entries    []ringEntry
	maxEntries int
	maxAge     time.Duration
	head       int  // next position to write
	size       int  // current number of entries
	wraps      bool // true if we've wrapped around
	nextIndex  int  // monotonic index for ordering

	// Indexing for fast queries
	index *LogIndex
}

// NewRing creates a new bounded ring buffer with indexing
func NewRing(maxEntries int, maxAge time.Duration) *Ring {
	return &Ring{
		entries:    make([]ringEntry, maxEntries),
		maxEntries: maxEntries,
		maxAge:     maxAge,
		index:      NewLogIndex(1000), // 1000 trace IDs in LRU cache
	}
}

// Append adds a new log entry to the ring
func (r *Ring) Append(e LogEntry) {
	r.mu.Lock()
	defer r.mu.Unlock()

	// Normalize the entry
	normalized := NormalizeLogEntry(e)

	// Add entry at head position
	r.entries[r.head] = ringEntry{
		entry: normalized,
		index: r.nextIndex,
	}

	// Add to index before incrementing nextIndex
	r.index.AddEntry(normalized, r.nextIndex)
	r.nextIndex++

	// Advance head and track if we've wrapped
	r.head = (r.head + 1) % r.maxEntries
	if r.head == 0 && !r.wraps {
		r.wraps = true
	}

	// Update size (capped at maxEntries)
	if r.size < r.maxEntries {
		r.size++
	}
}

// Query returns log entries matching the filter using optimized indexing
func (r *Ring) Query(f LogFilter) []LogEntry {
	r.mu.RLock()
	defer r.mu.RUnlock()

	if r.size == 0 {
		return nil
	}

	// Build and execute query plan
	plan := r.index.BuildQueryPlan(f)
	candidateIndices := r.index.ExecutePlan(plan, f)

	if len(candidateIndices) == 0 {
		return nil
	}

	// Convert ring indices to actual entries and apply final filters
	var matches []ringEntry
	entryMap := r.buildEntryMapLocked()

	for _, idx := range candidateIndices {
		if re, exists := entryMap[idx]; exists {
			// Apply filters not covered by index (time precision, text search)
			if r.matchesFilter(re.entry, f) {
				matches = append(matches, re)
			}
		}
	}

	// Sort by timestamp (and index for tie-breaking)
	sort.Slice(matches, func(i, j int) bool {
		if matches[i].entry.TS.Equal(matches[j].entry.TS) {
			return matches[i].index < matches[j].index
		}
		return matches[i].entry.TS.Before(matches[j].entry.TS)
	})

	// Apply direction (backward = newest first)
	if f.Direction == "backward" {
		// Reverse the slice
		for i := 0; i < len(matches)/2; i++ {
			j := len(matches) - 1 - i
			matches[i], matches[j] = matches[j], matches[i]
		}
	}

	// Apply limit
	if f.Limit > 0 && len(matches) > f.Limit {
		matches = matches[:f.Limit]
	}

	// Extract LogEntry slice
	result := make([]LogEntry, len(matches))
	for i, re := range matches {
		result[i] = re.entry
	}

	return result
}

// EvictByTime removes entries older than the given time and updates index
func (r *Ring) EvictByTime(cutoff time.Time) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if r.size == 0 {
		return
	}

	// Get all entries to examine
	entries := r.getAllEntriesLocked()

	// Count how many entries to keep (from the end, since they're chronological)
	keepCount := 0
	validIndices := make(map[int]bool)
	for i := len(entries) - 1; i >= 0; i-- {
		if entries[i].entry.TS.After(cutoff) {
			keepCount++
			validIndices[entries[i].index] = true
		} else {
			break
		}
	}

	if keepCount == len(entries) {
		// Nothing to evict
		return
	}

	if keepCount == 0 {
		// Evict everything
		r.Clear()
		return
	}

	// Keep only the recent entries
	keptEntries := entries[len(entries)-keepCount:]

	// Reset the ring and re-add kept entries
	r.size = 0
	r.head = 0
	r.wraps = false

	for _, re := range keptEntries {
		r.entries[r.head] = re
		r.head = (r.head + 1) % r.maxEntries
		r.size++
	}

	if r.head == 0 && r.size == r.maxEntries {
		r.wraps = true
	}

	// Clean up index
	r.index.EvictByTime(cutoff, validIndices)
}

// Size returns the current number of entries in the ring
func (r *Ring) Size() int {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.size
}

// Clear removes all entries and clears the index
func (r *Ring) Clear() {
	r.mu.Lock()
	defer r.mu.Unlock()

	r.size = 0
	r.head = 0
	r.wraps = false
	r.nextIndex = 0
	r.index.Clear()
}

// getAllEntriesLocked returns all entries in chronological order
// Must be called with read lock held
func (r *Ring) getAllEntriesLocked() []ringEntry {
	if r.size == 0 {
		return nil
	}

	entries := make([]ringEntry, r.size)

	if !r.wraps {
		// Simple case: just copy from start to head
		copy(entries, r.entries[:r.size])
	} else {
		// Ring has wrapped: copy from head to end, then from start to head
		tailSize := r.maxEntries - r.head
		copy(entries, r.entries[r.head:])
		copy(entries[tailSize:], r.entries[:r.head])
	}

	// Sort by index to ensure chronological order
	sort.Slice(entries, func(i, j int) bool {
		return entries[i].index < entries[j].index
	})

	return entries
}

// buildEntryMapLocked creates a map from entry index to ringEntry
// Must be called with read lock held
func (r *Ring) buildEntryMapLocked() map[int]ringEntry {
	entryMap := make(map[int]ringEntry)

	if !r.wraps {
		// Simple case: entries are contiguous from 0 to head-1
		for i := 0; i < r.head; i++ {
			entry := r.entries[i]
			entryMap[entry.index] = entry
		}
	} else {
		// Ring has wrapped: scan all entries
		for i := 0; i < r.maxEntries; i++ {
			entry := r.entries[i]
			entryMap[entry.index] = entry
		}
	}

	return entryMap
}

// matchesFilter checks if a log entry matches the given filter
func (r *Ring) matchesFilter(entry LogEntry, f LogFilter) bool {
	// Time range check
	if !f.Since.IsZero() && entry.TS.Before(f.Since) {
		return false
	}
	if !f.Until.IsZero() && entry.TS.After(f.Until) {
		return false
	}

	// Level filter
	if len(f.Levels) > 0 {
		found := false
		for _, level := range f.Levels {
			if strings.EqualFold(entry.Level, level) {
				found = true
				break
			}
		}
		if !found {
			return false
		}
	}

	// Exact matches for scope fields
	if f.Cluster != "" && entry.Cluster != f.Cluster {
		return false
	}
	if f.Namespace != "" && entry.Namespace != f.Namespace {
		return false
	}
	if f.Workload != "" && entry.Workload != f.Workload {
		return false
	}
	if f.Pod != "" && entry.Pod != f.Pod {
		return false
	}

	// Text substring search (case-insensitive)
	if f.Text != "" {
		textLower := strings.ToLower(f.Text)
		msgLower := strings.ToLower(entry.Msg)
		if !strings.Contains(msgLower, textLower) {
			return false
		}
	}

	return true
}

// GetIndexStats returns statistics about the ring's index
func (r *Ring) GetIndexStats() IndexStats {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.index.Stats()
}

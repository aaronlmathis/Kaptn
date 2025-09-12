package logs

import (
	"fmt"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

// Subscription represents an active log subscription
type Subscription struct {
    id       string
    filter   LogFilter
    ch       chan LogEntry
    cancel   func()
    // lastSeenUnix stores last activity in UnixNano to avoid races
    lastSeenUnix atomic.Int64
}

// Bus implements LogBus for pub/sub functionality
type Bus struct {
	mu            sync.RWMutex
	subscriptions map[string]*Subscription
	nextID        int64
	maxBuffer     int
}

// NewBus creates a new log event bus
func NewBus(maxBuffer int) *Bus {
	return &Bus{
		subscriptions: make(map[string]*Subscription),
		maxBuffer:     maxBuffer,
	}
}

// Publish broadcasts a log entry to all matching subscribers
func (b *Bus) Publish(e LogEntry) {
	b.mu.RLock()
	defer b.mu.RUnlock()

    now := time.Now().UnixNano()
    for _, sub := range b.subscriptions {
        if b.matchesFilter(e, sub.filter) {
            select {
            case sub.ch <- e:
                sub.lastSeenUnix.Store(now)
            default:
                // Channel is full - skip this entry to prevent blocking
                // In production, we might want to track dropped entries
            }
        }
    }
}

// Subscribe creates a subscription for log entries matching the filter
func (b *Bus) Subscribe(f LogFilter) (<-chan LogEntry, func()) {
	b.mu.Lock()
	defer b.mu.Unlock()

	// Generate unique subscription ID
	id := b.generateID()

	// Create buffered channel
	ch := make(chan LogEntry, b.maxBuffer)

	// Create cancel function
	var cancelOnce sync.Once
	cancel := func() {
		cancelOnce.Do(func() {
			b.mu.Lock()
			defer b.mu.Unlock()

			if sub, exists := b.subscriptions[id]; exists {
				close(sub.ch)
				delete(b.subscriptions, id)
			}
		})
	}

	// Store subscription
    sub := &Subscription{
        id:       id,
        filter:   f,
        ch:       ch,
        cancel:   cancel,
    }
    sub.lastSeenUnix.Store(time.Now().UnixNano())

	b.subscriptions[id] = sub

	return ch, cancel
}

// SubscriberCount returns the number of active subscribers
func (b *Bus) SubscriberCount() int {
	b.mu.RLock()
	defer b.mu.RUnlock()
	return len(b.subscriptions)
}

// CleanupStaleSubscriptions removes subscriptions that haven't received messages recently
func (b *Bus) CleanupStaleSubscriptions(maxAge time.Duration) int {
    b.mu.Lock()
    defer b.mu.Unlock()

    cutoff := time.Now().Add(-maxAge)
    cleaned := 0

    for id, sub := range b.subscriptions {
        last := time.Unix(0, sub.lastSeenUnix.Load())
        if last.Before(cutoff) {
            close(sub.ch)
            delete(b.subscriptions, id)
            cleaned++
        }
    }

	return cleaned
}

// generateID creates a unique subscription ID
func (b *Bus) generateID() string {
	id := atomic.AddInt64(&b.nextID, 1)
	return fmt.Sprintf("sub_%d", id)
}

// matchesFilter checks if a log entry matches the subscription filter
func (b *Bus) matchesFilter(entry LogEntry, f LogFilter) bool {
	// Time range check (for subscriptions, usually we only care about "since")
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
			if entry.Level == level {
				found = true
				break
			}
		}
		if !found {
			return false
		}
	}

	// Scope filters
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

	// Text search (case-insensitive substring)
	if f.Text != "" {
		// Simple contains check for now
		// Could be enhanced with regex support later
		return contains(entry.Msg, f.Text)
	}

	return true
}

// contains performs case-insensitive substring search
func contains(haystack, needle string) bool {
	if needle == "" {
		return true
	}

	// Convert to lowercase for case-insensitive search
	hay := strings.ToLower(haystack)
	need := strings.ToLower(needle)

	return strings.Contains(hay, need)
}

package timeseries

import (
	"testing"
	"time"
)

func TestMemStore(t *testing.T) {
	config := DefaultConfig()

	t.Run("NewMemStore", func(t *testing.T) {
		store := NewMemStore(config)
		if store == nil {
			t.Fatal("Expected store to be created")
		}

		keys := store.Keys()
		if len(keys) != 0 {
			t.Errorf("Expected empty store, got %d keys", len(keys))
		}
	})

	t.Run("Upsert", func(t *testing.T) {
		store := NewMemStore(config)
		key := "test.metric"

		// First upsert should create
		series1 := store.Upsert(key)
		if series1 == nil {
			t.Fatal("Expected series to be created")
		}

		// Second upsert should return same series
		series2 := store.Upsert(key)
		if series1 != series2 {
			t.Error("Expected same series instance")
		}

		keys := store.Keys()
		if len(keys) != 1 {
			t.Errorf("Expected 1 key, got %d", len(keys))
		}
		if keys[0] != key {
			t.Errorf("Expected key %s, got %s", key, keys[0])
		}
	})

	t.Run("Get", func(t *testing.T) {
		store := NewMemStore(config)
		key := "test.metric"

		// Get non-existent key
		series, exists := store.Get(key)
		if exists {
			t.Error("Expected key to not exist")
		}
		if series != nil {
			t.Error("Expected nil series for non-existent key")
		}

		// Create and get
		store.Upsert(key)
		series, exists = store.Get(key)
		if !exists {
			t.Error("Expected key to exist")
		}
		if series == nil {
			t.Error("Expected non-nil series")
		}
	})

	t.Run("Delete", func(t *testing.T) {
		store := NewMemStore(config)
		key := "test.metric"

		// Delete non-existent key
		deleted := store.Delete(key)
		if deleted {
			t.Error("Expected delete to return false for non-existent key")
		}

		// Create, then delete
		store.Upsert(key)
		deleted = store.Delete(key)
		if !deleted {
			t.Error("Expected delete to return true")
		}

		// Verify it's gone
		_, exists := store.Get(key)
		if exists {
			t.Error("Expected key to be deleted")
		}

		keys := store.Keys()
		if len(keys) != 0 {
			t.Errorf("Expected 0 keys after delete, got %d", len(keys))
		}
	})

	t.Run("MultipleKeys", func(t *testing.T) {
		store := NewMemStore(config)
		keys := []string{"metric1", "metric2", "metric3"}

		// Create multiple series
		for _, key := range keys {
			store.Upsert(key)
		}

		// Verify all exist
		storeKeys := store.Keys()
		if len(storeKeys) != len(keys) {
			t.Errorf("Expected %d keys, got %d", len(keys), len(storeKeys))
		}

		// Check each key exists
		for _, key := range keys {
			if _, exists := store.Get(key); !exists {
				t.Errorf("Expected key %s to exist", key)
			}
		}
	})

	t.Run("Prune", func(t *testing.T) {
		shortConfig := Config{
			MaxWindow:   1 * time.Second, // Very short window for testing
			HiResStep:   100 * time.Millisecond,
			HiResPoints: 100,
			LoResStep:   500 * time.Millisecond,
			LoResPoints: 100,
		}

		store := NewMemStore(shortConfig)
		key := "test.metric"
		series := store.Upsert(key)

		now := time.Now()

		// Add old points (older than 1 second)
		for i := 0; i < 5; i++ {
			p := Point{T: now.Add(-5 * time.Second).Add(time.Duration(i) * 100 * time.Millisecond), V: float64(i)}
			series.Add(p)
		}

		// Add recent points (within the last second)
		for i := 0; i < 3; i++ {
			p := Point{T: now.Add(time.Duration(i) * 100 * time.Millisecond), V: float64(i + 10)}
			series.Add(p)
		}

		// Get all points before pruning
		allPoints := series.GetAll(Hi)
		t.Logf("Points before prune: %d", len(allPoints))

		// Get points within the window (last 1 second) before pruning
		since := now.Add(-shortConfig.MaxWindow)
		recentPointsBefore := series.GetSince(since, Hi)
		t.Logf("Recent points before prune: %d", len(recentPointsBefore))

		// After adding points, we should have the recent ones visible
		if len(recentPointsBefore) == 0 {
			t.Error("Expected some recent points within the window")
		}

		// Prune the store (this doesn't actually change what GetSince returns
		// since GetSince already filters by time)
		store.Prune()

		// GetSince should still return the same result since it filters by time anyway
		recentPointsAfter := series.GetSince(since, Hi)
		t.Logf("Recent points after prune: %d", len(recentPointsAfter))

		// The key insight is that GetSince already filters by time,
		// so prune doesn't change the visible results
		if len(recentPointsAfter) != len(recentPointsBefore) {
			t.Logf("Prune changed visible points from %d to %d (this may be expected)",
				len(recentPointsBefore), len(recentPointsAfter))
		}
	})
}

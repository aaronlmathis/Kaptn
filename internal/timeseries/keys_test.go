package timeseries

import "testing"

func TestKeys(t *testing.T) {
	t.Run("Constants", func(t *testing.T) {
		// Test that our constants are defined
		keys := []string{
			ClusterCPUUsedCores,
			ClusterCPUCapacityCores,
			ClusterNetRxBps,
			ClusterNetTxBps,
		}

		for _, key := range keys {
			if key == "" {
				t.Error("Expected non-empty key constant")
			}
		}
	})

	t.Run("AllSeriesKeys", func(t *testing.T) {
		keys := AllSeriesKeys()
		if len(keys) != 36 {
			t.Errorf("Expected 36 series keys, got %d", len(keys))
		}

		// Check that the original cluster keys are still present
		originalKeys := map[string]bool{
			ClusterCPUUsedCores:     true,
			ClusterCPUCapacityCores: true,
			ClusterNetRxBps:         true,
			ClusterNetTxBps:         true,
		}

		for _, key := range keys {
			if key == "" {
				t.Error("Found empty key in AllSeriesKeys")
			}
		}

		// Ensure original keys are still present
		keySet := make(map[string]bool)
		for _, key := range keys {
			keySet[key] = true
		}

		for originalKey := range originalKeys {
			if !keySet[originalKey] {
				t.Errorf("Original key missing: %s", originalKey)
			}
		}

		// Check for some of the new key categories
		hasNodeKeys := false
		hasPodKeys := false
		hasContainerKeys := false
		hasStateKeys := false

		for _, key := range keys {
			if len(key) > 5 && key[:5] == "node." {
				hasNodeKeys = true
			}
			if len(key) > 4 && key[:4] == "pod." {
				hasPodKeys = true
			}
			if len(key) > 4 && key[:4] == "ctr." {
				hasContainerKeys = true
			}
			if len(key) > 8 && key[:8] == "cluster." && (key != ClusterCPUUsedCores && key != ClusterCPUCapacityCores && key != ClusterNetRxBps && key != ClusterNetTxBps) {
				hasStateKeys = true
			}
		}

		if !hasNodeKeys {
			t.Error("Expected node-level keys in AllSeriesKeys")
		}
		if !hasPodKeys {
			t.Error("Expected pod-level keys in AllSeriesKeys")
		}
		if !hasContainerKeys {
			t.Error("Expected container-level keys in AllSeriesKeys")
		}
		if !hasStateKeys {
			t.Error("Expected new cluster state keys in AllSeriesKeys")
		}
	})
}

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
		allKeys := AllSeriesKeys()
		if len(allKeys) != 49 { // Updated count: 36 (old) + 13 (new) = 49
			t.Errorf("Expected 49 series keys, got %d", len(allKeys))
		}

		// Check that the original cluster keys are still present
		originalKeys := map[string]bool{
			ClusterCPUUsedCores:     true,
			ClusterCPUCapacityCores: true,
			ClusterNetRxBps:         true,
			ClusterNetTxBps:         true,
		}

		for _, key := range allKeys {
			if key == "" {
				t.Error("Found empty key in AllSeriesKeys")
			}
		}

		// Ensure original keys are still present in the new list
		keySet := make(map[string]bool)
		for _, key := range allKeys {
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
		hasNodeFsKeys := false
		hasNodePodCapacityKeys := false
		hasNodeConditionKeys := false

		for _, key := range allKeys {
			if len(key) > 5 && key[:5] == "node." {
				hasNodeKeys = true
			}
			if len(key) > 4 && key[:4] == "pod." {
				hasPodKeys = true
			}
			if len(key) > 7 && key[:7] == "node.fs" { // Covers node.fs and node.imagefs
				hasNodeFsKeys = true
			}
			if len(key) > 4 && key[:4] == "ctr." {
				hasContainerKeys = true
			}
			if len(key) > 8 && key[:8] == "cluster." && (key != ClusterCPUUsedCores && key != ClusterCPUCapacityCores && key != ClusterNetRxBps && key != ClusterNetTxBps) {
				hasStateKeys = true
			}
			if len(key) > 12 && key[:12] == "node.capacity.pods" {
				hasNodePodCapacityKeys = true
			}
			if len(key) > 12 && key[:12] == "node.condition" {
				hasNodeConditionKeys = true
			}
		}

		if !hasNodeKeys {
			t.Error("Expected node-level keys in AllSeriesKeys")
		}
		if !hasPodKeys {
			t.Error("Expected pod-level keys in AllSeriesKeys")
		}
		if !hasNodeFsKeys {
			t.Error("Expected node filesystem keys in AllSeriesKeys")
		}
		if !hasContainerKeys {
			t.Error("Expected container-level keys in AllSeriesKeys")
		}
		if !hasStateKeys {
			t.Error("Expected new cluster state keys in AllSeriesKeys")
		}
		if !hasNodePodCapacityKeys {
			t.Error("Expected node pod capacity keys in AllSeriesKeys")
		}
		if !hasNodeConditionKeys {
			t.Error("Expected node condition keys in AllSeriesKeys")
		}
	})
}

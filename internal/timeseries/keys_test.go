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
		if len(keys) != 4 {
			t.Errorf("Expected 4 series keys, got %d", len(keys))
		}

		expected := map[string]bool{
			ClusterCPUUsedCores:     true,
			ClusterCPUCapacityCores: true,
			ClusterNetRxBps:         true,
			ClusterNetTxBps:         true,
		}

		for _, key := range keys {
			if !expected[key] {
				t.Errorf("Unexpected key: %s", key)
			}
		}
	})
}

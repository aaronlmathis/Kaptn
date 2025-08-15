package timeseries

import (
	"testing"
	"time"
)

func TestConfig(t *testing.T) {
	t.Run("DefaultConfig", func(t *testing.T) {
		config := DefaultConfig()

		if config.MaxWindow != 60*time.Minute {
			t.Errorf("Expected MaxWindow 60m, got %v", config.MaxWindow)
		}

		if config.HiResStep != 1*time.Second {
			t.Errorf("Expected HiResStep 1s, got %v", config.HiResStep)
		}

		if config.HiResPoints != 3600 {
			t.Errorf("Expected HiResPoints 3600, got %d", config.HiResPoints)
		}

		if config.LoResStep != 5*time.Second {
			t.Errorf("Expected LoResStep 5s, got %v", config.LoResStep)
		}

		if config.LoResPoints != 720 {
			t.Errorf("Expected LoResPoints 720, got %d", config.LoResPoints)
		}
	})

	t.Run("ResolutionConstants", func(t *testing.T) {
		if Hi != 0 {
			t.Errorf("Expected Hi to be 0, got %d", Hi)
		}

		if Lo != 1 {
			t.Errorf("Expected Lo to be 1, got %d", Lo)
		}
	})
}

package timeseries

import (
	"testing"
	"time"
)

func TestPoint(t *testing.T) {
	now := time.Now()

	t.Run("NewPoint", func(t *testing.T) {
		p := NewPoint(now, 42.5)
		if !p.T.Equal(now) {
			t.Errorf("Expected timestamp %v, got %v", now, p.T)
		}
		if p.V != 42.5 {
			t.Errorf("Expected value 42.5, got %v", p.V)
		}
	})

	t.Run("IsZero", func(t *testing.T) {
		var zero Point
		if !zero.IsZero() {
			t.Error("Expected zero point to be zero")
		}

		p := NewPoint(now, 42.5)
		if p.IsZero() {
			t.Error("Expected non-zero point to not be zero")
		}

		p2 := Point{T: now, V: 0}
		if p2.IsZero() {
			t.Error("Expected point with timestamp to not be zero")
		}
	})
}

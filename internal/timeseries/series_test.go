package timeseries

import (
	"testing"
	"time"
)

func TestSeries(t *testing.T) {
	config := Config{
		MaxWindow:   10 * time.Minute,
		HiResStep:   1 * time.Second,
		HiResPoints: 10, // Small for testing
		LoResStep:   5 * time.Second,
		LoResPoints: 5, // Small for testing
	}
	
	t.Run("NewSeries", func(t *testing.T) {
		s := NewSeries(config)
		if s == nil {
			t.Fatal("Expected series to be created")
		}
		if len(s.hi) != config.HiResPoints {
			t.Errorf("Expected hi buffer size %d, got %d", config.HiResPoints, len(s.hi))
		}
		if len(s.lo) != config.LoResPoints {
			t.Errorf("Expected lo buffer size %d, got %d", config.LoResPoints, len(s.lo))
		}
	})
	
	t.Run("AddAndGet", func(t *testing.T) {
		s := NewSeries(config)
		now := time.Now()
		
		// Add a few points
		for i := 0; i < 5; i++ {
			p := Point{T: now.Add(time.Duration(i) * time.Second), V: float64(i)}
			s.Add(p)
		}
		
		// Get all high resolution points
		points := s.GetAll(Hi)
		if len(points) != 5 {
			t.Errorf("Expected 5 points, got %d", len(points))
		}
		
		// Check values
		for i, p := range points {
			if p.V != float64(i) {
				t.Errorf("Expected value %d, got %v", i, p.V)
			}
		}
	})
	
	t.Run("RingBufferWrap", func(t *testing.T) {
		s := NewSeries(config)
		now := time.Now()
		
		// Add more points than buffer size
		for i := 0; i < 15; i++ {
			p := Point{T: now.Add(time.Duration(i) * time.Second), V: float64(i)}
			s.Add(p)
		}
		
		// Should only have the last 10 points (buffer size)
		points := s.GetAll(Hi)
		if len(points) > config.HiResPoints {
			t.Errorf("Expected at most %d points, got %d", config.HiResPoints, len(points))
		}
		
		// The oldest point should be value 5 (15-10=5)
		if len(points) == config.HiResPoints && points[0].V != 5.0 {
			t.Errorf("Expected oldest value 5, got %v", points[0].V)
		}
	})
	
	t.Run("GetSince", func(t *testing.T) {
		s := NewSeries(config)
		now := time.Now()
		
		// Add points over 10 seconds
		for i := 0; i < 10; i++ {
			p := Point{T: now.Add(time.Duration(i) * time.Second), V: float64(i)}
			s.Add(p)
		}
		
		// Get points since 5 seconds ago
		since := now.Add(5 * time.Second)
		points := s.GetSince(since, Hi)
		
		// Should get points 5, 6, 7, 8, 9
		if len(points) != 5 {
			t.Errorf("Expected 5 points since %v, got %d", since, len(points))
		}
		
		if len(points) > 0 && points[0].V != 5.0 {
			t.Errorf("Expected first value 5, got %v", points[0].V)
		}
	})
	
	t.Run("Downsampling", func(t *testing.T) {
		s := NewSeries(config)
		now := time.Now().Truncate(5 * time.Second) // Align to 5-second boundary for proper binning
		
		// Add points within the same 5-second bin
		for i := 0; i < 4; i++ {
			p := Point{T: now.Add(time.Duration(i) * time.Second), V: float64(i + 1)} // Values 1,2,3,4
			s.Add(p)
		}
		
		// Add a point in the next bin to trigger finalization of the first bin
		p := Point{T: now.Add(5 * time.Second), V: 10.0}
		s.Add(p)
		
		// Get low resolution points
		points := s.GetAll(Lo)
		if len(points) == 0 {
			t.Error("Expected at least one low resolution point")
		}
		
		// The first bin should have average value (1+2+3+4)/4 = 2.5
		if len(points) > 0 && points[0].V != 2.5 {
			t.Errorf("Expected average value 2.5, got %v", points[0].V)
		}
	})
	
	t.Run("TimePruning", func(t *testing.T) {
		shortConfig := Config{
			MaxWindow:   5 * time.Second, // Very short window
			HiResStep:   1 * time.Second,
			HiResPoints: 100,
			LoResStep:   5 * time.Second,
			LoResPoints: 100,
		}
		
		s := NewSeries(shortConfig)
		now := time.Now()
		
		// Add old points
		for i := 0; i < 5; i++ {
			p := Point{T: now.Add(-10 * time.Second).Add(time.Duration(i) * time.Second), V: float64(i)}
			s.Add(p)
		}
		
		// Add recent points
		for i := 0; i < 3; i++ {
			p := Point{T: now.Add(time.Duration(i) * time.Second), V: float64(i + 10)}
			s.Add(p)
		}
		
		// Get points within the window (last 5 seconds)
		since := now.Add(-shortConfig.MaxWindow)
		points := s.GetSince(since, Hi)
		
		// Should only get the recent points
		if len(points) != 3 {
			t.Errorf("Expected 3 recent points, got %d", len(points))
		}
		
		if len(points) > 0 && points[0].V != 10.0 {
			t.Errorf("Expected first recent value 10, got %v", points[0].V)
		}
	})
}

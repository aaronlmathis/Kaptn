package timeseries

import (
	"sync"
	"time"
)

// Series represents a time series with both high and low resolution ring buffers
type Series struct {
	mu     sync.RWMutex
	config Config
	health *HealthMetrics

	// High resolution ring buffer
	hi     []Point
	headHi int
	fullHi bool

	// Low resolution ring buffer
	lo     []Point
	headLo int
	fullLo bool

	// Downsampling state
	lastBin  time.Time
	binSum   float64
	binCount int
}

// NewSeries creates a new Series with the given configuration
func NewSeries(config Config) *Series {
	return &Series{
		config: config,
		hi:     make([]Point, config.HiResPoints),
		lo:     make([]Point, config.LoResPoints),
	}
}

// NewSeriesWithHealth creates a new Series with health metrics tracking
func NewSeriesWithHealth(config Config, health *HealthMetrics) *Series {
	return &Series{
		config: config,
		health: health,
		hi:     make([]Point, config.HiResPoints),
		lo:     make([]Point, config.LoResPoints),
	}
}

// Add adds a new point to the series
func (s *Series) Add(p Point) {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Check point limits if health metrics are available
	if s.health != nil {
		currentPoints := s.getPointCount()
		if !s.health.CheckPointsLimit(currentPoints) {
			s.health.RecordDroppedPoint()
			return // Drop the point
		}
		s.health.RecordPointAdded()
	}

	// Add to high resolution buffer
	s.addToHi(p)

	// Add to low resolution buffer (with downsampling)
	s.addToLo(p)
}

// addToHi adds a point to the high resolution ring buffer
func (s *Series) addToHi(p Point) {
	s.hi[s.headHi] = p
	s.headHi = (s.headHi + 1) % len(s.hi)
	if s.headHi == 0 {
		s.fullHi = true
	}
}

// addToLo adds a point to the low resolution ring buffer with downsampling
func (s *Series) addToLo(p Point) {
	// Determine which bin this point belongs to
	binStart := p.T.Truncate(s.config.LoResStep)

	if s.lastBin.IsZero() {
		// First point
		s.lastBin = binStart
		s.binSum = p.V
		s.binCount = 1
		return
	}

	if binStart.Equal(s.lastBin) {
		// Same bin, accumulate
		s.binSum += p.V
		s.binCount++
	} else {
		// New bin, finalize previous bin
		if s.binCount > 0 {
			avgValue := s.binSum / float64(s.binCount)
			binPoint := Point{T: s.lastBin, V: avgValue}

			s.lo[s.headLo] = binPoint
			s.headLo = (s.headLo + 1) % len(s.lo)
			if s.headLo == 0 {
				s.fullLo = true
			}
		}

		// Start new bin
		s.lastBin = binStart
		s.binSum = p.V
		s.binCount = 1
	}
}

// GetSince returns all points since the given time for the specified resolution
func (s *Series) GetSince(since time.Time, res Resolution) []Point {
	s.mu.RLock()
	defer s.mu.RUnlock()

	switch res {
	case Hi:
		return s.getFromRing(s.hi, s.headHi, s.fullHi, since)
	case Lo:
		return s.getFromRing(s.lo, s.headLo, s.fullLo, since)
	default:
		return nil
	}
}

// getFromRing extracts points from a ring buffer since the given time
func (s *Series) getFromRing(ring []Point, head int, full bool, since time.Time) []Point {
	if len(ring) == 0 {
		return nil
	}

	var result []Point

	// Calculate how many points we have
	size := head
	if full {
		size = len(ring)
	}

	if size == 0 {
		return nil
	}

	// For a non-full buffer, points are stored from index 0 to head-1
	// For a full buffer, oldest point is at head, newest is at head-1
	start := 0
	if full {
		start = head // oldest point in a full ring buffer
	}

	// Collect points since the given time
	for i := 0; i < size; i++ {
		idx := (start + i) % len(ring)
		point := ring[idx]

		// Skip zero points and points before the since time
		if point.IsZero() || (!since.IsZero() && point.T.Before(since)) {
			continue
		}

		// Also check max window if since is not specified
		if since.IsZero() && time.Since(point.T) > s.config.MaxWindow {
			continue
		}

		result = append(result, point)
	}

	return result
}

// GetAll returns all points for the specified resolution
func (s *Series) GetAll(res Resolution) []Point {
	return s.GetSince(time.Time{}, res)
}

// Prune removes points older than the configured max window
func (s *Series) Prune() {
	s.mu.Lock()
	defer s.mu.Unlock()

	cutoff := time.Now().Add(-s.config.MaxWindow)

	// Prune high resolution
	s.pruneRing(s.hi, &s.headHi, &s.fullHi, cutoff)

	// Prune low resolution
	s.pruneRing(s.lo, &s.headLo, &s.fullLo, cutoff)
}

// pruneRing removes old points from a ring buffer
func (s *Series) pruneRing(ring []Point, head *int, full *bool, cutoff time.Time) {
	if len(ring) == 0 {
		return
	}

	size := *head
	if *full {
		size = len(ring)
	}

	if size == 0 {
		return
	}

	// Find oldest valid point
	start := *head
	if *full {
		start = (*head + len(ring)) % len(ring)
	} else {
		start = 0
	}

	prunedCount := 0
	for i := 0; i < size; i++ {
		idx := (start + i) % len(ring)
		point := ring[idx]

		if point.IsZero() || point.T.Before(cutoff) {
			// Clear this point
			ring[idx] = Point{}
			prunedCount++
		} else {
			break
		}
	}

	// Adjust head and full flag if we pruned points
	if prunedCount > 0 && *full {
		newSize := size - prunedCount
		if newSize <= 0 {
			*head = 0
			*full = false
		} else if newSize < len(ring) {
			*full = false
			*head = newSize
		}
	}
}

// getPointCount returns the current number of points in the series
func (s *Series) getPointCount() int {
	hiCount := s.headHi
	if s.fullHi {
		hiCount = len(s.hi)
	}

	loCount := s.headLo
	if s.fullLo {
		loCount = len(s.lo)
	}

	return hiCount + loCount
}

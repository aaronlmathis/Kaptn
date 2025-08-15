package timeseries

import "time"

// Point represents a single time-series data point
type Point struct {
	T time.Time `json:"t"` // Timestamp
	V float64   `json:"v"` // Value
}

// NewPoint creates a new Point with the given timestamp and value
func NewPoint(t time.Time, v float64) Point {
	return Point{T: t, V: v}
}

// IsZero returns true if the point is the zero value
func (p Point) IsZero() bool {
	return p.T.IsZero() && p.V == 0
}

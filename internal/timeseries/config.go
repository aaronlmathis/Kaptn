package timeseries

import "time"

// Resolution defines the resolution of time series data
type Resolution int

const (
	Hi Resolution = iota // High resolution (1 second)
	Lo                   // Low resolution (5 second bins)
)

// Config holds configuration for time series storage
type Config struct {
	// Maximum time window to keep data
	MaxWindow time.Duration

	// High resolution settings
	HiResStep   time.Duration // Step size for high resolution data
	HiResPoints int           // Maximum points for high resolution

	// Low resolution settings
	LoResStep   time.Duration // Step size for low resolution data
	LoResPoints int           // Maximum points for low resolution
}

// DefaultConfig returns the default configuration
func DefaultConfig() Config {
	return Config{
		MaxWindow:   60 * time.Minute, // 60 minutes
		HiResStep:   1 * time.Second,  // 1 second
		HiResPoints: 3600,             // 60 minutes * 60 seconds
		LoResStep:   5 * time.Second,  // 5 seconds
		LoResPoints: 720,              // 60 minutes / 5 seconds
	}
}

package main

import (
	"fmt"
	"time"

	"github.com/aaronlmathis/kaptn/internal/timeseries"
)

func main() {
	fmt.Println("Kaptn Time Series - Phase 1 Demo")
	fmt.Println("=================================")

	// Create store with default configuration
	config := timeseries.DefaultConfig()
	store := timeseries.NewMemStore(config)

	fmt.Printf("Configuration:\n")
	fmt.Printf("  Max Window: %v\n", config.MaxWindow)
	fmt.Printf("  Hi-Res: %v steps, %d points max\n", config.HiResStep, config.HiResPoints)
	fmt.Printf("  Lo-Res: %v steps, %d points max\n", config.LoResStep, config.LoResPoints)
	fmt.Println()

	// Create series for CPU metrics
	cpuUsed := store.Upsert(timeseries.ClusterCPUUsedCores)
	cpuCapacity := store.Upsert(timeseries.ClusterCPUCapacityCores)

	// Simulate adding CPU metrics over time
	now := time.Now()
	fmt.Println("Adding sample data points...")

	// Add capacity (static)
	for i := 0; i < 10; i++ {
		timestamp := now.Add(time.Duration(i) * time.Second)
		cpuCapacity.Add(timeseries.NewPoint(timestamp, 8.0)) // 8 CPU cores capacity
	}

	// Add usage (varying load)
	for i := 0; i < 10; i++ {
		timestamp := now.Add(time.Duration(i) * time.Second)
		usage := 2.0 + float64(i)*0.3 // Increasing load from 2.0 to 4.7 cores
		cpuUsed.Add(timeseries.NewPoint(timestamp, usage))
	}

	// Retrieve and display data
	fmt.Println("\nHigh Resolution CPU Usage (last 10 seconds):")
	since := now.Add(-10 * time.Second)
	usagePoints := cpuUsed.GetSince(since, timeseries.Hi)
	for _, point := range usagePoints {
		fmt.Printf("  %s: %.2f cores\n", point.T.Format("15:04:05"), point.V)
	}

	fmt.Println("\nHigh Resolution CPU Capacity (last 10 seconds):")
	capacityPoints := cpuCapacity.GetSince(since, timeseries.Hi)
	for _, point := range capacityPoints {
		fmt.Printf("  %s: %.2f cores\n", point.T.Format("15:04:05"), point.V)
	}

	// Show store statistics
	fmt.Printf("\nStore Statistics:\n")
	fmt.Printf("  Total series: %d\n", len(store.Keys()))
	fmt.Printf("  Series keys: %v\n", store.Keys())

	// Test ring buffer behavior
	fmt.Println("\nTesting ring buffer limits...")
	testSeries := store.Upsert("test.metric")

	// Add more points than the hi-res buffer can hold (using small test config)
	smallConfig := timeseries.Config{
		MaxWindow:   60 * time.Minute,
		HiResStep:   1 * time.Second,
		HiResPoints: 5, // Small buffer for demo
		LoResStep:   5 * time.Second,
		LoResPoints: 5,
	}
	
	testSeries = timeseries.NewSeries(smallConfig)
	
	// Add 8 points to a 5-point buffer
	for i := 0; i < 8; i++ {
		timestamp := now.Add(time.Duration(i) * time.Second)
		testSeries.Add(timeseries.NewPoint(timestamp, float64(i)))
	}

	allPoints := testSeries.GetAll(timeseries.Hi)
	fmt.Printf("  Added 8 points to 5-point buffer, got %d points\n", len(allPoints))
	if len(allPoints) > 0 {
		fmt.Printf("  Oldest value: %.0f, Newest value: %.0f\n", 
			allPoints[0].V, allPoints[len(allPoints)-1].V)
	}

	fmt.Println("\n✅ Phase 1 Ring Buffer Core - Complete!")
}

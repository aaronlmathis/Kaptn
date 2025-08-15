package main

import (
	"fmt"
	"time"

	"github.com/aaronlmathis/kaptn/internal/timeseries"
	"go.uber.org/zap"
)

// Simple example demonstrating Phase 4 TimeSeries API
func main() {
	logger, _ := zap.NewDevelopment()

	fmt.Println("=== TimeSeries Phase 4 Integration Example ===")
	fmt.Println()

	// Create timeseries store
	config := timeseries.DefaultConfig()
	store := timeseries.NewMemStore(config)

	// Add some sample data to demonstrate the API
	cpuUsedSeries := store.Upsert(timeseries.ClusterCPUUsedCores)
	cpuCapacitySeries := store.Upsert(timeseries.ClusterCPUCapacityCores)
	netRxSeries := store.Upsert(timeseries.ClusterNetRxBps)
	netTxSeries := store.Upsert(timeseries.ClusterNetTxBps)

	// Add sample data points over the last 5 minutes
	now := time.Now()
	for i := 0; i < 300; i++ { // 5 minutes of 1-second data
		timestamp := now.Add(-time.Duration(300-i) * time.Second)

		// Simulate fluctuating CPU usage (2-6 cores)
		cpuUsage := 2.0 + 4.0*float64(i%60)/60.0
		cpuUsedSeries.Add(timeseries.NewPoint(timestamp, cpuUsage))

		// Static CPU capacity
		cpuCapacitySeries.Add(timeseries.NewPoint(timestamp, 8.0))

		// Simulate network traffic (oscillating)
		networkRx := 1000000.0 + 500000.0*float64(i%30)/30.0 // 1-1.5 MB/s
		networkTx := 800000.0 + 200000.0*float64(i%45)/45.0  // 0.8-1.0 MB/s
		netRxSeries.Add(timeseries.NewPoint(timestamp, networkRx))
		netTxSeries.Add(timeseries.NewPoint(timestamp, networkTx))
	}

	fmt.Printf("✅ Created timeseries store with sample data\n")
	fmt.Printf("   - %d CPU usage points\n", len(cpuUsedSeries.GetSince(now.Add(-6*time.Minute), timeseries.Hi)))
	fmt.Printf("   - %d CPU capacity points\n", len(cpuCapacitySeries.GetSince(now.Add(-6*time.Minute), timeseries.Hi)))
	fmt.Printf("   - %d Network RX points\n", len(netRxSeries.GetSince(now.Add(-6*time.Minute), timeseries.Hi)))
	fmt.Printf("   - %d Network TX points\n", len(netTxSeries.GetSince(now.Add(-6*time.Minute), timeseries.Hi)))
	fmt.Println()

	// Demonstrate different resolutions
	fmt.Println("📊 Resolution Comparison:")
	hiResPoints := cpuUsedSeries.GetSince(now.Add(-time.Minute), timeseries.Hi)
	loResPoints := cpuUsedSeries.GetSince(now.Add(-time.Minute), timeseries.Lo)
	fmt.Printf("   - Hi-res (1s): %d points in last minute\n", len(hiResPoints))
	fmt.Printf("   - Lo-res (5s): %d points in last minute\n", len(loResPoints))

	if len(hiResPoints) > 0 {
		latest := hiResPoints[len(hiResPoints)-1]
		fmt.Printf("   - Latest CPU usage: %.2f cores at %s\n", latest.V, latest.T.Format("15:04:05"))
	}
	fmt.Println()

	// Show what the API responses would look like
	fmt.Println("🔌 API Response Examples:")
	fmt.Println()

	// Example 1: Single series, high resolution, last 2 minutes
	fmt.Println("GET /api/v1/timeseries/cluster?series=cluster.cpu.used.cores&res=hi&since=2m")
	hiResCPU := cpuUsedSeries.GetSince(now.Add(-2*time.Minute), timeseries.Hi)
	fmt.Printf("Response: %d data points\n", len(hiResCPU))
	if len(hiResCPU) >= 5 {
		fmt.Println("Sample points:")
		for i := 0; i < 5; i++ {
			point := hiResCPU[i]
			fmt.Printf("  {\"t\": %d, \"v\": %.2f}\n", point.T.UnixMilli(), point.V)
		}
		fmt.Println("  ...")
	}
	fmt.Println()

	// Example 2: Multiple series, low resolution, last 5 minutes
	fmt.Println("GET /api/v1/timeseries/cluster?series=cluster.cpu.used.cores,cluster.cpu.capacity.cores&res=lo&since=5m")
	loResCPUUsed := cpuUsedSeries.GetSince(now.Add(-5*time.Minute), timeseries.Lo)
	loResCPUCapacity := cpuCapacitySeries.GetSince(now.Add(-5*time.Minute), timeseries.Lo)
	fmt.Printf("Response: CPU used (%d points), CPU capacity (%d points)\n", len(loResCPUUsed), len(loResCPUCapacity))
	fmt.Println()

	// Example 3: All series
	fmt.Println("GET /api/v1/timeseries/cluster (all series, default lo-res, last 60m)")
	allSeries := []string{
		timeseries.ClusterCPUUsedCores,
		timeseries.ClusterCPUCapacityCores,
		timeseries.ClusterNetRxBps,
		timeseries.ClusterNetTxBps,
	}
	for _, key := range allSeries {
		series, _ := store.Get(key)
		points := series.GetSince(now.Add(-60*time.Minute), timeseries.Lo)
		fmt.Printf("  %s: %d points\n", key, len(points))
	}
	fmt.Println()

	// Show capabilities
	fmt.Println("🔧 Capabilities Detection:")
	capabilities := map[string]bool{
		"metricsAPI": false, // Would be detected by aggregator in real environment
		"summaryAPI": false, // Would be detected by aggregator in real environment
	}
	fmt.Printf("  metricsAPI: %t (CPU usage data)\n", capabilities["metricsAPI"])
	fmt.Printf("  summaryAPI: %t (Network traffic data)\n", capabilities["summaryAPI"])
	fmt.Println()

	// Show WebSocket example
	fmt.Println("🔄 WebSocket Live Streaming:")
	fmt.Println("WebSocket URL: ws://localhost:9999/api/v1/timeseries/cluster/live")
	fmt.Println("Example messages:")
	fmt.Println(`  {"type":"init","data":{"series":{...},"capabilities":{...}}}`)
	fmt.Println(`  {"type":"append","key":"cluster.cpu.used.cores","point":{"t":1710000000000,"v":2.8}}`)
	fmt.Println()

	fmt.Println("✅ Phase 4 Implementation Complete!")
	fmt.Println()
	fmt.Println("Key Features:")
	fmt.Println("  ✅ REST API for historical data retrieval")
	fmt.Println("  ✅ WebSocket API for real-time streaming")
	fmt.Println("  ✅ Query parameter validation and filtering")
	fmt.Println("  ✅ Multiple resolution support (hi/lo)")
	fmt.Println("  ✅ Configurable time windows")
	fmt.Println("  ✅ Authentication and authorization integration")
	fmt.Println("  ✅ Capability detection and reporting")
	fmt.Println("  ✅ Coalesced WebSocket updates")
	fmt.Println("  ✅ Error handling and validation")
	fmt.Println()
	fmt.Println("Next: Phase 5 - Frontend Hook + API client")

	logger.Info("Phase 4 integration example complete")
}

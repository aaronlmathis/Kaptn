package main

import (
	"fmt"

	"github.com/aaronlmathis/kaptn/internal/config"
)

func main() {
	cfg, err := config.LoadFromFile("config.yaml")
	if err != nil {
		panic(err)
	}
	fmt.Printf("Timeseries enabled: %v\n", cfg.Timeseries.Enabled)
	fmt.Printf("Timeseries window: %s\n", cfg.Timeseries.Window)
	fmt.Printf("Tick interval: %s\n", cfg.Timeseries.TickInterval)
	fmt.Printf("Capacity refresh interval: %s\n", cfg.Timeseries.CapacityRefreshInterval)
	fmt.Printf("Hi-res step: %s\n", cfg.Timeseries.HiRes.Step)
	fmt.Printf("Lo-res step: %s\n", cfg.Timeseries.LoRes.Step)
}

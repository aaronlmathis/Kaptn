package main

import (
	"context"
	"fmt"
	"log"
	"time"

	"go.uber.org/zap"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
	metricsclient "k8s.io/metrics/pkg/client/clientset/versioned"

	"github.com/aaronlmathis/kaptn/internal/timeseries"
	"github.com/aaronlmathis/kaptn/internal/timeseries/aggregator"
)

func main() {
	// Initialize logger
	logger, err := zap.NewDevelopment()
	if err != nil {
		log.Fatalf("Failed to create logger: %v", err)
	}
	defer logger.Sync()

	// Create Kubernetes config (in-cluster or kubeconfig)
	var config *rest.Config

	// Try in-cluster config first
	config, err = rest.InClusterConfig()
	if err != nil {
		// Fall back to kubeconfig
		config, err = clientcmd.BuildConfigFromFlags("", clientcmd.RecommendedHomeFile)
		if err != nil {
			logger.Fatal("Failed to create Kubernetes config", zap.Error(err))
		}
		logger.Info("Using kubeconfig for authentication")
	} else {
		logger.Info("Using in-cluster configuration")
	}

	// Create Kubernetes client
	kubeClient, err := kubernetes.NewForConfig(config)
	if err != nil {
		logger.Fatal("Failed to create Kubernetes client", zap.Error(err))
	}

	// Create metrics client
	metricsClient, err := metricsclient.NewForConfig(config)
	if err != nil {
		logger.Fatal("Failed to create metrics client", zap.Error(err))
	}

	// Create time series store
	store := timeseries.NewMemStore(timeseries.DefaultConfig())

	// Create aggregator
	aggregatorConfig := aggregator.DefaultConfig()
	agg := aggregator.NewAggregator(
		logger,
		store,
		kubeClient,
		metricsClient.MetricsV1beta1(),
		config,
		aggregatorConfig,
	)

	// Start aggregator
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	logger.Info("Starting time series aggregator...")
	err = agg.Start(ctx)
	if err != nil {
		logger.Fatal("Failed to start aggregator", zap.Error(err))
	}

	// Check capabilities
	capabilities := agg.GetCapabilities(ctx)
	logger.Info("Aggregator capabilities",
		zap.Bool("metricsAPI", capabilities["metricsAPI"]),
		zap.Bool("summaryAPI", capabilities["summaryAPI"]),
	)

	// Let it run for a bit to collect some data
	time.Sleep(10 * time.Second)

	// Display collected data
	for _, key := range timeseries.AllSeriesKeys() {
		if series, exists := store.Get(key); exists {
			points := series.GetSince(time.Now().Add(-5*time.Minute), timeseries.Hi)
			logger.Info("Time series data",
				zap.String("series", key),
				zap.Int("points", len(points)),
			)

			// Show last few points
			if len(points) > 0 {
				fmt.Printf("\n=== %s ===\n", key)
				start := len(points) - 5
				if start < 0 {
					start = 0
				}
				for i := start; i < len(points); i++ {
					fmt.Printf("  %s: %.2f\n", points[i].T.Format("15:04:05"), points[i].V)
				}
			}
		}
	}

	// Stop aggregator
	logger.Info("Stopping aggregator...")
	agg.Stop()
	logger.Info("Aggregator stopped")
}

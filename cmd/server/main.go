package main

import (
	"context"
	"flag"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/aaronlmathis/kaptn/internal/api"
	"github.com/aaronlmathis/kaptn/internal/config"
	"github.com/aaronlmathis/kaptn/internal/logging"
	"github.com/aaronlmathis/kaptn/internal/version"
	"go.uber.org/zap"
)

func main() {
	// Define command line flags
	var (
		showVersion = flag.Bool("version", false, "Show version information and exit")
		healthCheck = flag.Bool("health-check", false, "Perform health check and exit")
		configFile  = flag.String("config", "", "Path to configuration file")
	)
	flag.Parse()

	// Handle version flag
	if *showVersion {
		info := version.Get()
		fmt.Println(info.String())
		os.Exit(0)
	}

	// Load configuration
	var cfg *config.Config
	var err error

	if *configFile != "" {
		cfg, err = config.LoadFromFile(*configFile)
	} else {
		cfg, err = config.Load()
	}

	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to load configuration: %v\n", err)
		os.Exit(1)
	}

	if err := cfg.Validate(); err != nil {
		fmt.Fprintf(os.Stderr, "Invalid configuration: %v\n", err)
		os.Exit(1)
	}

	// Handle health check flag
	if *healthCheck {
		performHealthCheck(cfg.Server.Addr)
		return
	}

	// Initialize logger
	logger, err := logging.NewLogger(cfg.Logging.Level)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to initialize logger: %v\n", err)
		os.Exit(1)
	}
	defer logger.Sync()

	// Log startup information
	info := version.Get()
	logger.Info("Starting Kubernetes Admin Dashboard",
		zap.String("version", info.Version),
		zap.String("gitCommit", info.GitCommit),
		zap.String("buildDate", info.BuildDate),
		zap.String("goVersion", info.GoVersion),
		zap.String("addr", cfg.Server.Addr),
	)

	// Create API server
	apiServer, err := api.NewServer(logger, cfg)
	if err != nil {
		logger.Fatal("Failed to create API server", zap.Error(err))
	}

	// Start server components
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	if err := apiServer.Start(ctx); err != nil {
		logger.Fatal("Failed to start server components", zap.Error(err))
	}
	defer apiServer.Stop()

	// Create HTTP server
	server := &http.Server{
		Addr:    cfg.Server.Addr,
		Handler: apiServer.Handler(),
	}

	// Start server in goroutine
	go func() {
		logger.Info("Server starting", zap.String("addr", cfg.Server.Addr))
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Fatal("Server failed to start", zap.Error(err))
		}
	}()

	// Wait for interrupt signal to gracefully shutdown the server
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	logger.Info("Server shutting down...")

	// Give the server a maximum of 30 seconds to shutdown gracefully
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer shutdownCancel()

	if err := server.Shutdown(shutdownCtx); err != nil {
		logger.Error("Server forced to shutdown", zap.Error(err))
		os.Exit(1)
	}

	logger.Info("Server exited")
}

// performHealthCheck performs a health check against the server's healthz endpoint
func performHealthCheck(addr string) {
	// Build the health check URL
	url := fmt.Sprintf("http://%s/healthz", addr)

	// Create HTTP client with timeout
	client := &http.Client{
		Timeout: 10 * time.Second,
	}

	fmt.Printf("Performing health check against %s...\n", url)

	// Make the request
	resp, err := client.Get(url)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Health check failed: %v\n", err)
		os.Exit(1)
	}
	defer resp.Body.Close()

	// Check response status
	if resp.StatusCode == http.StatusOK {
		fmt.Println("Health check passed: Server is healthy")
		os.Exit(0)
	} else {
		fmt.Fprintf(os.Stderr, "Health check failed: Server returned status %d\n", resp.StatusCode)
		os.Exit(1)
	}
}

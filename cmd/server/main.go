package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/acme/kad/internal/api"
	"github.com/acme/kad/internal/config"
	"github.com/acme/kad/internal/logging"
	"github.com/acme/kad/internal/version"
	"go.uber.org/zap"
)

func main() {
	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to load configuration: %v\n", err)
		os.Exit(1)
	}

	if err := cfg.Validate(); err != nil {
		fmt.Fprintf(os.Stderr, "Invalid configuration: %v\n", err)
		os.Exit(1)
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

	// Start server components
	startCtx, startCancel := context.WithCancel(context.Background())
	defer startCancel()

	if err := apiServer.Start(startCtx); err != nil {
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

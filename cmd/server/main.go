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

	"github.com/aaronlmathis/kaptn/internal/config"
	"github.com/aaronlmathis/kaptn/internal/logging"
	"github.com/aaronlmathis/kaptn/internal/server"
	"github.com/aaronlmathis/kaptn/internal/version"
	"go.uber.org/zap"
)

func main() {
	var (
		showVersion = flag.Bool("version", false, "Show version information and exit")
		healthCheck = flag.Bool("health-check", false, "Perform health check and exit")
		configFile  = flag.String("config", "", "Path to configuration file")
	)
	flag.Parse()

	if *showVersion {
		info := version.Get()
		fmt.Println(info.String())
		return
	}

	var (
		cfg *config.Config
		err error
	)
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

	if *healthCheck {
		performHealthCheck(cfg.Server.Addr)
		return
	}

	logger, err := logging.NewLogger(cfg.Logging.Level, cfg.Logging.Format, cfg.Logging.File)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to initialize logger: %v\n", err)
		os.Exit(1)
	}
	defer logger.Sync()

	info := version.Get()
	logger.Info("Starting Kaptn Admin Dashboard",
		zap.String("version", info.Version),
		zap.String("gitCommit", info.GitCommit),
		zap.String("buildDate", info.BuildDate),
		zap.String("goVersion", info.GoVersion),
		zap.String("addr", cfg.Server.Addr),
	)

	// Construct server with deps (logger, cfg, clients, etc.)
	kaptnServer, err := server.New(logger, cfg)
	if err != nil {
		logger.Fatal("Failed to create API server", zap.Error(err))
	}

	// Let the server mount its own routes (no routes/chi imports here).
	kaptnServer.SetupRoutes()

	// Start background components (if any)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
    if err := kaptnServer.Start(ctx); err != nil {
        logger.Fatal("Failed to start server components", zap.Error(err))
    }
    // Note: Do not defer Stop(); we explicitly stop components during
    // signal handling to avoid double-stop and ensure correct shutdown order.

	httpServer := &http.Server{
		Addr:    cfg.Server.Addr,
		Handler: kaptnServer.Handler(), // returns http.Handler
	}

	go func() {
		logger.Info("Server starting", zap.String("addr", cfg.Server.Addr))
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Fatal("Server failed to start", zap.Error(err))
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
    <-quit
    logger.Info("Server shutting down...")

    // Cancel background context to notify long-running goroutines
    cancel()

    // First stop background components to unblock any long-running requests
    // (streams, watches, websockets) so HTTP shutdown can complete promptly.
    kaptnServer.Stop()

    // Disable keep-alives to prevent new requests during shutdown
    httpServer.SetKeepAlivesEnabled(false)

    // Gracefully shut down HTTP server with timeout
    shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 30*time.Second)
    defer shutdownCancel()
    if err := httpServer.Shutdown(shutdownCtx); err != nil {
        logger.Error("Server forced to shutdown", zap.Error(err))
        os.Exit(1)
    }
    logger.Info("Server exited")
}

func performHealthCheck(addr string) {
	url := fmt.Sprintf("http://%s/healthz", addr)
	client := &http.Client{Timeout: 10 * time.Second}
	fmt.Printf("Performing health check against %s...\n", url)
	resp, err := client.Get(url)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Health check failed: %v\n", err)
		os.Exit(1)
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusOK {
		fmt.Println("Health check passed: Server is healthy")
	} else {
		fmt.Fprintf(os.Stderr, "Health check failed: status %d\n", resp.StatusCode)
		os.Exit(1)
	}
}

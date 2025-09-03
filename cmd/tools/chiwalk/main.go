package main

import (
	"fmt"
	"net/http"

	"github.com/aaronlmathis/kaptn/internal/api"
	"github.com/aaronlmathis/kaptn/internal/config"
	"github.com/aaronlmathis/kaptn/internal/logging"
	"github.com/go-chi/chi/v5"
)

func main() {
	// Load dev config to avoid auth
	cfg, err := config.LoadFromFile("config.dev.yaml")
	if err != nil {
		panic(fmt.Sprintf("Failed to load config: %v", err))
	}

	// Initialize logger
	logger, err := logging.NewLogger("info", "json", "")
	if err != nil {
		panic(fmt.Sprintf("Failed to initialize logger: %v", err))
	}

	s, err := api.NewServer(logger, cfg)
	if err != nil {
		panic(err)
	}
	router := s.Handler().(chi.Router)

	chi.Walk(router, func(method string, route string, handler http.Handler, middlewares ...func(http.Handler) http.Handler) error {
		fmt.Printf("%-6s %s | mw=%d\n", method, route, len(middlewares))
		return nil
	})
}

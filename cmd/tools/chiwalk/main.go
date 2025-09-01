package main

import (
	"fmt"
	"net/http"

	"github.com/aaronlmathis/kaptn/internal/api" // your server package
	"github.com/go-chi/chi/v5"
)

func main() {
	s, err := api.NewServer(nil, nil) // use real logger+config in your repo
	if err != nil {
		panic(err)
	}
	router := s.Handler().(chi.Router)

	chi.Walk(router, func(method string, route string, handler http.Handler, middlewares ...func(http.Handler) http.Handler) error {
		fmt.Printf("%-6s %s | mw=%d\n", method, route, len(middlewares))
		return nil
	})
}

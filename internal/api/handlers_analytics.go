package api

import (
	"encoding/json"
	"net/http"

	"go.uber.org/zap"
)

// Analytics related handlers

func (s *Server) handleGetVisitors(w http.ResponseWriter, r *http.Request) {
	// Parse query parameters
	window := r.URL.Query().Get("window")
	if window == "" {
		window = "90d" // default to 90 days
	}

	step := r.URL.Query().Get("step")
	if step == "" {
		// Set default step based on window
		switch window {
		case "7d":
			step = "1h"
		case "30d":
			step = "1h"
		case "90d":
			step = "1d"
		default:
			step = "1h"
		}
	}

	// Get visitors data from analytics service
	visitors, err := s.analyticsService.GetVisitors(r.Context(), window, step)
	if err != nil {
		s.logger.Error("Failed to get visitors analytics",
			zap.String("window", window),
			zap.String("step", step),
			zap.Error(err))

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error":  "Failed to retrieve analytics data",
			"status": "error",
		})
		return
	}

	// Return success response
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"data":   visitors,
		"status": "success",
	})
}

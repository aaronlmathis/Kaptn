package api

import (
	"encoding/json"
	"net/http"
)

// handleTimeSeriesHealth returns the health status of the timeseries system
func (s *Server) handleTimeSeriesHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	// Build health response
	health := map[string]interface{}{
		"enabled":              s.config.Timeseries.Enabled,
		"store_available":      s.timeSeriesStore != nil,
		"aggregator_available": s.timeSeriesAggregator != nil,
	}

	// Get store health if available
	if s.timeSeriesStore != nil {
		storeHealth := s.timeSeriesStore.GetHealthSnapshot()
		health["store_health"] = storeHealth
	}

	// Get aggregator capabilities if available
	if s.timeSeriesAggregator != nil {
		capabilities := s.timeSeriesAggregator.GetCapabilities(r.Context())
		health["capabilities"] = capabilities
	}

	// Get configuration details
	health["config"] = map[string]interface{}{
		"window":                          s.config.Timeseries.Window,
		"tick_interval":                   s.config.Timeseries.TickInterval,
		"capacity_refresh_interval":       s.config.Timeseries.CapacityRefreshInterval,
		"hi_res_step":                     s.config.Timeseries.HiRes.Step,
		"lo_res_step":                     s.config.Timeseries.LoRes.Step,
		"max_series":                      s.config.Timeseries.MaxSeries,
		"max_points_per_series":           s.config.Timeseries.MaxPointsPerSeries,
		"max_ws_clients":                  s.config.Timeseries.MaxWSClients,
		"disable_network_if_unavailable":  s.config.Timeseries.DisableNetworkIfUnavailable,
	}

	// Set HTTP status based on health
	status := http.StatusOK
	if !s.config.Timeseries.Enabled {
		status = http.StatusServiceUnavailable
		health["status"] = "disabled"
	} else if s.timeSeriesStore == nil || s.timeSeriesAggregator == nil {
		status = http.StatusServiceUnavailable
		health["status"] = "unhealthy"
	} else {
		health["status"] = "healthy"
	}

	w.WriteHeader(status)
	json.NewEncoder(w).Encode(health)
}

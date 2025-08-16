package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/aaronlmathis/kaptn/internal/timeseries"
)

// handleDebugTimeSeries provides a simple debug page to inspect timeseries data
func (s *Server) handleDebugTimeSeries(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")

	// Get health metrics if available
	var healthData interface{}
	if s.timeSeriesStore != nil {
		health := s.timeSeriesStore.GetHealthSnapshot()
		healthData = health
	}

	// Get capabilities if available
	var capabilities map[string]bool
	if s.timeSeriesAggregator != nil {
		capabilities = s.timeSeriesAggregator.GetCapabilities(r.Context())
	}

	// Get all series data
	var seriesData map[string]interface{}
	if s.timeSeriesStore != nil {
		seriesData = make(map[string]interface{})

		// Get all available series keys
		allKeys := timeseries.AllSeriesKeys()

		for _, key := range allKeys {
			series, exists := s.timeSeriesStore.Get(key)
			if !exists {
				seriesData[key] = map[string]interface{}{
					"exists": false,
					"points": 0,
				}
				continue
			}

			// Get recent points (last 5 minutes)
			since := time.Now().Add(-5 * time.Minute)
			hiPoints := series.GetSince(since, timeseries.Hi)
			loPoints := series.GetSince(since, timeseries.Lo)

			seriesData[key] = map[string]interface{}{
				"exists":         true,
				"hi_points":      len(hiPoints),
				"lo_points":      len(loPoints),
				"last_hi_points": getLastNPoints(hiPoints, 10),
				"last_lo_points": getLastNPoints(loPoints, 10),
			}
		}
	}

	html := fmt.Sprintf(`<!DOCTYPE html>
<html>
<head>
    <title>Kaptn TimeSeries Debug</title>
    <style>
        body { font-family: monospace; margin: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; }
        .section { background: white; margin: 20px 0; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .header { background: #2563eb; color: white; text-align: center; padding: 20px; border-radius: 8px; }
        h1 { margin: 0; }
        h2 { color: #1e40af; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px; }
        .health-ok { color: #059669; }
        .health-warn { color: #d97706; }
        .health-error { color: #dc2626; }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
        .series-card { border: 1px solid #e5e7eb; padding: 15px; border-radius: 6px; background: #f9fafb; }
        .series-exists { border-left: 4px solid #10b981; }
        .series-empty { border-left: 4px solid #6b7280; }
        .data-block { background: #f3f4f6; padding: 10px; border-radius: 4px; margin: 10px 0; overflow-x: auto; }
        pre { margin: 0; white-space: pre-wrap; }
        .refresh-btn { background: #2563eb; color: white; padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; font-size: 16px; }
        .refresh-btn:hover { background: #1d4ed8; }
        .api-links { margin: 20px 0; }
        .api-links a { display: inline-block; margin: 5px 10px 5px 0; padding: 8px 16px; background: #059669; color: white; text-decoration: none; border-radius: 4px; }
        .api-links a:hover { background: #047857; }
        .timestamp { color: #6b7280; font-size: 0.9em; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔍 Kaptn TimeSeries Debug</h1>
            <p>Live view of ring buffer data and telemetry collection status</p>
            <div class="timestamp">Generated: %s</div>
        </div>

        <div class="section">
            <button class="refresh-btn" onclick="window.location.reload()">🔄 Refresh Data</button>
            
            <div class="api-links">
                <strong>Quick API Links:</strong>
                <a href="/api/v1/timeseries/cluster">📊 TimeSeries API</a>
                <a href="/api/v1/timeseries/cluster?res=hi&since=5m">📈 Hi-Res (5m)</a>
                <a href="/api/v1/timeseries/cluster?res=lo&since=1h">📉 Lo-Res (1h)</a>
                <a href="/metrics">📋 Prometheus Metrics</a>
            </div>
        </div>

        <div class="section">
            <h2>🏥 Health Status</h2>
            <div class="data-block">
                <pre>%s</pre>
            </div>
        </div>

        <div class="section">
            <h2>🔌 Capabilities</h2>
            <div class="data-block">
                <pre>%s</pre>
            </div>
        </div>

        <div class="section">
            <h2>📊 Series Data (Last 5 minutes)</h2>
            <div class="grid">
                %s
            </div>
        </div>

        <div class="section">
            <h2>🔧 Configuration</h2>
            <div class="data-block">
                <pre>TimeSeries Enabled: %t
Service Available: %t
Aggregator Available: %t</pre>
            </div>
        </div>
    </div>

    <script>
        // Auto-refresh every 30 seconds
        setTimeout(function() {
            window.location.reload();
        }, 30000);
    </script>
</body>
</html>`,
		time.Now().Format("2006-01-02 15:04:05 MST"),
		formatJSON(healthData),
		formatJSON(capabilities),
		renderSeriesCards(seriesData),
		s.config.Timeseries.Enabled,
		s.timeSeriesStore != nil,
		s.timeSeriesAggregator != nil,
	)

	w.Write([]byte(html))
}

// formatJSON formats data as pretty-printed JSON
func formatJSON(data interface{}) string {
	if data == nil {
		return "null"
	}

	bytes, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		return fmt.Sprintf("Error formatting JSON: %v", err)
	}

	return string(bytes)
}

// getLastNPoints returns the last N points from a slice
func getLastNPoints(points []timeseries.Point, n int) []timeseries.Point {
	if len(points) <= n {
		return points
	}
	return points[len(points)-n:]
}

// renderSeriesCards renders the series data as HTML cards
func renderSeriesCards(seriesData map[string]interface{}) string {
	if seriesData == nil {
		return "<p>No series data available</p>"
	}

	var html string

	for key, data := range seriesData {
		dataMap, ok := data.(map[string]interface{})
		if !ok {
			continue
		}

		exists, _ := dataMap["exists"].(bool)
		cssClass := "series-card"
		if exists {
			cssClass += " series-exists"
		} else {
			cssClass += " series-empty"
		}

		var content string
		if exists {
			hiPoints, _ := dataMap["hi_points"].(int)
			loPoints, _ := dataMap["lo_points"].(int)

			content = fmt.Sprintf(`
				<strong>✅ Active Series</strong><br>
				Hi-res points: %d<br>
				Lo-res points: %d<br>
				<details>
					<summary>Recent Hi-Res Points</summary>
					<div class="data-block">
						<pre>%s</pre>
					</div>
				</details>
				<details>
					<summary>Recent Lo-Res Points</summary>
					<div class="data-block">
						<pre>%s</pre>
					</div>
				</details>
			`, hiPoints, loPoints,
				formatJSON(dataMap["last_hi_points"]),
				formatJSON(dataMap["last_lo_points"]))
		} else {
			content = "<strong>❌ No Data</strong><br>Series not created yet"
		}

		html += fmt.Sprintf(`
			<div class="%s">
				<h3>%s</h3>
				%s
			</div>
		`, cssClass, key, content)
	}

	return html
}

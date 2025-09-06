package server

import (
    "encoding/json"
    "net/http"
    "strings"
    "time"

    "github.com/aaronlmathis/kaptn/internal/timeseries"
    "go.uber.org/zap"
)

// HandleGetHPATimeseries returns short-window HPA replica and scale event series
// GET /api/v1/timeseries/hpas?namespace=...&name=...&res=lo|hi&since=30m
func (s *Server) HandleGetHPATimeseries(w http.ResponseWriter, r *http.Request) {
    namespace := r.URL.Query().Get("namespace")
    if namespace == "" {
        namespace = r.URL.Query().Get("ns")
    }
    name := r.URL.Query().Get("name")
    resParam := r.URL.Query().Get("res")
    sinceParam := r.URL.Query().Get("since")

    if resParam == "" { resParam = "lo" }
    if sinceParam == "" { sinceParam = "60m" }

    // Resolve resolution
    var resolution timeseries.Resolution
    switch strings.ToLower(resParam) {
    case "hi":
        resolution = timeseries.Hi
    case "lo":
        resolution = timeseries.Lo
    default:
        w.Header().Set("Content-Type", "application/json")
        w.WriteHeader(http.StatusBadRequest)
        json.NewEncoder(w).Encode(map[string]string{"error": "Invalid res. Use 'hi' or 'lo'"})
        return
    }

    // Parse since
    since, err := time.ParseDuration(sinceParam)
    if err != nil {
        w.Header().Set("Content-Type", "application/json")
        w.WriteHeader(http.StatusBadRequest)
        json.NewEncoder(w).Encode(map[string]string{"error": "Invalid since duration"})
        return
    }

    if namespace == "" || name == "" {
        w.Header().Set("Content-Type", "application/json")
        w.WriteHeader(http.StatusBadRequest)
        json.NewEncoder(w).Encode(map[string]string{"error": "namespace and name are required"})
        return
    }

    if s.timeSeriesStore == nil {
        s.logger.Error("TimeSeries store not initialized")
        w.Header().Set("Content-Type", "application/json")
        w.WriteHeader(http.StatusServiceUnavailable)
        json.NewEncoder(w).Encode(map[string]string{ "error": "TimeSeries service not available"})
        return
    }

    // Build keys
    desiredKey := timeseries.GeneratePodSeriesKey(timeseries.HPADesiredReplicasBase, namespace, name)
    currentKey := timeseries.GeneratePodSeriesKey(timeseries.HPACurrentReplicasBase, namespace, name)
    scaleUpKey := timeseries.GeneratePodSeriesKey(timeseries.HPAScaleEventsUpBase, namespace, name)
    scaleDownKey := timeseries.GeneratePodSeriesKey(timeseries.HPAScaleEventsDownBase, namespace, name)

    keys := []string{desiredKey, currentKey, scaleUpKey, scaleDownKey}

    timeThreshold := time.Now().Add(-since)
    seriesData := make(map[string][]TimeSeriesPoint)

    for _, key := range keys {
        if series, ok := s.timeSeriesStore.Get(key); ok && series != nil {
            points := series.GetSince(timeThreshold, resolution)
            apiPoints := make([]TimeSeriesPoint, 0, len(points))
            for _, p := range points {
                apiPoints = append(apiPoints, TimeSeriesPoint{ T: p.T.UnixMilli(), V: p.V, Entity: p.Entity })
            }
            seriesData[key] = apiPoints
        } else {
            seriesData[key] = []TimeSeriesPoint{}
        }
    }

    // Capabilities
    capabilities := make(map[string]bool)
    if s.timeSeriesAggregator != nil {
        capabilities = s.timeSeriesAggregator.GetCapabilities(r.Context())
    }

    resp := TimeSeriesResponse{
        Series:       seriesData,
        Capabilities: capabilities,
        Metadata: &TimeSeriesMetadata{
            Resolution: strings.ToLower(resParam),
            TimeSpan:   sinceParam,
            Scope:      "hpas",
            Entity:     "namespace=" + namespace + ",hpa=" + name,
        },
    }

    s.logger.Debug("HPA timeseries returned",
        zap.String("namespace", namespace), zap.String("name", name))

    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(resp)
}


package server

import (
	"context"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/aaronlmathis/kaptn/internal/logs"
	"go.uber.org/zap"
)

// HandleGetLogs handles GET /api/v1/logs - replay-only log queries
func (s *Server) HandleGetLogs(w http.ResponseWriter, r *http.Request) {
	// Get security context for RBAC checks
	secCtx, err := s.getSecurityContext(r)
	if err != nil {
		if secErr, ok := err.(*SecurityError); ok {
			s.writeSecurityError(w, secErr, nil)
		} else {
			s.writeSecurityError(w, &SecurityError{
				Code:    "INTERNAL_ERROR",
				Message: "Internal server error",
				Status:  http.StatusInternalServerError,
			}, nil)
		}
		return
	}

	// Parse query parameters and build filter
	filter, err := s.parseLogFilter(r)
	if err != nil {
		s.logger.Warn("Invalid log filter parameters", zap.Error(err))
		http.Error(w, fmt.Sprintf("Invalid parameters: %v", err), http.StatusBadRequest)
		return
	}

	// Perform RBAC checks for the requested scope
	if err := s.checkLogPermissions(r, secCtx, filter); err != nil {
		if secErr, ok := err.(*SecurityError); ok {
			s.writeSecurityError(w, secErr, nil)
		} else {
			s.logger.Error("Log permission check failed", zap.Error(err))
			s.writeSecurityError(w, &SecurityError{
				Code:    "PERMISSION_CHECK_FAILED",
				Message: "Failed to check log permissions",
				Status:  http.StatusInternalServerError,
			}, nil)
		}
		return
	}

	// Execute replay query
	entries := s.logsCacheService.Replay(filter)

	// Log audit event
	s.logAuditEvent(r, secCtx.User, "get", "pods/log", filter.Namespace, filter.Pod, "ALLOWED", nil)

	// Return results
	response := map[string]interface{}{
		"data":   entries,
		"count":  len(entries),
		"filter": filter,
		"status": "success",
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(response)

	s.logger.Debug("Served log replay request",
		zap.String("user", secCtx.User.Email),
		zap.String("namespace", filter.Namespace),
		zap.Int("result_count", len(entries)))
}

// HandleExportLogs handles GET /api/v1/logs/export - stream logs as CSV/JSON
func (s *Server) HandleExportLogs(w http.ResponseWriter, r *http.Request) {
	// Get security context for RBAC checks
	secCtx, err := s.getSecurityContext(r)
	if err != nil {
		if secErr, ok := err.(*SecurityError); ok {
			s.writeSecurityError(w, secErr, nil)
		} else {
			s.writeSecurityError(w, &SecurityError{
				Code:    "INTERNAL_ERROR",
				Message: "Internal server error",
				Status:  http.StatusInternalServerError,
			}, nil)
		}
		return
	}

	// Parse format parameter (default to JSON)
	format := r.URL.Query().Get("format")
	if format == "" {
		format = "json"
	}
	if format != "json" && format != "csv" {
		http.Error(w, "Invalid format. Supported: json, csv", http.StatusBadRequest)
		return
	}

	// Parse query parameters and build filter
	filter, err := s.parseLogFilter(r)
	if err != nil {
		s.logger.Warn("Invalid log filter parameters", zap.Error(err))
		http.Error(w, fmt.Sprintf("Invalid parameters: %v", err), http.StatusBadRequest)
		return
	}

	// Perform RBAC checks for the requested scope
	if err := s.checkLogPermissions(r, secCtx, filter); err != nil {
		if secErr, ok := err.(*SecurityError); ok {
			s.writeSecurityError(w, secErr, nil)
		} else {
			s.logger.Error("Log permission check failed", zap.Error(err))
			s.writeSecurityError(w, &SecurityError{
				Code:    "PERMISSION_CHECK_FAILED",
				Message: "Failed to check log permissions",
				Status:  http.StatusInternalServerError,
			}, nil)
		}
		return
	}

	// Execute replay query with timing
	startTime := time.Now()
	entries := s.logsCacheService.Replay(filter)
	_ = time.Since(startTime) // Record query duration (unused for now)

	// Log audit event
	s.logAuditEvent(r, secCtx.User, "get", "pods/log", filter.Namespace, filter.Pod, "ALLOWED", nil)

	// Check for degraded conditions (large result sets that might cause issues)
	degraded := false
	degradedThreshold := 10000 // Default fallback for tests
	if s.logsCacheService != nil {
		currentLimits := s.logsCacheService.AdminGetCurrentLimits()
		degradedThreshold = currentLimits.MaxQueryLimit // Use service limit as degraded threshold
	}
	if len(entries) > degradedThreshold {
		degraded = true
		s.logger.Warn("Large export request detected, entering degraded mode",
			zap.Int("entry_count", len(entries)),
			zap.Int("degraded_threshold", degradedThreshold),
			zap.String("user", secCtx.User.Email))
	}

	// Estimate export size for metrics
	var estimatedBytes int64
	for _, entry := range entries {
		// Rough estimation of entry size
		estimatedBytes += int64(len(entry.Msg) + len(entry.Pod) + len(entry.Namespace) + len(entry.Workload) + 200) // 200 bytes overhead
	}

	// Set response headers based on format
	exportStartTime := time.Now()
	if format == "csv" {
		w.Header().Set("Content-Type", "text/csv")
		w.Header().Set("Content-Disposition", "attachment; filename=logs.csv")
		if degraded {
			w.Header().Set("X-Kaptn-Logs-Degraded", "true")
			w.Header().Set("X-Kaptn-Logs-Reason", "large_result_set")
		}
		s.streamLogsAsCSVChunked(w, r, entries, degraded)
	} else {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Content-Disposition", "attachment; filename=logs.json")
		if degraded {
			w.Header().Set("X-Kaptn-Logs-Degraded", "true")
			w.Header().Set("X-Kaptn-Logs-Reason", "large_result_set")
		}
		s.streamLogsAsJSONChunked(w, r, entries, degraded)
	}
	exportDuration := time.Since(exportStartTime)

	// Record export metrics
	if s.logsCacheService != nil {
		s.logsCacheService.RecordExport(format, estimatedBytes, exportDuration.Milliseconds())
	}

	s.logger.Info("Served log export request",
		zap.String("user", secCtx.User.Email),
		zap.String("namespace", filter.Namespace),
		zap.String("format", format),
		zap.Int("result_count", len(entries)),
		zap.Bool("degraded", degraded))
}

// parseLogFilter parses query parameters into a LogFilter
func (s *Server) parseLogFilter(r *http.Request) (logs.LogFilter, error) {
	filter := logs.LogFilter{
		Direction: "backward", // Default to recent logs first
		Limit:     1000,       // Default limit as per design
	}

	// Parse time parameters
	if since := r.URL.Query().Get("since"); since != "" {
		if duration, err := time.ParseDuration(since); err == nil {
			filter.Since = time.Now().Add(-duration)
		} else if parsedTime, err := time.Parse(time.RFC3339, since); err == nil {
			filter.Since = parsedTime
		} else {
			return filter, fmt.Errorf("invalid since parameter: %s (use duration like '5m' or RFC3339 timestamp)", since)
		}
	}

	if until := r.URL.Query().Get("until"); until != "" {
		if parsedTime, err := time.Parse(time.RFC3339, until); err == nil {
			filter.Until = parsedTime
		} else if duration, err := time.ParseDuration(until); err == nil {
			filter.Until = time.Now().Add(-duration)
		} else {
			return filter, fmt.Errorf("invalid until parameter: %s (use RFC3339 timestamp or duration like '1h')", until)
		}
	}

	// Parse scope parameters
	filter.Cluster = r.URL.Query().Get("cluster")
	filter.Namespace = r.URL.Query().Get("namespace")
	filter.Workload = r.URL.Query().Get("workload")
	filter.Pod = r.URL.Query().Get("pod")

	// Parse levels (comma-separated)
	if levels := r.URL.Query().Get("levels"); levels != "" {
		filter.Levels = strings.Split(levels, ",")
		// Validate log levels
		for _, level := range filter.Levels {
			level = strings.TrimSpace(strings.ToLower(level))
			if level != "debug" && level != "info" && level != "warn" && level != "error" && level != "fatal" {
				return filter, fmt.Errorf("invalid log level: %s (must be one of: debug, info, warn, error, fatal)", level)
			}
		}
	}

	// Parse text search
	filter.Text = r.URL.Query().Get("q")

	// Parse limit
	if limitStr := r.URL.Query().Get("limit"); limitStr != "" {
		if limit, err := strconv.Atoi(limitStr); err == nil && limit > 0 {
			// Use service limits instead of hardcoded values
			maxLimit := 10000 // Default fallback for tests
			if s.logsCacheService != nil {
				currentLimits := s.logsCacheService.AdminGetCurrentLimits()
				maxLimit = currentLimits.MaxQueryLimit
			}
			if limit > maxLimit {
				limit = maxLimit
			}
			filter.Limit = limit
		} else {
			return filter, fmt.Errorf("invalid limit parameter: %s (must be positive integer)", limitStr)
		}
	}

	// Parse direction
	if direction := r.URL.Query().Get("direction"); direction != "" {
		if direction == "forward" || direction == "backward" {
			filter.Direction = direction
		} else {
			return filter, fmt.Errorf("invalid direction parameter: %s (must be 'forward' or 'backward')", direction)
		}
	}

	// Validate time range
	if !filter.Since.IsZero() && !filter.Until.IsZero() && filter.Since.After(filter.Until) {
		return filter, fmt.Errorf("since time cannot be after until time")
	}

    // If no time range specified, default to last 1 hour (aligns with logs TTL defaults)
    if filter.Since.IsZero() && filter.Until.IsZero() && r.URL.Path != "/api/v1/logs/export" {
        filter.Since = time.Now().Add(-1 * time.Hour)
    }

	return filter, nil
}

// checkLogPermissions performs RBAC checks for log access
func (s *Server) checkLogPermissions(r *http.Request, secCtx *SecurityContext, filter logs.LogFilter) error {
	// For log access, we need to check "get" permission on "pods/log" subresource
	// This follows Kubernetes RBAC patterns for pod log access

	// If specific pod is requested, check that pod
	if filter.Pod != "" && filter.Namespace != "" {
		if err := s.checkResourcePermissionWithSubresource(r.Context(), secCtx, "get", "pods", "log", filter.Namespace, filter.Pod); err != nil {
			return err
		}
		return nil
	}

	// If namespace is specified but no specific pod, check if user can access logs in that namespace
	if filter.Namespace != "" {
		// Check if user can list pods in the namespace (they need this to see logs)
		if err := s.checkResourcePermission(r.Context(), secCtx, "list", "pods", filter.Namespace, ""); err != nil {
			return err
		}
		// And check if they can access pod logs in general
		if err := s.checkResourcePermissionWithSubresource(r.Context(), secCtx, "get", "pods", "log", filter.Namespace, ""); err != nil {
			return err
		}
		return nil
	}

	// If no specific namespace, check if user has cluster-wide pod log access
	// This is more restrictive - they need to list pods across all namespaces
	if err := s.checkResourcePermission(r.Context(), secCtx, "list", "pods", "", ""); err != nil {
		return &SecurityError{
			Code:    "FORBIDDEN",
			Message: "Insufficient permissions to access logs across all namespaces",
			Status:  http.StatusForbidden,
		}
	}

	return nil
}

// checkResourcePermissionWithSubresource performs SSAR check with subresource
func (s *Server) checkResourcePermissionWithSubresource(ctx context.Context, secCtx *SecurityContext, verb, resource, subresource, namespace, name string) error {
	if secCtx.SSARHelper == nil {
		return &SecurityError{
			Code:    "SSAR_UNAVAILABLE",
			Message: "Permission checking unavailable",
			Status:  http.StatusInternalServerError,
		}
	}

	// Check permission using SSAR helper with subresource
	allowed, err := secCtx.SSARHelper.CanPerformActionWithSubresource(
		ctx,
		secCtx.Client,
		verb,
		"", // group - empty for core resources
		resource,
		subresource,
		namespace,
		name,
	)

	if err != nil {
		secCtx.Logger.Error("SSAR check failed",
			zap.Error(err),
			zap.String("user", secCtx.User.Email),
			zap.String("verb", verb),
			zap.String("resource", resource),
			zap.String("subresource", subresource),
			zap.String("namespace", namespace))
		return &SecurityError{
			Code:    "PERMISSION_CHECK_FAILED",
			Message: "Failed to check permissions",
			Status:  http.StatusInternalServerError,
		}
	}

	if !allowed {
		secCtx.Logger.Info("Permission denied for log access",
			zap.String("user", secCtx.User.Email),
			zap.String("verb", verb),
			zap.String("resource", resource),
			zap.String("subresource", subresource),
			zap.String("namespace", namespace),
			zap.String("name", name))

		permissionMsg := fmt.Sprintf("Insufficient permissions to %s %s/%s", verb, resource, subresource)
		if namespace != "" {
			permissionMsg += fmt.Sprintf(" in namespace %s", namespace)
		}

		return &SecurityError{
			Code:    "FORBIDDEN",
			Message: permissionMsg,
			Status:  http.StatusForbidden,
		}
	}

	return nil
}

// streamLogsAsCSV streams log entries as CSV
func (s *Server) streamLogsAsCSV(w http.ResponseWriter, entries []logs.LogEntry) {
	writer := csv.NewWriter(w)
	defer writer.Flush()

	// Write header
	header := []string{"timestamp", "level", "cluster", "namespace", "workload", "pod", "container", "node", "message", "trace_id", "span_id"}
	if err := writer.Write(header); err != nil {
		s.logger.Error("Failed to write CSV header", zap.Error(err))
		return
	}

	// Write entries
	for _, entry := range entries {
		record := []string{
			entry.TS.Format(time.RFC3339Nano),
			entry.Level,
			entry.Cluster,
			entry.Namespace,
			entry.Workload,
			entry.Pod,
			entry.Container,
			entry.Node,
			entry.Msg,
			entry.TraceID,
			entry.SpanID,
		}
		if err := writer.Write(record); err != nil {
			s.logger.Error("Failed to write CSV record", zap.Error(err))
			return
		}
	}
}

// streamLogsAsCSVChunked streams log entries as CSV with chunking and cancellation support
func (s *Server) streamLogsAsCSVChunked(w http.ResponseWriter, r *http.Request, entries []logs.LogEntry, degraded bool) {
	writer := csv.NewWriter(w)
	defer writer.Flush()

	// Write header
	header := []string{"timestamp", "level", "cluster", "namespace", "workload", "pod", "container", "node", "message", "trace_id", "span_id"}
	if err := writer.Write(header); err != nil {
		s.logger.Error("Failed to write CSV header", zap.Error(err))
		return
	}

	// Determine chunk size based on degraded mode
	chunkSize := 1000
	if degraded {
		chunkSize = 500 // Smaller chunks in degraded mode
	}

	// Process entries in chunks
	for i := 0; i < len(entries); i += chunkSize {
		// Check for client disconnect
		select {
		case <-r.Context().Done():
			s.logger.Info("Export cancelled by client",
				zap.Int("processed", i),
				zap.Int("total", len(entries)))
			return
		default:
		}

		// Process chunk
		end := i + chunkSize
		if end > len(entries) {
			end = len(entries)
		}

		for j := i; j < end; j++ {
			entry := entries[j]
			record := []string{
				entry.TS.Format(time.RFC3339Nano),
				entry.Level,
				entry.Cluster,
				entry.Namespace,
				entry.Workload,
				entry.Pod,
				entry.Container,
				entry.Node,
				entry.Msg,
				entry.TraceID,
				entry.SpanID,
			}
			if err := writer.Write(record); err != nil {
				s.logger.Error("Failed to write CSV record", zap.Error(err))
				return
			}
		}

		// Flush after each chunk to enable streaming
		writer.Flush()

		// Add small delay in degraded mode to prevent overwhelming client
		if degraded && i+chunkSize < len(entries) {
			time.Sleep(10 * time.Millisecond)
		}
	}
}

// streamLogsAsJSON streams log entries as JSON
func (s *Server) streamLogsAsJSON(w http.ResponseWriter, entries []logs.LogEntry) {
	encoder := json.NewEncoder(w)
	encoder.SetIndent("", "  ")

	response := map[string]interface{}{
		"data":   entries,
		"count":  len(entries),
		"format": "json",
	}

	if err := encoder.Encode(response); err != nil {
		s.logger.Error("Failed to encode JSON response", zap.Error(err))
	}
}

// streamLogsAsJSONChunked streams log entries as JSON with chunking and cancellation support
func (s *Server) streamLogsAsJSONChunked(w http.ResponseWriter, r *http.Request, entries []logs.LogEntry, degraded bool) {
	// For JSON streaming, we'll use JSONL (JSON Lines) format for large datasets
	// This allows streaming line by line instead of building a large JSON array

	if len(entries) <= 1000 && !degraded {
		// Small datasets can use regular JSON
		s.streamLogsAsJSON(w, entries)
		return
	}

	// For large datasets, use JSONL format with metadata header
	w.Header().Set("Content-Type", "application/x-jsonlines")

	// Write metadata header
	metadata := map[string]interface{}{
		"type":     "metadata",
		"count":    len(entries),
		"format":   "jsonl",
		"degraded": degraded,
	}
	if err := json.NewEncoder(w).Encode(metadata); err != nil {
		s.logger.Error("Failed to write JSON metadata", zap.Error(err))
		return
	}

	// Determine chunk size
	chunkSize := 1000
	if degraded {
		chunkSize = 500
	}

	// Process entries in chunks
	for i := 0; i < len(entries); i += chunkSize {
		// Check for client disconnect
		select {
		case <-r.Context().Done():
			s.logger.Info("Export cancelled by client",
				zap.Int("processed", i),
				zap.Int("total", len(entries)))
			return
		default:
		}

		// Process chunk
		end := i + chunkSize
		if end > len(entries) {
			end = len(entries)
		}

		encoder := json.NewEncoder(w)
		for j := i; j < end; j++ {
			entry := entries[j]
			logLine := map[string]interface{}{
				"type": "log",
				"data": entry,
			}
			if err := encoder.Encode(logLine); err != nil {
				s.logger.Error("Failed to write JSON log line", zap.Error(err))
				return
			}
		}

		// Flush the writer if it supports flushing
		if flusher, ok := w.(http.Flusher); ok {
			flusher.Flush()
		}

		// Add small delay in degraded mode
		if degraded && i+chunkSize < len(entries) {
			time.Sleep(10 * time.Millisecond)
		}
	}

	// Write completion marker
	completion := map[string]interface{}{
		"type":     "complete",
		"exported": len(entries),
	}
	if err := json.NewEncoder(w).Encode(completion); err != nil {
		s.logger.Error("Failed to write completion marker", zap.Error(err))
	}
}

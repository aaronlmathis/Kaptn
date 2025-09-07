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

	// Execute replay query
	entries := s.logsCacheService.Replay(filter)

	// Log audit event
	s.logAuditEvent(r, secCtx.User, "get", "pods/log", filter.Namespace, filter.Pod, "ALLOWED", nil)

	// Set response headers based on format
	if format == "csv" {
		w.Header().Set("Content-Type", "text/csv")
		w.Header().Set("Content-Disposition", "attachment; filename=logs.csv")
		s.streamLogsAsCSV(w, entries)
	} else {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Content-Disposition", "attachment; filename=logs.json")
		s.streamLogsAsJSON(w, entries)
	}

	s.logger.Info("Served log export request",
		zap.String("user", secCtx.User.Email),
		zap.String("namespace", filter.Namespace),
		zap.String("format", format),
		zap.Int("result_count", len(entries)))
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
		} else {
			return filter, fmt.Errorf("invalid since parameter: %s", since)
		}
	}

	if until := r.URL.Query().Get("until"); until != "" {
		if parsedTime, err := time.Parse(time.RFC3339, until); err == nil {
			filter.Until = parsedTime
		} else if duration, err := time.ParseDuration(until); err == nil {
			filter.Until = time.Now().Add(-duration)
		} else {
			return filter, fmt.Errorf("invalid until parameter: %s", until)
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
	}

	// Parse text search
	filter.Text = r.URL.Query().Get("q")

	// Parse limit
	if limitStr := r.URL.Query().Get("limit"); limitStr != "" {
		if limit, err := strconv.Atoi(limitStr); err == nil && limit > 0 {
			// Cap at 5000 to prevent memory issues
			if limit > 5000 {
				limit = 5000
			}
			filter.Limit = limit
		} else {
			return filter, fmt.Errorf("invalid limit parameter: %s", limitStr)
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

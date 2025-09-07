package server

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"go.uber.org/zap"

	"github.com/aaronlmathis/kaptn/internal/logs"
)

// Phase 10: Administrative handlers for logs cache operational guardrails

// HandleLogsCacheClearRings clears all log cache rings (admin only)
func (s *Server) HandleLogsCacheClearRings(w http.ResponseWriter, r *http.Request) {
	// Get security context for auditing
	secCtx, err := s.getSecurityContext(r)
	if err != nil {
		s.logger.Error("Security context error", zap.Error(err))
		s.writeSecurityError(w, &SecurityError{
			Code:    "SECURITY_CONTEXT_ERROR",
			Message: "Failed to get security context",
			Status:  http.StatusInternalServerError,
		}, nil)
		return
	}

	if s.logsCacheService == nil {
		http.Error(w, "Logs cache service not available", http.StatusServiceUnavailable)
		return
	}

	// Clear the rings
	if err := s.logsCacheService.AdminClearRings(); err != nil {
		s.logger.Error("Failed to clear log cache rings", zap.Error(err))
		http.Error(w, fmt.Sprintf("Failed to clear rings: %v", err), http.StatusInternalServerError)
		return
	}

	// Log audit event
	s.logAuditEvent(r, secCtx.User, "delete", "logs-cache/rings", "", "", "ALLOWED", nil)

	s.logger.Info("Log cache rings cleared by admin",
		zap.String("user", secCtx.User.Sub),
		zap.String("email", secCtx.User.Email))

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":    "success",
		"message":   "All log cache rings cleared successfully",
		"timestamp": time.Now(),
	})
}

// HandleLogsCacheDumpStats returns detailed administrative statistics
func (s *Server) HandleLogsCacheDumpStats(w http.ResponseWriter, r *http.Request) {
	// Get security context for auditing
	secCtx, err := s.getSecurityContext(r)
	if err != nil {
		s.logger.Error("Security context error", zap.Error(err))
		s.writeSecurityError(w, &SecurityError{
			Code:    "SECURITY_CONTEXT_ERROR",
			Message: "Failed to get security context",
			Status:  http.StatusInternalServerError,
		}, nil)
		return
	}

	if s.logsCacheService == nil {
		http.Error(w, "Logs cache service not available", http.StatusServiceUnavailable)
		return
	}

	// Get detailed stats
	stats := s.logsCacheService.AdminGetDetailedStats()

	// Log audit event
	s.logAuditEvent(r, secCtx.User, "get", "logs-cache/stats", "", "", "ALLOWED", nil)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":    "success",
		"data":      stats,
		"timestamp": time.Now(),
	})
}

// HandleLogsCacheListStreams returns information about active log streams
func (s *Server) HandleLogsCacheListStreams(w http.ResponseWriter, r *http.Request) {
	// Get security context for auditing
	secCtx, err := s.getSecurityContext(r)
	if err != nil {
		s.logger.Error("Security context error", zap.Error(err))
		s.writeSecurityError(w, &SecurityError{
			Code:    "SECURITY_CONTEXT_ERROR",
			Message: "Failed to get security context",
			Status:  http.StatusInternalServerError,
		}, nil)
		return
	}

	if s.logsCacheService == nil {
		http.Error(w, "Logs cache service not available", http.StatusServiceUnavailable)
		return
	}

	// Get active streams
	streams := s.logsCacheService.AdminListActiveStreams()

	// Log audit event
	s.logAuditEvent(r, secCtx.User, "get", "logs-cache/streams", "", "", "ALLOWED", nil)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":    "success",
		"data":      streams,
		"count":     len(streams),
		"timestamp": time.Now(),
	})
}

// HandleLogsCacheSetLimits updates operational limits for the logs cache
func (s *Server) HandleLogsCacheSetLimits(w http.ResponseWriter, r *http.Request) {
	// Get security context for auditing
	secCtx, err := s.getSecurityContext(r)
	if err != nil {
		s.logger.Error("Security context error", zap.Error(err))
		s.writeSecurityError(w, &SecurityError{
			Code:    "SECURITY_CONTEXT_ERROR",
			Message: "Failed to get security context",
			Status:  http.StatusInternalServerError,
		}, nil)
		return
	}

	if s.logsCacheService == nil {
		http.Error(w, "Logs cache service not available", http.StatusServiceUnavailable)
		return
	}

	// Parse request body or query parameters
	var limits logs.AdminLimits

	// Try to parse from JSON body first
	if r.Header.Get("Content-Type") == "application/json" {
		if err := json.NewDecoder(r.Body).Decode(&limits); err != nil {
			http.Error(w, fmt.Sprintf("Invalid JSON: %v", err), http.StatusBadRequest)
			return
		}
	} else {
		// Parse from query parameters
		currentLimits := s.logsCacheService.AdminGetCurrentLimits()
		limits = currentLimits // Start with current values

		if val := r.URL.Query().Get("max_subscribers"); val != "" {
			if parsed, err := strconv.Atoi(val); err == nil {
				limits.MaxSubscribers = parsed
			}
		}
		if val := r.URL.Query().Get("max_buffer_size"); val != "" {
			if parsed, err := strconv.Atoi(val); err == nil {
				limits.MaxBufferSize = parsed
			}
		}
		if val := r.URL.Query().Get("max_query_limit"); val != "" {
			if parsed, err := strconv.Atoi(val); err == nil {
				limits.MaxQueryLimit = parsed
			}
		}
		if val := r.URL.Query().Get("backpressure_threshold"); val != "" {
			if parsed, err := strconv.Atoi(val); err == nil {
				limits.BackpressureThreshold = parsed
			}
		}
		if val := r.URL.Query().Get("degraded_mode_timeout"); val != "" {
			if parsed, err := time.ParseDuration(val); err == nil {
				limits.DegradedModeTimeout = parsed
			}
		}
	}

	// Update limits
	if err := s.logsCacheService.AdminUpdateLimits(limits); err != nil {
		s.logger.Error("Failed to update log cache limits", zap.Error(err))
		http.Error(w, fmt.Sprintf("Failed to update limits: %v", err), http.StatusBadRequest)
		return
	}

	// Log audit event
	s.logAuditEvent(r, secCtx.User, "update", "logs-cache/limits", "", "", "ALLOWED", nil)

	s.logger.Info("Log cache limits updated by admin",
		zap.String("user", secCtx.User.Sub),
		zap.String("email", secCtx.User.Email),
		zap.Any("new_limits", limits))

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":     "success",
		"message":    "Limits updated successfully",
		"new_limits": limits,
		"timestamp":  time.Now(),
	})
}

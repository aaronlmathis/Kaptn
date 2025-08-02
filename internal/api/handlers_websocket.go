package api

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
)

// WebSocket handlers

func (s *Server) handleNodesWebSocket(w http.ResponseWriter, r *http.Request) {
	s.wsHub.ServeWS(w, r, "nodes")
}

func (s *Server) handlePodsWebSocket(w http.ResponseWriter, r *http.Request) {
	s.wsHub.ServeWS(w, r, "pods")
}

func (s *Server) handleOverviewWebSocket(w http.ResponseWriter, r *http.Request) {
	s.wsHub.ServeWS(w, r, "overview")
}

func (s *Server) handleLogsWebSocket(w http.ResponseWriter, r *http.Request) {
	streamID := chi.URLParam(r, "streamId")
	if streamID == "" {
		http.Error(w, "Stream ID is required", http.StatusBadRequest)
		return
	}

	// TODO: Implement log streaming WebSocket handler
	http.Error(w, "Not implemented", http.StatusNotImplemented)
}

func (s *Server) handleStartLogStream(w http.ResponseWriter, r *http.Request) {
	// TODO: Implement log stream start handler
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusNotImplemented)
	json.NewEncoder(w).Encode(map[string]string{"error": "Not implemented"})
}

func (s *Server) handleStopLogStream(w http.ResponseWriter, r *http.Request) {
	streamID := chi.URLParam(r, "streamId")
	if streamID == "" {
		http.Error(w, "Stream ID is required", http.StatusBadRequest)
		return
	}

	// TODO: Implement log stream stop handler
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusNotImplemented)
	json.NewEncoder(w).Encode(map[string]string{"error": "Not implemented"})
}

func (s *Server) handleJobWebSocket(w http.ResponseWriter, r *http.Request) {
	jobID := chi.URLParam(r, "jobId")
	if jobID == "" {
		http.Error(w, "Job ID is required", http.StatusBadRequest)
		return
	}

	// Check if job exists
	if _, exists := s.actionsService.GetJob(jobID); !exists {
		http.Error(w, "Job not found", http.StatusNotFound)
		return
	}

	s.wsHub.ServeWS(w, r, "job:"+jobID)
}

func (s *Server) handleExecWebSocket(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "sessionId")
	if sessionID == "" {
		http.Error(w, "Session ID is required", http.StatusBadRequest)
		return
	}

	// TODO: Implement exec WebSocket handler
	http.Error(w, "Not implemented", http.StatusNotImplemented)
}

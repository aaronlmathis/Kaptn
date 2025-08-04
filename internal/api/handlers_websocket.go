package api

import (
	"encoding/json"
	"net/http"

	"github.com/aaronlmathis/kaptn/internal/k8s/exec"
	"github.com/go-chi/chi/v5"
	"go.uber.org/zap"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
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

	// Parse query parameters
	namespace := r.URL.Query().Get("namespace")
	podName := r.URL.Query().Get("pod")
	containerName := r.URL.Query().Get("container")
	commandStr := r.URL.Query().Get("command")
	ttyStr := r.URL.Query().Get("tty")

	if namespace == "" || podName == "" {
		http.Error(w, "namespace and pod are required", http.StatusBadRequest)
		return
	}

	// Default container name if not specified or auto-detect first container
	if containerName == "" {
		// Try to get the first container from the pod
		pod, err := s.kubeClient.CoreV1().Pods(namespace).Get(r.Context(), podName, metav1.GetOptions{})
		if err != nil {
			s.logger.Error("Failed to get pod for container detection",
				zap.String("namespace", namespace),
				zap.String("pod", podName),
				zap.Error(err))
			http.Error(w, "Failed to get pod information for container detection", http.StatusInternalServerError)
			return
		} else if len(pod.Spec.Containers) > 0 {
			containerName = pod.Spec.Containers[0].Name // use first container
			s.logger.Info("Auto-detected container",
				zap.String("pod", podName),
				zap.String("container", containerName))
		} else {
			s.logger.Error("Pod has no containers",
				zap.String("namespace", namespace),
				zap.String("pod", podName))
			http.Error(w, "Pod has no containers", http.StatusBadRequest)
			return
		}
	}

	// Default command if not specified - let the exec service handle shell detection
	var command []string
	if commandStr != "" {
		command = []string{commandStr}
	} else {
		// Let the exec service handle shell detection by passing empty command
		command = []string{}
	}

	// Parse TTY parameter
	tty := ttyStr == "true"

	// Create exec request
	execReq := exec.ExecRequest{
		Namespace: namespace,
		Pod:       podName,
		Container: containerName,
		Command:   command,
		TTY:       tty,
	}

	// Start exec session
	err := s.execService.StartExecSession(w, r, sessionID, execReq)
	if err != nil {
		s.logger.Error("Failed to start exec session",
			zap.String("sessionID", sessionID),
			zap.String("namespace", namespace),
			zap.String("pod", podName),
			zap.String("container", containerName),
			zap.Error(err))
		http.Error(w, "Failed to start exec session", http.StatusInternalServerError)
		return
	}
}

package api

import (
	"fmt"
	"net/http"

	"github.com/aaronlmathis/kaptn/internal/k8s"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/kubernetes"
)

// GetImpersonatedClient returns the impersonated Kubernetes client from request context
func (s *Server) GetImpersonatedClient(r *http.Request) (kubernetes.Interface, error) {
	clients, ok := k8s.ImpersonatedClientsFromContext(r.Context())
	if !ok {
		return nil, fmt.Errorf("no impersonated clients found in request context")
	}
	return clients.Client(), nil
}

// GetImpersonatedDynamicClient returns the impersonated dynamic client from request context
func (s *Server) GetImpersonatedDynamicClient(r *http.Request) (dynamic.Interface, error) {
	clients, ok := k8s.ImpersonatedClientsFromContext(r.Context())
	if !ok {
		return nil, fmt.Errorf("no impersonated clients found in request context")
	}
	return clients.DynamicClient(), nil
}

// GetImpersonatedClients returns all impersonated clients from request context
func (s *Server) GetImpersonatedClients(r *http.Request) (*k8s.ImpersonatedClients, error) {
	clients, ok := k8s.ImpersonatedClientsFromContext(r.Context())
	if !ok {
		return nil, fmt.Errorf("no impersonated clients found in request context")
	}
	return clients, nil
}

// HasImpersonatedClients checks if impersonated clients are available in the request context
func (s *Server) HasImpersonatedClients(r *http.Request) bool {
	_, ok := k8s.ImpersonatedClientsFromContext(r.Context())
	return ok
}

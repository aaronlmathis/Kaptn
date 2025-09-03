// package server

// import (
// 	"encoding/json"
// 	"net/http"
// 	"time"

// 	"github.com/aaronlmathis/kaptn/internal/auth"
// 	"go.uber.org/zap"
// )

// // Admin handlers (Admin tier)
// // Moved from internal/api/handlers_admin.go and other admin-specific handlers with exported method names

// // HandleBindingsReload forces a reload of the user bindings store (if applicable)
// func (s *Server) HandleBindingsReload(w http.ResponseWriter, r *http.Request) {
// 	// Get authenticated user
// 	user, ok := auth.UserFromContext(r.Context())
// 	if !ok || user == nil {
// 		http.Error(w, "Authentication required", http.StatusUnauthorized)
// 		return
// 	}

// 	// Log the reload attempt
// 	s.logger.Info("User bindings reload requested",
// 		zap.String("user_sub", user.Sub),
// 		zap.String("user_email", user.Email),
// 		zap.String("request_path", r.URL.Path),
// 		zap.String("remote_addr", r.RemoteAddr))

// 	// Build reload result - this is a placeholder for actual store reload functionality
// 	reloadResult := map[string]interface{}{
// 		"status":    "success",
// 		"message":   "Bindings store reload functionality not yet implemented",
// 		"timestamp": time.Now().UTC(),
// 		"mode":      s.config.Authz.Mode,
// 		"note":      "This endpoint is ready for integration with actual bindings store",
// 	}

// 	s.logger.Info("User bindings reload completed",
// 		zap.String("user_email", user.Email),
// 		zap.String("authz_mode", s.config.Authz.Mode))

// 	w.Header().Set("Content-Type", "application/json")
// 	json.NewEncoder(w).Encode(reloadResult)
// }

// // Additional admin handlers will be added here as dependencies are resolved
// // TODO: Move remaining admin handlers from handlers_admin.go, handlers_impersonation.go, etc.

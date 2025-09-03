package future_do_not_use

// import (
// 	"encoding/json"
// 	"net/http"

// 	"github.com/aaronlmathis/kaptn/internal/version"
// )

// // System handlers (System tier)
// // Moved from internal/api/handlers_system.go with exported method names

// func (s *Server) HandleHealth(w http.ResponseWriter, r *http.Request) {
// 	w.Header().Set("Content-Type", "application/json")
// 	w.WriteHeader(http.StatusOK)
// 	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
// }

// func (s *Server) HandleReady(w http.ResponseWriter, r *http.Request) {
// 	w.Header().Set("Content-Type", "application/json")
// 	w.WriteHeader(http.StatusOK)
// 	json.NewEncoder(w).Encode(map[string]string{"status": "ready"})
// }

// func (s *Server) HandleVersion(w http.ResponseWriter, r *http.Request) {
// 	w.Header().Set("Content-Type", "application/json")
// 	w.WriteHeader(http.StatusOK)
// 	json.NewEncoder(w).Encode(version.Get())
// }

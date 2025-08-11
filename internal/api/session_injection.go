package api

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/aaronlmathis/kaptn/internal/auth"
	"go.uber.org/zap"
)

// SessionInjectionHandler handles static file serving with session injection
type SessionInjectionHandler struct {
	logger         *zap.Logger
	filesDir       http.Dir
	authMode       string
	sessionManager *auth.SessionManager
}

// NewSessionInjectionHandler creates a new session injection handler
func NewSessionInjectionHandler(logger *zap.Logger, filesDir http.Dir, authMode string, sessionManager *auth.SessionManager) *SessionInjectionHandler {
	return &SessionInjectionHandler{
		logger:         logger,
		filesDir:       filesDir,
		authMode:       authMode,
		sessionManager: sessionManager,
	}
}

// ServeHTTP implements http.Handler
func (h *SessionInjectionHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// Get the file path
	upath := r.URL.Path
	if !strings.HasPrefix(upath, "/") {
		upath = "/" + upath
	}

	// Clean the path
	upath = filepath.Clean(upath)

	// If it's a directory request, serve index.html
	if strings.HasSuffix(upath, "/") {
		upath = upath + "index.html"
	}

	// Convert to file system path
	fsPath := string(h.filesDir) + upath

	// Check if file exists
	info, err := os.Stat(fsPath)
	if err != nil {
		// If file doesn't exist and it's not an HTML file, try index.html for SPA routing
		if !strings.HasSuffix(upath, ".html") && !strings.Contains(upath, ".") {
			h.serveWithSessionInjection(w, r, string(h.filesDir)+"/index.html")
			return
		}
		http.NotFound(w, r)
		return
	}

	// If it's a directory, try to serve index.html from it
	if info.IsDir() {
		indexPath := filepath.Join(fsPath, "index.html")
		if _, err := os.Stat(indexPath); err == nil {
			h.serveWithSessionInjection(w, r, indexPath)
			return
		}
		http.NotFound(w, r)
		return
	}

	// If it's an HTML file, inject session data
	if strings.HasSuffix(upath, ".html") {
		h.serveWithSessionInjection(w, r, fsPath)
		return
	}

	// For non-HTML files, serve directly
	http.ServeFile(w, r, fsPath)
}

// serveWithSessionInjection serves an HTML file with session data injected
func (h *SessionInjectionHandler) serveWithSessionInjection(w http.ResponseWriter, r *http.Request, filePath string) {
	// Read the HTML file
	file, err := os.Open(filePath)
	if err != nil {
		h.logger.Error("Failed to open HTML file", zap.String("path", filePath), zap.Error(err))
		http.NotFound(w, r)
		return
	}
	defer file.Close()

	content, err := io.ReadAll(file)
	if err != nil {
		h.logger.Error("Failed to read HTML file", zap.String("path", filePath), zap.Error(err))
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}

	// Get session data
	sessionData := h.getSessionData(r)

	// Get CSP nonce from context
	nonce := ""
	if nonceValue := r.Context().Value(auth.CSPNonceKey{}); nonceValue != nil {
		if nonceStr, ok := nonceValue.(string); ok {
			nonce = nonceStr
			h.logger.Info("Found CSP nonce in context", zap.String("nonce", nonce))
		} else {
			h.logger.Warn("CSP nonce in context is not a string", zap.Any("value", nonceValue))
		}
	} else {
		h.logger.Warn("No CSP nonce found in request context")
	}

	// Inject session data into HTML
	injectedContent := h.injectSessionData(string(content), sessionData, nonce)

	// Set headers
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
	w.Header().Set("Pragma", "no-cache")
	w.Header().Set("Expires", "0")

	// Write the content
	w.Write([]byte(injectedContent))
}

// getSessionData extracts minimal session data from the request
func (h *SessionInjectionHandler) getSessionData(r *http.Request) *auth.MinimalUser {
	// Default unauthenticated user
	sessionData := &auth.MinimalUser{
		IsAuthenticated: false,
	}

	// If auth mode is none, return a dev user
	if h.authMode == "none" {
		sessionData.IsAuthenticated = true
		sessionData.ID = "dev-user"
		sessionData.Email = "dev@localhost"
		sessionData.Name = "Development User"
		return sessionData
	}

	// Use session manager to securely validate tokens and extract user data
	if h.sessionManager != nil {
		return h.sessionManager.GetMinimalUserFromRequest(r)
	}

	return sessionData
}

// injectSessionData injects session data into HTML content with CSP nonce
func (h *SessionInjectionHandler) injectSessionData(content string, sessionData *auth.MinimalUser, nonce string) string {
	// Add auth mode to the injected data
	sessionWithMode := map[string]interface{}{
		"id":              sessionData.ID,
		"email":           sessionData.Email,
		"name":            sessionData.Name,
		"isAuthenticated": sessionData.IsAuthenticated,
		"authMode":        h.authMode,
	}

	// Convert session data to JSON
	sessionJSON, err := json.Marshal(sessionWithMode)
	if err != nil {
		h.logger.Error("Failed to marshal session data", zap.Error(err))
		sessionJSON = []byte(fmt.Sprintf(`{"isAuthenticated":false,"authMode":"%s"}`, h.authMode))
	}

	// Create the injection script with CSP nonce
	injectionScript := fmt.Sprintf(`
<script nonce="%s">
	// Kaptn session data injected by server
	window.__KAPTN_SESSION__ = %s;
</script>`, nonce, string(sessionJSON))

	h.logger.Info("Injecting session script",
		zap.String("nonce", nonce),
		zap.String("sessionData", string(sessionJSON)),
		zap.String("script", injectionScript))

	// Find a good place to inject the script (before </head> or at the start of <body>)
	if strings.Contains(content, "</head>") {
		return strings.Replace(content, "</head>", injectionScript+"\n</head>", 1)
	} else if strings.Contains(content, "<body>") {
		return strings.Replace(content, "<body>", "<body>\n"+injectionScript, 1)
	} else if strings.Contains(content, "<html>") {
		return strings.Replace(content, "<html>", "<html>\n"+injectionScript, 1)
	}

	// Fallback: prepend to content
	return injectionScript + "\n" + content
}

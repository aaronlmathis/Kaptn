package routes

// ServerDeps represents the minimal interface needed for route handlers
// This is temporary - in later PRs we'll narrow this to specific interfaces per route group
type ServerDeps interface {
	// This will contain all the handler methods from Server
	// For now, we'll use the concrete Server type to avoid method duplication
}

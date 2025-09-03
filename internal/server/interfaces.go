package server

import (
	"github.com/aaronlmathis/kaptn/internal/api/routes"
)

// Verify that Server implements the route contracts
var _ routes.PublicHandlers = (*Server)(nil)
var _ routes.AdminHandlers = (*Server)(nil)
var _ routes.SystemHandlers = (*Server)(nil)

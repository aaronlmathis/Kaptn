package server

import (
	"github.com/aaronlmathis/kaptn/internal/api/routes"
)

// Verify that Server implements ALL the route contracts
var _ routes.PublicHandlers = (*Server)(nil)
var _ routes.AdminHandlers = (*Server)(nil)
var _ routes.ReadHandlers = (*Server)(nil)
var _ routes.WriteHandlers = (*Server)(nil)
var _ routes.ApplyHandlers = (*Server)(nil)
var _ routes.SystemHandlers = (*Server)(nil)
var _ routes.StaticHandlers = (*Server)(nil)

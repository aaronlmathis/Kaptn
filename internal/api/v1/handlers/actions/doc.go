// Package actions provides parsers and utilities for handling Kubernetes resource actions.
//
// This package contains the action parsing logic that was previously scattered
// across different handler files. It provides a clean interface for parsing
// action strings into resource types and verbs.
//
// The main components are:
//   - Parser interface for parsing action strings
//   - DefaultParser implementation with resource-scoped parsing methods
//   - Comprehensive test coverage for all supported actions
//
// Example usage:
//
//	parser := actions.NewDefaultParser()
//	resource, verb := parser.Parse("restart-pods")
//	// resource = "pods", verb = "update"
package actions

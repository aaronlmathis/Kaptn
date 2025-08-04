package api

import (
	"context"
	"fmt"

	"github.com/aaronlmathis/kaptn/internal/auth"
)

// Utility functions

// getUserFromContext extracts the user information from the request context
func getUserFromContext(ctx context.Context) (*auth.User, bool) {
	return auth.UserFromContext(ctx)
}

// parseIntParam safely parses an integer parameter from a string
func parseIntParam(param string, defaultValue int) int {
	if param == "" {
		return defaultValue
	}

	// Simple integer parsing (can be enhanced with proper error handling)
	var result int
	if _, err := fmt.Sscanf(param, "%d", &result); err != nil {
		return defaultValue
	}
	return result
}

// parseBoolParam safely parses a boolean parameter from a string
func parseBoolParam(param string, defaultValue bool) bool {
	switch param {
	case "true", "1", "yes":
		return true
	case "false", "0", "no":
		return false
	default:
		return defaultValue
	}
}

// validateNamespace checks if a namespace name is valid
func validateNamespace(namespace string) error {
	if namespace == "" {
		return fmt.Errorf("namespace cannot be empty")
	}
	if len(namespace) > 63 {
		return fmt.Errorf("namespace name too long (max 63 characters)")
	}
	// Add more validation rules as needed
	return nil
}

// validateResourceName checks if a resource name is valid
func validateResourceName(name string) error {
	if name == "" {
		return fmt.Errorf("resource name cannot be empty")
	}
	if len(name) > 253 {
		return fmt.Errorf("resource name too long (max 253 characters)")
	}
	// Add more validation rules as needed
	return nil
}

// getPaginationParams extracts pagination parameters from query string
func getPaginationParams(page, limit string) (int, int, int) {
	pageNum := parseIntParam(page, 1)
	if pageNum < 1 {
		pageNum = 1
	}

	limitNum := parseIntParam(limit, 50)
	if limitNum < 1 {
		limitNum = 50
	}
	if limitNum > 1000 {
		limitNum = 1000 // Max limit to prevent abuse
	}

	offset := (pageNum - 1) * limitNum

	return pageNum, limitNum, offset
}

// containsString checks if a slice contains a specific string
func containsString(slice []string, item string) bool {
	for _, s := range slice {
		if s == item {
			return true
		}
	}
	return false
}

// removeString removes a string from a slice
func removeString(slice []string, item string) []string {
	result := make([]string, 0, len(slice))
	for _, s := range slice {
		if s != item {
			result = append(result, s)
		}
	}
	return result
}

// mergeMaps merges two string maps, with the second map taking precedence
func mergeMaps(map1, map2 map[string]string) map[string]string {
	result := make(map[string]string)

	// Copy first map
	for k, v := range map1 {
		result[k] = v
	}

	// Override with second map
	for k, v := range map2 {
		result[k] = v
	}

	return result
}

// sanitizeString removes potentially dangerous characters from user input
func sanitizeString(input string) string {
	// Basic sanitization - can be enhanced based on security requirements
	if len(input) > 1000 {
		input = input[:1000]
	}
	// Remove null bytes
	result := ""
	for _, r := range input {
		if r != 0 {
			result += string(r)
		}
	}
	return result
}

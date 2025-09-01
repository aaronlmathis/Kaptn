package utils

import (
	"strings"
)

// SearchOptions represents search and filtering options
type SearchOptions struct {
	Search    string
	Namespace string
}

// ContainsIgnoreCase performs case-insensitive substring search
func ContainsIgnoreCase(text, search string) bool {
	if search == "" {
		return true
	}
	return strings.Contains(strings.ToLower(text), strings.ToLower(search))
}

// MatchesSearch checks if any of the provided text fields match the search term
func MatchesSearch(search string, fields ...string) bool {
	if search == "" {
		return true
	}
	
	searchLower := strings.ToLower(search)
	for _, field := range fields {
		if strings.Contains(strings.ToLower(field), searchLower) {
			return true
		}
	}
	
	return false
}

// FilterBySearch is a generic function to filter a slice based on search criteria
func FilterBySearch[T any](items []T, search string, searchFunc func(T, string) bool) []T {
	if search == "" {
		return items
	}
	
	filtered := make([]T, 0, len(items))
	for _, item := range items {
		if searchFunc(item, search) {
			filtered = append(filtered, item)
		}
	}
	
	return filtered
}

// Package formatters provides common utilities shared across domain formatters
package formatters

import (
	"fmt"
	"time"
)

// Common formatting utilities that can be used across all domain formatters

// CalculateAge calculates a human-readable age string from a creation time
func CalculateAge(creationTime time.Time) string {
	duration := time.Since(creationTime)

	days := int(duration.Hours() / 24)
	if days > 0 {
		return fmt.Sprintf("%dd", days)
	}

	hours := int(duration.Hours())
	if hours > 0 {
		return fmt.Sprintf("%dh", hours)
	}

	minutes := int(duration.Minutes())
	if minutes > 0 {
		return fmt.Sprintf("%dm", minutes)
	}

	return fmt.Sprintf("%ds", int(duration.Seconds()))
}

// FormatConditions converts Kubernetes conditions to a standard response format
func FormatConditions(conditions interface{}) []map[string]string {
	var result []map[string]string

	// This is a placeholder for condition formatting logic
	// Each domain formatter can use this or implement its own version
	// depending on the specific condition structure

	return result
}

// FormatLabelsCount returns the count of labels in a map
func FormatLabelsCount(labels map[string]string) int {
	if labels == nil {
		return 0
	}
	return len(labels)
}

// FormatAnnotationsCount returns the count of annotations in a map
func FormatAnnotationsCount(annotations map[string]string) int {
	if annotations == nil {
		return 0
	}
	return len(annotations)
}

// FormatDataSize converts bytes to a human-readable string
func FormatDataSize(bytes int) string {
	if bytes < 1024 {
		return fmt.Sprintf("%d B", bytes)
	} else if bytes < 1024*1024 {
		return fmt.Sprintf("%.1f KB", float64(bytes)/1024)
	} else {
		return fmt.Sprintf("%.1f MB", float64(bytes)/(1024*1024))
	}
}

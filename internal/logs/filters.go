package logs

import (
	"strings"
	"time"
)

// FilterOptions represents options for compiling filters
type FilterOptions struct {
	DefaultLimit     int
	MaxLimit         int
	DefaultDirection string
}

// DefaultFilterOptions returns sensible defaults
func DefaultFilterOptions() FilterOptions {
	return FilterOptions{
		DefaultLimit:     1000,
		MaxLimit:         5000,
		DefaultDirection: "backward",
	}
}

// CompileFilter takes query parameters and creates an optimized LogFilter
func CompileFilter(params map[string]string, opts FilterOptions) LogFilter {
	filter := LogFilter{
		Direction: opts.DefaultDirection,
		Limit:     opts.DefaultLimit,
	}

	// Parse time range
	if since := params["since"]; since != "" {
		if duration, err := time.ParseDuration(since); err == nil {
			filter.Since = time.Now().Add(-duration)
		} else if ts, err := time.Parse(time.RFC3339, since); err == nil {
			filter.Since = ts
		}
	}

	if until := params["until"]; until != "" {
		if ts, err := time.Parse(time.RFC3339, until); err == nil {
			filter.Until = ts
		}
	}

	// Parse levels (comma-separated)
	if levels := params["levels"]; levels != "" {
		filter.Levels = strings.Split(levels, ",")
		// Normalize case
		for i, level := range filter.Levels {
			filter.Levels[i] = strings.TrimSpace(strings.ToUpper(level))
		}
	}

	// Parse scope filters
	filter.Cluster = strings.TrimSpace(params["cluster"])
	filter.Namespace = strings.TrimSpace(params["namespace"])
	filter.Workload = strings.TrimSpace(params["workload"])
	filter.Pod = strings.TrimSpace(params["pod"])

	// Parse text search
	filter.Text = strings.TrimSpace(params["q"])

	// Parse limit
	if limitStr := params["limit"]; limitStr != "" {
		if limit := parseInt(limitStr, opts.DefaultLimit); limit > 0 {
			if limit > opts.MaxLimit {
				filter.Limit = opts.MaxLimit
			} else {
				filter.Limit = limit
			}
		}
	}

	// Parse direction
	if direction := params["direction"]; direction != "" {
		direction = strings.ToLower(strings.TrimSpace(direction))
		if direction == "forward" || direction == "backward" {
			filter.Direction = direction
		}
	}

	return filter
}

// NormalizeLogEntry preprocesses a log entry to compute derived fields
func NormalizeLogEntry(entry LogEntry) LogEntry {
	normalized := entry

	// Normalize level to uppercase
	normalized.Level = strings.ToUpper(strings.TrimSpace(entry.Level))

	// Ensure timestamp is set
	if normalized.TS.IsZero() {
		normalized.TS = time.Now()
	}

	// Compute workload from pod name if not set
	if normalized.Workload == "" && normalized.Pod != "" {
		normalized.Workload = computeWorkloadFromPod(normalized.Pod)
	}

	// Trim whitespace from text fields
	normalized.Namespace = strings.TrimSpace(normalized.Namespace)
	normalized.Pod = strings.TrimSpace(normalized.Pod)
	normalized.Container = strings.TrimSpace(normalized.Container)
	normalized.Node = strings.TrimSpace(normalized.Node)
	normalized.Msg = strings.TrimSpace(normalized.Msg)

	return normalized
}

// computeWorkloadFromPod attempts to derive workload name from pod name
// This is a heuristic and may need refinement based on naming conventions
func computeWorkloadFromPod(podName string) string {
	// Common patterns:
	// deployment-name-1234567890-abcde -> deployment-name
	// statefulset-name-0 -> statefulset-name
	// daemonset-name-abcde -> daemonset-name
	// job-name-abcde -> job-name

	// Split by hyphens and try to find the workload part
	parts := strings.Split(podName, "-")
	if len(parts) < 2 {
		return podName // Can't determine, return as-is
	}

	// For ReplicaSets (deployment pattern): remove last two parts if they look like hash+pod-template-hash
	if len(parts) >= 3 {
		lastPart := parts[len(parts)-1]
		secondLastPart := parts[len(parts)-2]

		// Check if last part is 5 alphanumeric chars (pod-template-hash)
		if len(lastPart) == 5 && isAlphaNumeric(lastPart) {
			// Check if second-to-last part is 10 alphanumeric chars (replica set hash)
			if len(secondLastPart) == 10 && isAlphaNumeric(secondLastPart) {
				// This looks like a deployment pod: deployment-name-1234567890-abcde
				return strings.Join(parts[:len(parts)-2], "-")
			}
		}
	}

	// For StatefulSets: remove last part if it's a number
	if len(parts) >= 2 {
		lastPart := parts[len(parts)-1]
		if isNumeric(lastPart) {
			return strings.Join(parts[:len(parts)-1], "-")
		}
	}

	// For DaemonSets/Jobs: remove last part if it looks like a hash
	if len(parts) >= 2 {
		lastPart := parts[len(parts)-1]
		if len(lastPart) == 5 && isAlphaNumeric(lastPart) {
			return strings.Join(parts[:len(parts)-1], "-")
		}
	}

	// Default: return the pod name as workload
	return podName
}

// parseInt safely parses an integer with a fallback
func parseInt(s string, fallback int) int {
	if s == "" {
		return fallback
	}

	result := 0
	for _, r := range s {
		if r >= '0' && r <= '9' {
			result = result*10 + int(r-'0')
		} else {
			return fallback
		}
	}
	return result
}

// isAlphaNumeric checks if string contains only letters and numbers
func isAlphaNumeric(s string) bool {
	for _, r := range s {
		if !((r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9')) {
			return false
		}
	}
	return true
}

// isNumeric checks if string contains only numbers
func isNumeric(s string) bool {
	if s == "" {
		return false
	}
	for _, r := range s {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}

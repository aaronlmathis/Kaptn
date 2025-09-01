package actions

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"go.uber.org/zap"
)

// AuditLogger provides structured audit logging for actions
type AuditLogger struct {
	logger *zap.Logger
}

// AuditEntry represents a structured audit log entry
type AuditEntry struct {
	// Core fields
	RequestID string    `json:"request_id"`
	TraceID   string    `json:"trace_id,omitempty"`
	Timestamp time.Time `json:"timestamp"`

	// Action details
	Action    string `json:"action"`
	Verb      string `json:"verb"`
	Resource  string `json:"resource"`
	Namespace string `json:"namespace,omitempty"`
	Name      string `json:"name,omitempty"`

	// Actor information
	User       string   `json:"user"`
	UserGroups []string `json:"user_groups,omitempty"`
	SourceIP   string   `json:"source_ip,omitempty"`
	UserAgent  string   `json:"user_agent,omitempty"`

	// Operation details
	Success  bool   `json:"success"`
	Error    string `json:"error,omitempty"`
	DryRun   bool   `json:"dry_run"`
	Duration string `json:"duration,omitempty"`

	// Additional context
	Details     map[string]interface{} `json:"details,omitempty"`
	ClusterName string                 `json:"cluster_name,omitempty"`

	// Safety and compliance
	SafetyViolations     []SafetyViolation `json:"safety_violations,omitempty"`
	RBACChecked          bool              `json:"rbac_checked"`
	ConfirmationRequired bool              `json:"confirmation_required"`
}

// NewAuditLogger creates a new audit logger
func NewAuditLogger(logger *zap.Logger) *AuditLogger {
	return &AuditLogger{
		logger: logger,
	}
}

// LogAction logs an action audit entry
func (al *AuditLogger) LogAction(ctx context.Context, entry *AuditEntry) {
	// Ensure required fields are set
	if entry.RequestID == "" {
		entry.RequestID = uuid.New().String()
	}
	if entry.Timestamp.IsZero() {
		entry.Timestamp = time.Now()
	}
	if entry.TraceID == "" {
		entry.TraceID = getTraceIDFromContext(ctx)
	}

	// Log structured audit entry
	al.logger.Info("Action audit",
		zap.String("audit_type", "action"),
		zap.String("request_id", entry.RequestID),
		zap.String("trace_id", entry.TraceID),
		zap.Time("timestamp", entry.Timestamp),
		zap.String("action", entry.Action),
		zap.String("verb", entry.Verb),
		zap.String("resource", entry.Resource),
		zap.String("namespace", entry.Namespace),
		zap.String("name", entry.Name),
		zap.String("user", entry.User),
		zap.Strings("user_groups", entry.UserGroups),
		zap.String("source_ip", entry.SourceIP),
		zap.Bool("success", entry.Success),
		zap.String("error", entry.Error),
		zap.Bool("dry_run", entry.DryRun),
		zap.String("duration", entry.Duration),
		zap.Bool("rbac_checked", entry.RBACChecked),
		zap.Bool("confirmation_required", entry.ConfirmationRequired),
		zap.Int("safety_violations", len(entry.SafetyViolations)),
		zap.Any("details", entry.Details))

	// If there are safety violations, log them separately for alerting
	if len(entry.SafetyViolations) > 0 {
		al.logSafetyViolations(entry)
	}

	// For failed actions, log additional error context
	if !entry.Success && entry.Error != "" {
		al.logger.Error("Action failed",
			zap.String("request_id", entry.RequestID),
			zap.String("action", entry.Action),
			zap.String("resource", fmt.Sprintf("%s/%s", entry.Namespace, entry.Name)),
			zap.String("user", entry.User),
			zap.String("error", entry.Error))
	}
}

// LogBulkAction logs a bulk action audit entry
func (al *AuditLogger) LogBulkAction(ctx context.Context, action, verb string, targets []TargetResource, user string, success bool, errorMsg string, duration time.Duration, details map[string]interface{}) {
	entry := &AuditEntry{
		RequestID:   uuid.New().String(),
		TraceID:     getTraceIDFromContext(ctx),
		Timestamp:   time.Now(),
		Action:      fmt.Sprintf("bulk_%s", action),
		Verb:        verb,
		Resource:    "multiple",
		User:        user,
		Success:     success,
		Error:       errorMsg,
		Duration:    duration.String(),
		Details:     details,
		RBACChecked: true,
	}

	// Add bulk-specific details
	if entry.Details == nil {
		entry.Details = make(map[string]interface{})
	}
	entry.Details["target_count"] = len(targets)
	entry.Details["targets"] = al.summarizeTargets(targets)

	al.LogAction(ctx, entry)
}

// LogSecurityEvent logs security-related events
func (al *AuditLogger) LogSecurityEvent(ctx context.Context, eventType, description, user string, severity string, details map[string]interface{}) {
	al.logger.Warn("Security event",
		zap.String("audit_type", "security"),
		zap.String("event_type", eventType),
		zap.String("description", description),
		zap.String("user", user),
		zap.String("severity", severity),
		zap.String("trace_id", getTraceIDFromContext(ctx)),
		zap.Time("timestamp", time.Now()),
		zap.Any("details", details))
}

// logSafetyViolations logs safety violations for monitoring/alerting
func (al *AuditLogger) logSafetyViolations(entry *AuditEntry) {
	for _, violation := range entry.SafetyViolations {
		al.logger.Warn("Safety violation detected",
			zap.String("audit_type", "safety_violation"),
			zap.String("request_id", entry.RequestID),
			zap.String("violation_rule", violation.Rule),
			zap.String("violation_severity", violation.Severity),
			zap.String("violation_description", violation.Description),
			zap.String("user", entry.User),
			zap.String("action", entry.Action),
			zap.String("resource", fmt.Sprintf("%s/%s", entry.Namespace, entry.Name)))
	}
}

// summarizeTargets creates a summary of bulk operation targets for logging
func (al *AuditLogger) summarizeTargets(targets []TargetResource) []map[string]interface{} {
	// For bulk operations, we don't want to log every single target
	// Instead, create a summary grouped by namespace
	summary := make(map[string][]string)

	for _, target := range targets {
		ns := target.Namespace
		if ns == "" {
			ns = "cluster-scoped"
		}
		summary[ns] = append(summary[ns], target.Name)
	}

	// Convert to a more structured format
	result := make([]map[string]interface{}, 0, len(summary))
	for ns, names := range summary {
		result = append(result, map[string]interface{}{
			"namespace": ns,
			"count":     len(names),
			"names":     names[:min(len(names), 10)], // Limit to first 10 names
		})
	}

	return result
}

// getTraceIDFromContext extracts trace ID from context
func getTraceIDFromContext(ctx context.Context) string {
	// Try to get trace ID from context
	// This could integrate with your existing tracing system
	if traceID := ctx.Value("trace_id"); traceID != nil {
		if id, ok := traceID.(string); ok {
			return id
		}
	}

	// Try request ID as fallback
	if requestID := ctx.Value("request_id"); requestID != nil {
		if id, ok := requestID.(string); ok {
			return id
		}
	}

	// Generate new trace ID if none found
	return uuid.New().String()
}

// CreateActionAuditEntry is a helper to create audit entries for actions
func CreateActionAuditEntry(
	ctx context.Context,
	action, verb, resource, namespace, name, user string,
	userGroups []string,
	success bool,
	errorMsg string,
	duration time.Duration,
	dryRun bool,
	safetyResult *SafetyResult,
	details map[string]interface{},
) *AuditEntry {
	entry := &AuditEntry{
		RequestID:   getRequestIDFromContext(ctx),
		TraceID:     getTraceIDFromContext(ctx),
		Timestamp:   time.Now(),
		Action:      action,
		Verb:        verb,
		Resource:    resource,
		Namespace:   namespace,
		Name:        name,
		User:        user,
		UserGroups:  userGroups,
		Success:     success,
		Error:       errorMsg,
		DryRun:      dryRun,
		Duration:    duration.String(),
		Details:     details,
		RBACChecked: true,
	}

	// Add safety information
	if safetyResult != nil {
		entry.SafetyViolations = safetyResult.Violations
		entry.ConfirmationRequired = !safetyResult.Allowed || len(safetyResult.Violations) > 0
	}

	// Extract additional context from request context
	if sourceIP := ctx.Value("source_ip"); sourceIP != nil {
		if ip, ok := sourceIP.(string); ok {
			entry.SourceIP = ip
		}
	}

	if userAgent := ctx.Value("user_agent"); userAgent != nil {
		if ua, ok := userAgent.(string); ok {
			entry.UserAgent = ua
		}
	}

	return entry
}

// getRequestIDFromContext extracts request ID from context
func getRequestIDFromContext(ctx context.Context) string {
	if requestID := ctx.Value("request_id"); requestID != nil {
		if id, ok := requestID.(string); ok {
			return id
		}
	}
	return uuid.New().String()
}

// min returns the minimum of two integers
func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// MarshalAuditEntry marshals an audit entry to JSON
func MarshalAuditEntry(entry *AuditEntry) ([]byte, error) {
	return json.Marshal(entry)
}

// AuditEventType represents different types of audit events
type AuditEventType string

const (
	AuditEventAction          AuditEventType = "action"
	AuditEventSecurity        AuditEventType = "security"
	AuditEventSafetyViolation AuditEventType = "safety_violation"
	AuditEventRBACDenied      AuditEventType = "rbac_denied"
	AuditEventBulkAction      AuditEventType = "bulk_action"
)

// AuditConfig represents audit logging configuration
type AuditConfig struct {
	Enabled           bool     `json:"enabled"`
	LogLevel          string   `json:"log_level"`
	IncludeSuccessful bool     `json:"include_successful"`
	IncludeDryRun     bool     `json:"include_dry_run"`
	SensitiveActions  []string `json:"sensitive_actions"`
	AlertOnViolations bool     `json:"alert_on_violations"`
	RetentionDays     int      `json:"retention_days"`
}

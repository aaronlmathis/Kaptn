package dto

import (
	"encoding/json"
	"testing"
	"time"
)

func TestPaginationRequestJSON(t *testing.T) {
	req := PaginationRequest{
		Page:     1,
		PageSize: 25,
	}

	data, err := json.Marshal(req)
	if err != nil {
		t.Fatalf("Failed to marshal PaginationRequest: %v", err)
	}

	var decoded PaginationRequest
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("Failed to unmarshal PaginationRequest: %v", err)
	}

	if decoded.Page != req.Page || decoded.PageSize != req.PageSize {
		t.Errorf("Decoded PaginationRequest doesn't match original: got %+v, want %+v", decoded, req)
	}
}

func TestAPIResponseJSON(t *testing.T) {
	resp := APIResponse{
		Status: "success",
		Data:   map[string]string{"test": "value"},
	}

	data, err := json.Marshal(resp)
	if err != nil {
		t.Fatalf("Failed to marshal APIResponse: %v", err)
	}

	var decoded APIResponse
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("Failed to unmarshal APIResponse: %v", err)
	}

	if decoded.Status != resp.Status {
		t.Errorf("Decoded APIResponse status doesn't match: got %s, want %s", decoded.Status, resp.Status)
	}
}

func TestSecretSummaryJSON(t *testing.T) {
	now := time.Now()
	summary := SecretSummary{
		ID:                "test-secret",
		Name:              "test-secret",
		Namespace:         "default",
		Type:              "Opaque",
		Keys:              []string{"key1", "key2"},
		KeyCount:          2,
		Age:               "1h",
		AgeTimestamp:      now,
		CreationTimestamp: now,
		Labels:            map[string]string{"app": "test"},
		Annotations:       map[string]string{"description": "test secret"},
		ResourceVersion:   "123",
		UID:               "abc-123",
	}

	data, err := json.Marshal(summary)
	if err != nil {
		t.Fatalf("Failed to marshal SecretSummary: %v", err)
	}

	var decoded SecretSummary
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("Failed to unmarshal SecretSummary: %v", err)
	}

	if decoded.Name != summary.Name || decoded.Namespace != summary.Namespace {
		t.Errorf("Decoded SecretSummary doesn't match: got %+v, want %+v", decoded.Name, summary.Name)
	}
}

func TestBulkActionRequestJSON(t *testing.T) {
	req := BulkActionRequest{
		Action:       "restart-pods",
		DryRun:       true,
		ForceConfirm: false,
		Targets: []BulkActionTarget{
			{Namespace: "default", Name: "pod1"},
			{Namespace: "default", Name: "pod2"},
		},
		Params: map[string]interface{}{
			"gracePeriod": 30,
		},
	}

	data, err := json.Marshal(req)
	if err != nil {
		t.Fatalf("Failed to marshal BulkActionRequest: %v", err)
	}

	var decoded BulkActionRequest
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("Failed to unmarshal BulkActionRequest: %v", err)
	}

	if decoded.Action != req.Action || len(decoded.Targets) != len(req.Targets) {
		t.Errorf("Decoded BulkActionRequest doesn't match: got %+v, want %+v", decoded.Action, req.Action)
	}
}

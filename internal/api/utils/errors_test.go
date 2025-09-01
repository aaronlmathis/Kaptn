package utils

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestWriteJSONResponse(t *testing.T) {
	tests := []struct {
		name       string
		statusCode int
		response   interface{}
		wantStatus int
		wantBody   string
	}{
		{
			name:       "success response",
			statusCode: http.StatusOK,
			response:   map[string]string{"message": "success"},
			wantStatus: http.StatusOK,
			wantBody:   `{"message":"success"}`,
		},
		{
			name:       "error response",
			statusCode: http.StatusBadRequest,
			response:   map[string]string{"error": "bad request"},
			wantStatus: http.StatusBadRequest,
			wantBody:   `{"error":"bad request"}`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := httptest.NewRecorder()

			err := WriteJSONResponse(w, tt.statusCode, tt.response)
			if err != nil {
				t.Errorf("WriteJSONResponse() error = %v", err)
				return
			}

			if w.Code != tt.wantStatus {
				t.Errorf("WriteJSONResponse() status = %v, want %v", w.Code, tt.wantStatus)
			}

			if contentType := w.Header().Get("Content-Type"); contentType != "application/json" {
				t.Errorf("WriteJSONResponse() Content-Type = %v, want application/json", contentType)
			}

			var gotBody map[string]string
			if err := json.Unmarshal(w.Body.Bytes(), &gotBody); err != nil {
				t.Errorf("WriteJSONResponse() failed to unmarshal response: %v", err)
				return
			}

			var wantBody map[string]string
			if err := json.Unmarshal([]byte(tt.wantBody), &wantBody); err != nil {
				t.Errorf("Test setup error: failed to unmarshal expected body: %v", err)
				return
			}

			for k, v := range wantBody {
				if gotBody[k] != v {
					t.Errorf("WriteJSONResponse() body[%s] = %v, want %v", k, gotBody[k], v)
				}
			}
		})
	}
}

func TestWriteSuccessResponse(t *testing.T) {
	w := httptest.NewRecorder()
	testData := map[string]interface{}{
		"items": []string{"item1", "item2"},
		"total": 2,
	}

	err := WriteSuccessResponse(w, testData)
	if err != nil {
		t.Errorf("WriteSuccessResponse() error = %v", err)
		return
	}

	if w.Code != http.StatusOK {
		t.Errorf("WriteSuccessResponse() status = %v, want %v", w.Code, http.StatusOK)
	}

	var response APIResponse
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Errorf("WriteSuccessResponse() failed to unmarshal: %v", err)
		return
	}

	if response.Status != "success" {
		t.Errorf("WriteSuccessResponse() status = %v, want success", response.Status)
	}

	if response.Data == nil {
		t.Error("WriteSuccessResponse() data is nil")
	}
}

func TestWriteErrorResponse(t *testing.T) {
	tests := []struct {
		name       string
		statusCode int
		errorMsg   string
	}{
		{
			name:       "bad request",
			statusCode: http.StatusBadRequest,
			errorMsg:   "Invalid input",
		},
		{
			name:       "internal server error",
			statusCode: http.StatusInternalServerError,
			errorMsg:   "Database connection failed",
		},
		{
			name:       "not found",
			statusCode: http.StatusNotFound,
			errorMsg:   "Resource not found",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := httptest.NewRecorder()

			err := WriteErrorResponse(w, tt.statusCode, tt.errorMsg)
			if err != nil {
				t.Errorf("WriteErrorResponse() error = %v", err)
				return
			}

			if w.Code != tt.statusCode {
				t.Errorf("WriteErrorResponse() status = %v, want %v", w.Code, tt.statusCode)
			}

			var response ErrorResponse
			if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
				t.Errorf("WriteErrorResponse() failed to unmarshal: %v", err)
				return
			}

			if response.Status != "error" {
				t.Errorf("WriteErrorResponse() status = %v, want error", response.Status)
			}

			if response.Error != tt.errorMsg {
				t.Errorf("WriteErrorResponse() error = %v, want %v", response.Error, tt.errorMsg)
			}
		})
	}
}

func TestWriteBadRequestError(t *testing.T) {
	w := httptest.NewRecorder()
	errorMsg := "Invalid request parameters"

	err := WriteBadRequestError(w, errorMsg)
	if err != nil {
		t.Errorf("WriteBadRequestError() error = %v", err)
		return
	}

	if w.Code != http.StatusBadRequest {
		t.Errorf("WriteBadRequestError() status = %v, want %v", w.Code, http.StatusBadRequest)
	}

	var response ErrorResponse
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Errorf("WriteBadRequestError() failed to unmarshal: %v", err)
		return
	}

	if response.Error != errorMsg {
		t.Errorf("WriteBadRequestError() error = %v, want %v", response.Error, errorMsg)
	}
}

func TestWriteInternalServerError(t *testing.T) {
	w := httptest.NewRecorder()
	errorMsg := "Database connection failed"

	err := WriteInternalServerError(w, errorMsg)
	if err != nil {
		t.Errorf("WriteInternalServerError() error = %v", err)
		return
	}

	if w.Code != http.StatusInternalServerError {
		t.Errorf("WriteInternalServerError() status = %v, want %v", w.Code, http.StatusInternalServerError)
	}
}

func TestWriteNotFoundError(t *testing.T) {
	w := httptest.NewRecorder()
	errorMsg := "Resource not found"

	err := WriteNotFoundError(w, errorMsg)
	if err != nil {
		t.Errorf("WriteNotFoundError() error = %v", err)
		return
	}

	if w.Code != http.StatusNotFound {
		t.Errorf("WriteNotFoundError() status = %v, want %v", w.Code, http.StatusNotFound)
	}
}

func TestCreatePaginatedResponse(t *testing.T) {
	items := []string{"item1", "item2", "item3"}
	pagination := CreatePaginationResponse(1, 10, 3)

	result := CreatePaginatedResponse(items, pagination)

	if result["items"] == nil {
		t.Error("CreatePaginatedResponse() items is nil")
	}

	if result["page"] != 1 {
		t.Errorf("CreatePaginatedResponse() page = %v, want 1", result["page"])
	}

	if result["pageSize"] != 10 {
		t.Errorf("CreatePaginatedResponse() pageSize = %v, want 10", result["pageSize"])
	}

	if result["total"] != 3 {
		t.Errorf("CreatePaginatedResponse() total = %v, want 3", result["total"])
	}
}

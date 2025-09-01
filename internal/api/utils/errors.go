package utils

import (
	"encoding/json"
	"net/http"
)

// APIResponse represents a standard API response structure
type APIResponse struct {
	Status string      `json:"status"`
	Data   interface{} `json:"data,omitempty"`
	Error  string      `json:"error,omitempty"`
}

// ErrorResponse represents an error response structure
type ErrorResponse struct {
	Status string `json:"status"`
	Error  string `json:"error"`
}

// WriteJSONResponse writes a JSON response with the given status code
func WriteJSONResponse(w http.ResponseWriter, statusCode int, response interface{}) error {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	return json.NewEncoder(w).Encode(response)
}

// WriteSuccessResponse writes a successful JSON response
func WriteSuccessResponse(w http.ResponseWriter, data interface{}) error {
	response := APIResponse{
		Status: "success",
		Data:   data,
	}
	return WriteJSONResponse(w, http.StatusOK, response)
}

// WriteErrorResponse writes an error JSON response
func WriteErrorResponse(w http.ResponseWriter, statusCode int, errorMsg string) error {
	response := ErrorResponse{
		Status: "error",
		Error:  errorMsg,
	}
	return WriteJSONResponse(w, statusCode, response)
}

// WriteBadRequestError writes a 400 Bad Request error response
func WriteBadRequestError(w http.ResponseWriter, errorMsg string) error {
	return WriteErrorResponse(w, http.StatusBadRequest, errorMsg)
}

// WriteInternalServerError writes a 500 Internal Server Error response
func WriteInternalServerError(w http.ResponseWriter, errorMsg string) error {
	return WriteErrorResponse(w, http.StatusInternalServerError, errorMsg)
}

// WriteNotFoundError writes a 404 Not Found error response
func WriteNotFoundError(w http.ResponseWriter, errorMsg string) error {
	return WriteErrorResponse(w, http.StatusNotFound, errorMsg)
}

// CreatePaginatedResponse creates a standardized paginated response
func CreatePaginatedResponse(items interface{}, pagination PaginationResponse) map[string]interface{} {
	return map[string]interface{}{
		"items":    items,
		"page":     pagination.Page,
		"pageSize": pagination.PageSize,
		"total":    pagination.Total,
	}
}

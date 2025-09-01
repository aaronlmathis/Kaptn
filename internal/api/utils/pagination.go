package utils

import (
	"strconv"
)

// PaginationParams represents pagination parameters
type PaginationParams struct {
	Page     int
	PageSize int
}

// PaginationResponse represents pagination metadata in API responses
type PaginationResponse struct {
	Page     int `json:"page"`
	PageSize int `json:"pageSize"`
	Total    int `json:"total"`
}

// ParsePage parses a page parameter string with a default value
func ParsePage(pageStr string, defaultValue int) int {
	if pageStr == "" {
		return defaultValue
	}

	page, err := strconv.Atoi(pageStr)
	if err != nil || page <= 0 {
		return defaultValue
	}

	return page
}

// ParsePageSize parses a pageSize parameter string with default and max values
func ParsePageSize(pageSizeStr string, defaultValue, maxValue int) int {
	if pageSizeStr == "" {
		return defaultValue
	}

	pageSize, err := strconv.Atoi(pageSizeStr)
	if err != nil || pageSize <= 0 {
		return defaultValue
	}

	if maxValue > 0 && pageSize > maxValue {
		return maxValue
	}

	return pageSize
}

// ParsePaginationParams extracts and validates pagination parameters from query strings
func ParsePaginationParams(pageStr, pageSizeStr string) PaginationParams {
	// Default values based on analysis of existing handlers
	const defaultPage = 1
	const defaultPageSize = 25
	const maxPageSize = 100

	return PaginationParams{
		Page:     ParsePage(pageStr, defaultPage),
		PageSize: ParsePageSize(pageSizeStr, defaultPageSize, maxPageSize),
	}
}

// ApplyPagination applies pagination to a slice and returns the paginated slice and total count
func ApplyPagination[T any](items []T, page, pageSize int) ([]T, int) {
	total := len(items)

	if total == 0 || page <= 0 || pageSize <= 0 {
		return items, total
	}

	start := (page - 1) * pageSize
	if start >= total {
		return []T{}, total
	}

	end := start + pageSize
	if end > total {
		end = total
	}

	return items[start:end], total
}

// CreatePaginationResponse creates a standardized pagination response structure
func CreatePaginationResponse(page, pageSize, total int) PaginationResponse {
	return PaginationResponse{
		Page:     page,
		PageSize: pageSize,
		Total:    total,
	}
}

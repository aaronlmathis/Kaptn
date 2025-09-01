package utils

import (
	"testing"
)

func TestParsePage(t *testing.T) {
	tests := []struct {
		name         string
		pageStr      string
		defaultValue int
		expected     int
	}{
		{
			name:         "empty string returns default",
			pageStr:      "",
			defaultValue: 1,
			expected:     1,
		},
		{
			name:         "valid positive number",
			pageStr:      "5",
			defaultValue: 1,
			expected:     5,
		},
		{
			name:         "zero returns default",
			pageStr:      "0",
			defaultValue: 1,
			expected:     1,
		},
		{
			name:         "negative number returns default",
			pageStr:      "-1",
			defaultValue: 1,
			expected:     1,
		},
		{
			name:         "invalid string returns default",
			pageStr:      "abc",
			defaultValue: 1,
			expected:     1,
		},
		{
			name:         "large number",
			pageStr:      "1000",
			defaultValue: 1,
			expected:     1000,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := ParsePage(tt.pageStr, tt.defaultValue)
			if result != tt.expected {
				t.Errorf("ParsePage(%q, %d) = %d, expected %d", tt.pageStr, tt.defaultValue, result, tt.expected)
			}
		})
	}
}

func TestParsePageSize(t *testing.T) {
	tests := []struct {
		name          string
		pageSizeStr   string
		defaultValue  int
		maxValue      int
		expected      int
	}{
		{
			name:         "empty string returns default",
			pageSizeStr:  "",
			defaultValue: 25,
			maxValue:     100,
			expected:     25,
		},
		{
			name:         "valid number within range",
			pageSizeStr:  "50",
			defaultValue: 25,
			maxValue:     100,
			expected:     50,
		},
		{
			name:         "number exceeds max returns max",
			pageSizeStr:  "150",
			defaultValue: 25,
			maxValue:     100,
			expected:     100,
		},
		{
			name:         "zero returns default",
			pageSizeStr:  "0",
			defaultValue: 25,
			maxValue:     100,
			expected:     25,
		},
		{
			name:         "negative number returns default",
			pageSizeStr:  "-5",
			defaultValue: 25,
			maxValue:     100,
			expected:     25,
		},
		{
			name:         "invalid string returns default",
			pageSizeStr:  "abc",
			defaultValue: 25,
			maxValue:     100,
			expected:     25,
		},
		{
			name:         "no max value constraint",
			pageSizeStr:  "500",
			defaultValue: 25,
			maxValue:     0,
			expected:     500,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := ParsePageSize(tt.pageSizeStr, tt.defaultValue, tt.maxValue)
			if result != tt.expected {
				t.Errorf("ParsePageSize(%q, %d, %d) = %d, expected %d", 
					tt.pageSizeStr, tt.defaultValue, tt.maxValue, result, tt.expected)
			}
		})
	}
}

func TestParsePaginationParams(t *testing.T) {
	tests := []struct {
		name        string
		pageStr     string
		pageSizeStr string
		expected    PaginationParams
	}{
		{
			name:        "empty parameters use defaults",
			pageStr:     "",
			pageSizeStr: "",
			expected:    PaginationParams{Page: 1, PageSize: 25},
		},
		{
			name:        "valid parameters",
			pageStr:     "3",
			pageSizeStr: "50",
			expected:    PaginationParams{Page: 3, PageSize: 50},
		},
		{
			name:        "page size exceeds max",
			pageStr:     "2",
			pageSizeStr: "150",
			expected:    PaginationParams{Page: 2, PageSize: 100},
		},
		{
			name:        "invalid page uses default",
			pageStr:     "abc",
			pageSizeStr: "30",
			expected:    PaginationParams{Page: 1, PageSize: 30},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := ParsePaginationParams(tt.pageStr, tt.pageSizeStr)
			if result != tt.expected {
				t.Errorf("ParsePaginationParams(%q, %q) = %+v, expected %+v", 
					tt.pageStr, tt.pageSizeStr, result, tt.expected)
			}
		})
	}
}

func TestApplyPagination(t *testing.T) {
	// Test data
	items := []string{"a", "b", "c", "d", "e", "f", "g", "h", "i", "j"}

	tests := []struct {
		name         string
		items        []string
		page         int
		pageSize     int
		expectedLen  int
		expectedData []string
		expectedTotal int
	}{
		{
			name:         "first page",
			items:        items,
			page:         1,
			pageSize:     3,
			expectedLen:  3,
			expectedData: []string{"a", "b", "c"},
			expectedTotal: 10,
		},
		{
			name:         "middle page",
			items:        items,
			page:         2,
			pageSize:     3,
			expectedLen:  3,
			expectedData: []string{"d", "e", "f"},
			expectedTotal: 10,
		},
		{
			name:         "last page partial",
			items:        items,
			page:         4,
			pageSize:     3,
			expectedLen:  1,
			expectedData: []string{"j"},
			expectedTotal: 10,
		},
		{
			name:         "page beyond range",
			items:        items,
			page:         5,
			pageSize:     3,
			expectedLen:  0,
			expectedData: []string{},
			expectedTotal: 10,
		},
		{
			name:         "zero page",
			items:        items,
			page:         0,
			pageSize:     3,
			expectedLen:  10,
			expectedData: items,
			expectedTotal: 10,
		},
		{
			name:         "zero page size",
			items:        items,
			page:         1,
			pageSize:     0,
			expectedLen:  10,
			expectedData: items,
			expectedTotal: 10,
		},
		{
			name:         "empty slice",
			items:        []string{},
			page:         1,
			pageSize:     5,
			expectedLen:  0,
			expectedData: []string{},
			expectedTotal: 0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, total := ApplyPagination(tt.items, tt.page, tt.pageSize)
			
			if len(result) != tt.expectedLen {
				t.Errorf("ApplyPagination() returned %d items, expected %d", len(result), tt.expectedLen)
			}
			
			if total != tt.expectedTotal {
				t.Errorf("ApplyPagination() returned total %d, expected %d", total, tt.expectedTotal)
			}

			// Compare actual data for non-empty results
			if len(tt.expectedData) > 0 {
				for i, expected := range tt.expectedData {
					if i >= len(result) || result[i] != expected {
						t.Errorf("ApplyPagination() item %d = %v, expected %v", i, result[i], expected)
					}
				}
			}
		})
	}
}

func TestCreatePaginationResponse(t *testing.T) {
	result := CreatePaginationResponse(2, 25, 100)
	
	expected := PaginationResponse{
		Page:     2,
		PageSize: 25,
		Total:    100,
	}
	
	if result != expected {
		t.Errorf("CreatePaginationResponse(2, 25, 100) = %+v, expected %+v", result, expected)
	}
}

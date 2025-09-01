package utils

import (
	"testing"
)

func TestContainsIgnoreCase(t *testing.T) {
	tests := []struct {
		name     string
		text     string
		search   string
		expected bool
	}{
		{
			name:     "exact match",
			text:     "hello",
			search:   "hello",
			expected: true,
		},
		{
			name:     "case insensitive match",
			text:     "Hello World",
			search:   "hello",
			expected: true,
		},
		{
			name:     "partial match",
			text:     "kubernetes pod",
			search:   "pod",
			expected: true,
		},
		{
			name:     "no match",
			text:     "kubernetes",
			search:   "docker",
			expected: false,
		},
		{
			name:     "empty search returns true",
			text:     "anything",
			search:   "",
			expected: true,
		},
		{
			name:     "empty text with non-empty search",
			text:     "",
			search:   "test",
			expected: false,
		},
		{
			name:     "both empty",
			text:     "",
			search:   "",
			expected: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := ContainsIgnoreCase(tt.text, tt.search)
			if result != tt.expected {
				t.Errorf("ContainsIgnoreCase(%q, %q) = %v, expected %v",
					tt.text, tt.search, result, tt.expected)
			}
		})
	}
}

func TestMatchesSearch(t *testing.T) {
	tests := []struct {
		name     string
		search   string
		fields   []string
		expected bool
	}{
		{
			name:     "empty search returns true",
			search:   "",
			fields:   []string{"field1", "field2"},
			expected: true,
		},
		{
			name:     "match in first field",
			search:   "pod",
			fields:   []string{"my-pod-123", "namespace"},
			expected: true,
		},
		{
			name:     "match in second field",
			search:   "space",
			fields:   []string{"my-pod-123", "my-namespace"},
			expected: true,
		},
		{
			name:     "case insensitive match",
			search:   "POD",
			fields:   []string{"my-pod-123", "namespace"},
			expected: true,
		},
		{
			name:     "no match in any field",
			search:   "docker",
			fields:   []string{"my-pod-123", "kubernetes"},
			expected: false,
		},
		{
			name:     "empty fields",
			search:   "test",
			fields:   []string{},
			expected: false,
		},
		{
			name:     "match with empty field",
			search:   "test",
			fields:   []string{"", "test-value"},
			expected: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := MatchesSearch(tt.search, tt.fields...)
			if result != tt.expected {
				t.Errorf("MatchesSearch(%q, %v) = %v, expected %v",
					tt.search, tt.fields, result, tt.expected)
			}
		})
	}
}

func TestFilterBySearch(t *testing.T) {
	// Test data
	type testItem struct {
		name      string
		namespace string
	}

	items := []testItem{
		{name: "pod-1", namespace: "default"},
		{name: "pod-2", namespace: "kube-system"},
		{name: "service-1", namespace: "default"},
		{name: "deployment-1", namespace: "production"},
	}

	// Search function that checks name and namespace
	searchFunc := func(item testItem, search string) bool {
		return MatchesSearch(search, item.name, item.namespace)
	}

	tests := []struct {
		name     string
		search   string
		expected []testItem
	}{
		{
			name:     "empty search returns all",
			search:   "",
			expected: items,
		},
		{
			name:   "search for 'pod'",
			search: "pod",
			expected: []testItem{
				{name: "pod-1", namespace: "default"},
				{name: "pod-2", namespace: "kube-system"},
			},
		},
		{
			name:   "search for 'default'",
			search: "default",
			expected: []testItem{
				{name: "pod-1", namespace: "default"},
				{name: "service-1", namespace: "default"},
			},
		},
		{
			name:   "search for 'kube'",
			search: "kube",
			expected: []testItem{
				{name: "pod-2", namespace: "kube-system"},
			},
		},
		{
			name:     "search with no matches",
			search:   "notfound",
			expected: []testItem{},
		},
		{
			name:   "case insensitive search",
			search: "PROD",
			expected: []testItem{
				{name: "deployment-1", namespace: "production"},
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := FilterBySearch(items, tt.search, searchFunc)

			if len(result) != len(tt.expected) {
				t.Errorf("FilterBySearch() returned %d items, expected %d",
					len(result), len(tt.expected))
				return
			}

			// Check each expected item is in the result
			for _, expected := range tt.expected {
				found := false
				for _, actual := range result {
					if actual.name == expected.name && actual.namespace == expected.namespace {
						found = true
						break
					}
				}
				if !found {
					t.Errorf("FilterBySearch() missing expected item: %+v", expected)
				}
			}
		})
	}
}

package logs

import (
	"strings"
	"testing"
)

// TestBusGenerateIDFormatting tests that subscription IDs are printable and properly formatted
func TestBusGenerateIDFormatting(t *testing.T) {
	bus := NewBus(100)

	// Generate multiple IDs to test formatting
	ids := make([]string, 0, 1000)
	for i := 0; i < 1000; i++ {
		id := bus.generateID()
		ids = append(ids, id)

		// Check that ID has the expected prefix
		if !strings.HasPrefix(id, "sub_") {
			t.Errorf("Expected ID to have 'sub_' prefix, got: %s", id)
		}

		// Check that ID is printable (no control characters)
		for _, char := range id {
			if char < 32 || char > 126 {
				t.Errorf("ID contains non-printable character: %s (char code: %d)", id, char)
			}
		}

		// Check that ID follows expected format pattern (sub_<number>)
		if len(id) < 5 { // "sub_" + at least one digit
			t.Errorf("ID too short: %s", id)
		}

		suffix := id[4:] // everything after "sub_"
		for _, char := range suffix {
			if char < '0' || char > '9' {
				t.Errorf("ID suffix should only contain digits, got: %s", id)
			}
		}
	}

	// Check that IDs are unique
	idSet := make(map[string]bool)
	for _, id := range ids {
		if idSet[id] {
			t.Errorf("Duplicate ID generated: %s", id)
		}
		idSet[id] = true
	}

	// Test that IDs increment properly
	firstID := bus.generateID()
	secondID := bus.generateID()

	if firstID >= secondID {
		t.Errorf("Expected IDs to increment, got first: %s, second: %s", firstID, secondID)
	}
}

package version

import (
	"strings"
	"testing"
)

func TestGet(t *testing.T) {
	info := Get()

	if info.Version == "" {
		t.Error("Version should not be empty")
	}

	if info.GitCommit == "" {
		t.Error("GitCommit should not be empty")
	}

	if info.BuildDate == "" {
		t.Error("BuildDate should not be empty")
	}

	if info.GoVersion == "" {
		t.Error("GoVersion should not be empty")
	}
}

func TestString(t *testing.T) {
	info := Get()
	str := info.String()

	if !strings.Contains(str, "Version:") {
		t.Error("String should contain 'Version:'")
	}

	if !strings.Contains(str, "GitCommit:") {
		t.Error("String should contain 'GitCommit:'")
	}

	if !strings.Contains(str, "BuildDate:") {
		t.Error("String should contain 'BuildDate:'")
	}

	if !strings.Contains(str, "GoVersion:") {
		t.Error("String should contain 'GoVersion:'")
	}
}

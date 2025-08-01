package version

import (
	"fmt"
	"runtime"
)

var (
	// Version is the current version of the application
	Version = "v0.1.0-dev"
	// GitCommit is the git commit that was compiled
	GitCommit = "unknown"
	// BuildDate is the date the binary was built
	BuildDate = "unknown"
	// GoVersion is the version of Go that was used to compile
	GoVersion = runtime.Version()
)

// Info represents version information
type Info struct {
	Version   string `json:"version"`
	GitCommit string `json:"gitCommit"`
	BuildDate string `json:"buildDate"`
	GoVersion string `json:"goVersion"`
}

// Get returns the version information
func Get() Info {
	return Info{
		Version:   Version,
		GitCommit: GitCommit,
		BuildDate: BuildDate,
		GoVersion: GoVersion,
	}
}

// String returns a formatted version string
func (i Info) String() string {
	return fmt.Sprintf("Version: %s, GitCommit: %s, BuildDate: %s, GoVersion: %s",
		i.Version, i.GitCommit, i.BuildDate, i.GoVersion)
}

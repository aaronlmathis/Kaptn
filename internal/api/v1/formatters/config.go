// Package formatters provides domain-specific response formatting functions
// for converting Kubernetes configuration resources to API response formats.
package formatters

import (
	"fmt"

	v1 "k8s.io/api/core/v1"
)

// ConfigFormatter provides formatting functions for configuration resources
type ConfigFormatter struct{}

// NewConfigFormatter creates a new config formatter
func NewConfigFormatter() *ConfigFormatter {
	return &ConfigFormatter{}
}

// ConfigMapToResponse converts a Kubernetes ConfigMap to response format
func (f *ConfigFormatter) ConfigMapToResponse(configMap v1.ConfigMap) map[string]interface{} {
	age := calculateAge(configMap.CreationTimestamp.Time)

	// Count data keys
	dataKeysCount := len(configMap.Data)
	binaryDataKeysCount := len(configMap.BinaryData)
	totalKeys := dataKeysCount + binaryDataKeysCount

	// Calculate approximate data size
	var dataSize int
	for _, value := range configMap.Data {
		dataSize += len(value)
	}
	for _, value := range configMap.BinaryData {
		dataSize += len(value)
	}

	// Format data size
	dataSizeStr := "0 B"
	if dataSize > 0 {
		if dataSize < 1024 {
			dataSizeStr = fmt.Sprintf("%d B", dataSize)
		} else if dataSize < 1024*1024 {
			dataSizeStr = fmt.Sprintf("%.1f KB", float64(dataSize)/1024)
		} else {
			dataSizeStr = fmt.Sprintf("%.1f MB", float64(dataSize)/(1024*1024))
		}
	}

	// Get data keys for display
	var dataKeys []string
	for key := range configMap.Data {
		dataKeys = append(dataKeys, key)
	}
	for key := range configMap.BinaryData {
		dataKeys = append(dataKeys, key+" (binary)")
	}

	// Count labels and annotations
	labelsCount := len(configMap.Labels)
	annotationsCount := len(configMap.Annotations)

	return map[string]interface{}{
		"id":                fmt.Sprintf("%s-%s", configMap.Namespace, configMap.Name), // For table sorting
		"name":              configMap.Name,
		"namespace":         configMap.Namespace,
		"age":               age,
		"dataKeysCount":     totalKeys,
		"dataSize":          dataSizeStr,
		"dataSizeBytes":     dataSize,
		"dataKeys":          dataKeys,
		"labelsCount":       labelsCount,
		"annotationsCount":  annotationsCount,
		"creationTimestamp": configMap.CreationTimestamp.Time,
		"labels":            configMap.Labels,
		"annotations":       configMap.Annotations,
	}
}

// ResourceQuotaToResponse converts a ResourceQuota to a response format
func (f *ConfigFormatter) ResourceQuotaToResponse(resourceQuota v1.ResourceQuota) map[string]interface{} {
	age := "unknown"
	if !resourceQuota.CreationTimestamp.IsZero() {
		age = calculateAge(resourceQuota.CreationTimestamp.Time)
	}

	// Count labels and annotations
	labelsCount := 0
	annotationsCount := 0
	if resourceQuota.Labels != nil {
		labelsCount = len(resourceQuota.Labels)
	}
	if resourceQuota.Annotations != nil {
		annotationsCount = len(resourceQuota.Annotations)
	}

	// Extract resource limits and used
	var hardLimits []map[string]interface{}
	var usedResources []map[string]interface{}

	if resourceQuota.Spec.Hard != nil {
		for resourceName, quantity := range resourceQuota.Spec.Hard {
			used := ""
			if resourceQuota.Status.Used != nil {
				if usedQuantity, exists := resourceQuota.Status.Used[resourceName]; exists {
					used = usedQuantity.String()
				} else {
					used = "0"
				}
			}

			hardLimits = append(hardLimits, map[string]interface{}{
				"name":  string(resourceName),
				"limit": quantity.String(),
				"used":  used,
			})
		}
	}

	if resourceQuota.Status.Used != nil {
		for resourceName, quantity := range resourceQuota.Status.Used {
			usedResources = append(usedResources, map[string]interface{}{
				"name":     string(resourceName),
				"quantity": quantity.String(),
			})
		}
	}

	// Count resource types
	hardResourcesCount := len(resourceQuota.Spec.Hard)
	usedResourcesCount := len(resourceQuota.Status.Used)

	return map[string]interface{}{
		"id":                 fmt.Sprintf("%s-%s", resourceQuota.Namespace, resourceQuota.Name), // For table sorting
		"name":               resourceQuota.Name,
		"namespace":          resourceQuota.Namespace,
		"age":                age,
		"hardLimits":         hardLimits,
		"usedResources":      usedResources,
		"hardResourcesCount": hardResourcesCount,
		"usedResourcesCount": usedResourcesCount,
		"labelsCount":        labelsCount,
		"annotationsCount":   annotationsCount,
		"creationTimestamp":  resourceQuota.CreationTimestamp.Time,
		"labels":             resourceQuota.Labels,
		"annotations":        resourceQuota.Annotations,
	}
}

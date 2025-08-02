package selectors

import (
	"fmt"
	"sort"
	"strings"

	v1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/fields"
	"k8s.io/apimachinery/pkg/labels"
)

// PodFilterOptions represents filtering options for pods
type PodFilterOptions struct {
	Namespace     string
	NodeName      string
	LabelSelector string
	FieldSelector string
	Page          int
	PageSize      int
	Sort          string // Field to sort by (name, namespace, node, age, restarts, cpu, memory)
	Order         string // Sort order (asc, desc)
	Search        string // Text search across name, namespace, labels
	Phase         string // Filter by pod phase
}

// NodeFilterOptions represents filtering options for nodes
type NodeFilterOptions struct {
	LabelSelector string
	FieldSelector string
	Page          int
	PageSize      int
}

// FilterPods filters a list of pods based on the given options
func FilterPods(pods []v1.Pod, options PodFilterOptions) ([]v1.Pod, error) {
	var filtered []v1.Pod

	// Parse label selector
	var labelSelector labels.Selector
	if options.LabelSelector != "" {
		var err error
		labelSelector, err = labels.Parse(options.LabelSelector)
		if err != nil {
			return nil, fmt.Errorf("invalid label selector: %w", err)
		}
	}

	// Parse field selector
	var fieldSelector fields.Selector
	if options.FieldSelector != "" {
		var err error
		fieldSelector, err = fields.ParseSelector(options.FieldSelector)
		if err != nil {
			return nil, fmt.Errorf("invalid field selector: %w", err)
		}
	}

	for _, pod := range pods {
		// Filter by namespace
		if options.Namespace != "" && pod.Namespace != options.Namespace {
			continue
		}

		// Filter by node name
		if options.NodeName != "" && pod.Spec.NodeName != options.NodeName {
			continue
		}

		// Filter by phase
		if options.Phase != "" && string(pod.Status.Phase) != options.Phase {
			continue
		}

		// Filter by text search (name, namespace, labels)
		if options.Search != "" {
			searchLower := strings.ToLower(options.Search)
			found := false

			// Search in pod name
			if strings.Contains(strings.ToLower(pod.Name), searchLower) {
				found = true
			}

			// Search in namespace
			if !found && strings.Contains(strings.ToLower(pod.Namespace), searchLower) {
				found = true
			}

			// Search in labels
			if !found {
				for key, value := range pod.Labels {
					if strings.Contains(strings.ToLower(key), searchLower) ||
						strings.Contains(strings.ToLower(value), searchLower) {
						found = true
						break
					}
				}
			}

			if !found {
				continue
			}
		}

		// Filter by label selector
		if labelSelector != nil && !labelSelector.Matches(labels.Set(pod.Labels)) {
			continue
		}

		// Filter by field selector
		if fieldSelector != nil {
			fieldSet := PodToFieldSet(&pod)
			if !fieldSelector.Matches(fieldSet) {
				continue
			}
		}

		filtered = append(filtered, pod)
	}

	// Apply sorting
	if options.Sort != "" {
		sortPods(filtered, options.Sort, options.Order)
	}

	// Apply pagination
	return paginateSlice(filtered, options.Page, options.PageSize), nil
}

// FilterNodes filters a list of nodes based on the given options
func FilterNodes(nodes []v1.Node, options NodeFilterOptions) ([]v1.Node, error) {
	var filtered []v1.Node

	// Parse label selector
	var labelSelector labels.Selector
	if options.LabelSelector != "" {
		var err error
		labelSelector, err = labels.Parse(options.LabelSelector)
		if err != nil {
			return nil, fmt.Errorf("invalid label selector: %w", err)
		}
	}

	// Parse field selector
	var fieldSelector fields.Selector
	if options.FieldSelector != "" {
		var err error
		fieldSelector, err = fields.ParseSelector(options.FieldSelector)
		if err != nil {
			return nil, fmt.Errorf("invalid field selector: %w", err)
		}
	}

	for _, node := range nodes {
		// Filter by label selector
		if labelSelector != nil && !labelSelector.Matches(labels.Set(node.Labels)) {
			continue
		}

		// Filter by field selector
		if fieldSelector != nil {
			fieldSet := NodeToFieldSet(&node)
			if !fieldSelector.Matches(fieldSet) {
				continue
			}
		}

		filtered = append(filtered, node)
	}

	// Apply pagination
	return paginateSlice(filtered, options.Page, options.PageSize), nil
}

// PodToFieldSet converts a pod to a field set for field selector matching
func PodToFieldSet(pod *v1.Pod) fields.Set {
	return fields.Set{
		"metadata.name":      pod.Name,
		"metadata.namespace": pod.Namespace,
		"spec.nodeName":      pod.Spec.NodeName,
		"spec.restartPolicy": string(pod.Spec.RestartPolicy),
		"status.phase":       string(pod.Status.Phase),
		"status.podIP":       pod.Status.PodIP,
		"status.hostIP":      pod.Status.HostIP,
	}
}

// NodeToFieldSet converts a node to a field set for field selector matching
func NodeToFieldSet(node *v1.Node) fields.Set {
	return fields.Set{
		"metadata.name":      node.Name,
		"spec.unschedulable": fmt.Sprintf("%t", node.Spec.Unschedulable),
	}
}

// sortPods sorts a slice of pods based on the given field and order
func sortPods(pods []v1.Pod, sortField, order string) {
	less := func(i, j int) bool {
		var result bool
		switch sortField {
		case "name":
			result = pods[i].Name < pods[j].Name
		case "namespace":
			result = pods[i].Namespace < pods[j].Namespace
		case "node":
			result = pods[i].Spec.NodeName < pods[j].Spec.NodeName
		case "age":
			result = pods[i].CreationTimestamp.Time.After(pods[j].CreationTimestamp.Time) // Newer first for age
		case "restarts":
			restartsI := getTotalRestarts(&pods[i])
			restartsJ := getTotalRestarts(&pods[j])
			result = restartsI < restartsJ
		default:
			result = pods[i].Name < pods[j].Name // Default to name
		}

		if order == "desc" {
			return !result
		}
		return result
	}

	sort.Slice(pods, less)
}

// getTotalRestarts calculates the total restart count for a pod
func getTotalRestarts(pod *v1.Pod) int32 {
	var total int32
	for _, containerStatus := range pod.Status.ContainerStatuses {
		total += containerStatus.RestartCount
	}
	return total
}

// paginateSlice applies pagination to a slice
func paginateSlice[T any](items []T, page, pageSize int) []T {
	if pageSize <= 0 {
		return items
	}

	if page <= 0 {
		page = 1
	}

	start := (page - 1) * pageSize
	if start >= len(items) {
		return []T{}
	}

	end := start + pageSize
	if end > len(items) {
		end = len(items)
	}

	return items[start:end]
}

// BuildLabelSelector builds a label selector from key-value pairs
func BuildLabelSelector(labelMap map[string]string) string {
	var selectors []string
	for key, value := range labelMap {
		if value == "" {
			selectors = append(selectors, key)
		} else {
			selectors = append(selectors, fmt.Sprintf("%s=%s", key, value))
		}
	}
	return strings.Join(selectors, ",")
}

// BuildFieldSelector builds a field selector from key-value pairs
func BuildFieldSelector(fieldMap map[string]string) string {
	var selectors []string
	for key, value := range fieldMap {
		selectors = append(selectors, fmt.Sprintf("%s=%s", key, value))
	}
	return strings.Join(selectors, ",")
}

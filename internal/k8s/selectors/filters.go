package selectors

import (
	"fmt"
	"sort"
	"strings"

	appsv1 "k8s.io/api/apps/v1"
	batchv1 "k8s.io/api/batch/v1"
	v1 "k8s.io/api/core/v1"
	networkingv1 "k8s.io/api/networking/v1"
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
	Sort          string // Field to sort by (name, roles, status, age)
	Order         string // Sort order (asc, desc)
	Search        string // Text search across name, labels
}

// DeploymentFilterOptions represents filtering options for deployments
type DeploymentFilterOptions struct {
	Namespace     string
	LabelSelector string
	FieldSelector string
	Page          int
	PageSize      int
	Sort          string // Field to sort by (name, namespace, replicas, age)
	Order         string // Sort order (asc, desc)
	Search        string // Text search across name, namespace, labels
}

// StatefulSetFilterOptions represents filtering options for statefulsets
type StatefulSetFilterOptions struct {
	Namespace     string
	LabelSelector string
	FieldSelector string
	Page          int
	PageSize      int
	Sort          string // Field to sort by (name, namespace, replicas, age)
	Order         string // Sort order (asc, desc)
	Search        string // Text search across name, namespace, labels
}

// DaemonSetFilterOptions represents filtering options for daemonsets
type DaemonSetFilterOptions struct {
	Namespace     string
	LabelSelector string
	FieldSelector string
	Page          int
	PageSize      int
	Sort          string // Field to sort by (name, namespace, desired, current, ready, age)
	Order         string // Sort order (asc, desc)
	Search        string // Text search across name, namespace, labels
}

// ReplicaSetFilterOptions represents filtering options for replicasets
type ReplicaSetFilterOptions struct {
	Namespace     string
	LabelSelector string
	FieldSelector string
	Page          int
	PageSize      int
	Sort          string // Field to sort by (name, namespace, replicas, age)
	Order         string // Sort order (asc, desc)
	Search        string // Text search across name, namespace, labels
}

// ServiceFilterOptions represents filtering options for services
type ServiceFilterOptions struct {
	Namespace     string
	LabelSelector string
	FieldSelector string
	Page          int
	PageSize      int
	Sort          string // Field to sort by (name, namespace, type, age)
	Order         string // Sort order (asc, desc)
	Search        string // Text search across name, namespace, labels
}

// JobFilterOptions represents filtering options for jobs
type JobFilterOptions struct {
	Namespace     string
	LabelSelector string
	FieldSelector string
	Page          int
	PageSize      int
	Sort          string // Field to sort by (name, namespace, completions, duration, age)
	Order         string // Sort order (asc, desc)
	Search        string // Text search across name, namespace, labels
}

// CronJobFilterOptions represents filtering options for cronjobs
type CronJobFilterOptions struct {
	Namespace     string
	LabelSelector string
	FieldSelector string
	Page          int
	PageSize      int
	Sort          string // Field to sort by (name, namespace, schedule, suspend, active, age)
	Order         string // Sort order (asc, desc)
	Search        string // Text search across name, namespace, labels, schedule
}

// EndpointsFilterOptions represents filtering options for endpoints
type EndpointsFilterOptions struct {
	Namespace     string
	LabelSelector string
	FieldSelector string
	Page          int
	PageSize      int
	Sort          string // Field to sort by (name, namespace, subsets, age)
	Order         string // Sort order (asc, desc)
	Search        string // Text search across name, namespace, labels
}

// SecretFilterOptions represents filtering options for secrets
type SecretFilterOptions struct {
	Namespace     string
	LabelSelector string
	FieldSelector string
	Page          int
	PageSize      int
	Sort          string // Field to sort by (name, namespace, type, keys, age)
	Order         string // Sort order (asc, desc)
	Search        string // Text search across name, namespace, labels
	Type          string // Filter by secret type (Opaque, kubernetes.io/tls, etc.)
}

// EventFilterOptions represents filtering options for events
type EventFilterOptions struct {
	Namespace     string
	LabelSelector string
	FieldSelector string
	Page          int
	PageSize      int
	Sort          string // Field to sort by (name, namespace, type, reason, lastTimestamp, firstTimestamp, count, age)
	SortOrder     string // Sort order (asc, desc)
	Search        string // Text search across name, namespace, reason, message, involvedObject
	Type          string // Filter by event type (Normal, Warning, Error)
	Reason        string // Filter by event reason
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

		// Apply text search
		if options.Search != "" {
			searchLower := strings.ToLower(options.Search)
			nameMatch := strings.Contains(strings.ToLower(node.Name), searchLower)
			labelMatch := false

			// Search in labels
			for key, value := range node.Labels {
				if strings.Contains(strings.ToLower(key), searchLower) ||
					strings.Contains(strings.ToLower(value), searchLower) {
					labelMatch = true
					break
				}
			}

			if !nameMatch && !labelMatch {
				continue
			}
		}

		filtered = append(filtered, node)
	}

	// Apply sorting
	if options.Sort != "" {
		sortNodes(filtered, options.Sort, options.Order)
	}

	// Apply pagination
	return paginateSlice(filtered, options.Page, options.PageSize), nil
}

// sortNodes sorts nodes by the specified field and order
func sortNodes(nodes []v1.Node, sortField, order string) {
	if sortField == "" {
		sortField = "name"
	}
	if order == "" {
		order = "asc"
	}

	sort.Slice(nodes, func(i, j int) bool {
		var less bool
		switch sortField {
		case "name":
			less = nodes[i].Name < nodes[j].Name
		case "roles":
			rolesI := getNodeRoles(&nodes[i])
			rolesJ := getNodeRoles(&nodes[j])
			less = strings.Join(rolesI, ",") < strings.Join(rolesJ, ",")
		case "status":
			statusI := isNodeReady(&nodes[i])
			statusJ := isNodeReady(&nodes[j])
			// Ready nodes first
			less = statusI && !statusJ
		case "age":
			less = nodes[i].CreationTimestamp.Time.After(nodes[j].CreationTimestamp.Time)
		default:
			less = nodes[i].Name < nodes[j].Name
		}

		if order == "desc" {
			return !less
		}
		return less
	})
}

// getNodeRoles extracts node roles from labels
func getNodeRoles(node *v1.Node) []string {
	roles := []string{}
	if _, isMaster := node.Labels["node-role.kubernetes.io/master"]; isMaster {
		roles = append(roles, "master")
	}
	if _, isControlPlane := node.Labels["node-role.kubernetes.io/control-plane"]; isControlPlane {
		roles = append(roles, "control-plane")
	}
	if len(roles) == 0 {
		roles = append(roles, "worker")
	}
	return roles
}

// isNodeReady checks if a node is ready
func isNodeReady(node *v1.Node) bool {
	for _, condition := range node.Status.Conditions {
		if condition.Type == v1.NodeReady && condition.Status == v1.ConditionTrue {
			return true
		}
	}
	return false
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

// FilterDeployments filters a list of deployments based on the given options
func FilterDeployments(deployments []appsv1.Deployment, options DeploymentFilterOptions) ([]appsv1.Deployment, error) {
	var filtered []appsv1.Deployment

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

	for _, deployment := range deployments {
		// Filter by namespace
		if options.Namespace != "" && deployment.Namespace != options.Namespace {
			continue
		}

		// Apply label selector
		if labelSelector != nil && !labelSelector.Matches(labels.Set(deployment.Labels)) {
			continue
		}

		// Apply field selector
		if fieldSelector != nil {
			fields := fields.Set{
				"metadata.name":      deployment.Name,
				"metadata.namespace": deployment.Namespace,
			}
			if !fieldSelector.Matches(fields) {
				continue
			}
		}

		// Apply text search
		if options.Search != "" {
			searchLower := strings.ToLower(options.Search)
			found := false

			// Search in name
			if strings.Contains(strings.ToLower(deployment.Name), searchLower) {
				found = true
			}

			// Search in namespace
			if !found && strings.Contains(strings.ToLower(deployment.Namespace), searchLower) {
				found = true
			}

			// Search in labels
			if !found {
				for key, value := range deployment.Labels {
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

		filtered = append(filtered, deployment)
	}

	// Sort deployments
	sortDeployments(filtered, options.Sort, options.Order)

	// Apply pagination
	if options.PageSize > 0 {
		start := (options.Page - 1) * options.PageSize
		if start >= len(filtered) {
			return []appsv1.Deployment{}, nil
		}
		end := start + options.PageSize
		if end > len(filtered) {
			end = len(filtered)
		}
		filtered = filtered[start:end]
	}

	return filtered, nil
}

// FilterStatefulSets filters a list of statefulsets based on the given options
func FilterStatefulSets(statefulSets []appsv1.StatefulSet, options StatefulSetFilterOptions) ([]appsv1.StatefulSet, error) {
	var filtered []appsv1.StatefulSet

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

	for _, statefulSet := range statefulSets {
		// Filter by namespace
		if options.Namespace != "" && statefulSet.Namespace != options.Namespace {
			continue
		}

		// Apply label selector
		if labelSelector != nil && !labelSelector.Matches(labels.Set(statefulSet.Labels)) {
			continue
		}

		// Apply field selector
		if fieldSelector != nil {
			fields := fields.Set{
				"metadata.name":      statefulSet.Name,
				"metadata.namespace": statefulSet.Namespace,
			}
			if !fieldSelector.Matches(fields) {
				continue
			}
		}

		// Apply text search
		if options.Search != "" {
			searchLower := strings.ToLower(options.Search)
			found := false

			// Search in name
			if strings.Contains(strings.ToLower(statefulSet.Name), searchLower) {
				found = true
			}

			// Search in namespace
			if !found && strings.Contains(strings.ToLower(statefulSet.Namespace), searchLower) {
				found = true
			}

			// Search in labels
			if !found {
				for key, value := range statefulSet.Labels {
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

		filtered = append(filtered, statefulSet)
	}

	// Sort statefulsets
	sortStatefulSets(filtered, options.Sort, options.Order)

	// Apply pagination
	if options.PageSize > 0 {
		start := (options.Page - 1) * options.PageSize
		if start >= len(filtered) {
			return []appsv1.StatefulSet{}, nil
		}
		end := start + options.PageSize
		if end > len(filtered) {
			end = len(filtered)
		}
		filtered = filtered[start:end]
	}

	return filtered, nil
}

// FilterServices filters a list of services based on the given options
func FilterServices(services []v1.Service, options ServiceFilterOptions) ([]v1.Service, error) {
	var filtered []v1.Service

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

	for _, service := range services {
		// Filter by namespace
		if options.Namespace != "" && service.Namespace != options.Namespace {
			continue
		}

		// Apply label selector
		if labelSelector != nil && !labelSelector.Matches(labels.Set(service.Labels)) {
			continue
		}

		// Apply field selector
		if fieldSelector != nil {
			fields := fields.Set{
				"metadata.name":      service.Name,
				"metadata.namespace": service.Namespace,
			}
			if !fieldSelector.Matches(fields) {
				continue
			}
		}

		// Apply text search
		if options.Search != "" {
			searchLower := strings.ToLower(options.Search)
			found := false

			// Search in name
			if strings.Contains(strings.ToLower(service.Name), searchLower) {
				found = true
			}

			// Search in namespace
			if !found && strings.Contains(strings.ToLower(service.Namespace), searchLower) {
				found = true
			}

			// Search in labels
			if !found {
				for key, value := range service.Labels {
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

		filtered = append(filtered, service)
	}

	// Sort services
	sortServices(filtered, options.Sort, options.Order)

	// Apply pagination
	if options.PageSize > 0 {
		start := (options.Page - 1) * options.PageSize
		if start >= len(filtered) {
			return []v1.Service{}, nil
		}
		end := start + options.PageSize
		if end > len(filtered) {
			end = len(filtered)
		}
		filtered = filtered[start:end]
	}

	return filtered, nil
}

// FilterDaemonSets filters a list of daemonsets based on the given options
func FilterDaemonSets(daemonSets []appsv1.DaemonSet, options DaemonSetFilterOptions) ([]appsv1.DaemonSet, error) {
	var filtered []appsv1.DaemonSet

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

	for _, daemonSet := range daemonSets {
		// Filter by namespace
		if options.Namespace != "" && daemonSet.Namespace != options.Namespace {
			continue
		}

		// Apply label selector
		if labelSelector != nil && !labelSelector.Matches(labels.Set(daemonSet.Labels)) {
			continue
		}

		// Apply field selector
		if fieldSelector != nil {
			fields := fields.Set{
				"metadata.name":      daemonSet.Name,
				"metadata.namespace": daemonSet.Namespace,
			}
			if !fieldSelector.Matches(fields) {
				continue
			}
		}

		// Apply text search
		if options.Search != "" {
			searchLower := strings.ToLower(options.Search)
			found := false

			// Search in name
			if strings.Contains(strings.ToLower(daemonSet.Name), searchLower) {
				found = true
			}

			// Search in namespace
			if !found && strings.Contains(strings.ToLower(daemonSet.Namespace), searchLower) {
				found = true
			}

			// Search in labels
			if !found {
				for key, value := range daemonSet.Labels {
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

		filtered = append(filtered, daemonSet)
	}

	// Sort daemonsets
	sortDaemonSets(filtered, options.Sort, options.Order)

	// Apply pagination
	if options.PageSize > 0 {
		start := (options.Page - 1) * options.PageSize
		if start >= len(filtered) {
			return []appsv1.DaemonSet{}, nil
		}
		end := start + options.PageSize
		if end > len(filtered) {
			end = len(filtered)
		}
		filtered = filtered[start:end]
	}

	return filtered, nil
}

// FilterReplicaSets filters a list of replicasets based on the given options
func FilterReplicaSets(replicaSets []appsv1.ReplicaSet, options ReplicaSetFilterOptions) ([]appsv1.ReplicaSet, error) {
	var filtered []appsv1.ReplicaSet

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

	for _, replicaSet := range replicaSets {
		// Filter by namespace
		if options.Namespace != "" && replicaSet.Namespace != options.Namespace {
			continue
		}

		// Apply label selector
		if labelSelector != nil && !labelSelector.Matches(labels.Set(replicaSet.Labels)) {
			continue
		}

		// Apply field selector
		if fieldSelector != nil {
			fields := fields.Set{
				"metadata.name":      replicaSet.Name,
				"metadata.namespace": replicaSet.Namespace,
			}
			if !fieldSelector.Matches(fields) {
				continue
			}
		}

		// Apply text search
		if options.Search != "" {
			searchLower := strings.ToLower(options.Search)
			found := false

			// Search in name
			if strings.Contains(strings.ToLower(replicaSet.Name), searchLower) {
				found = true
			}

			// Search in namespace
			if !found && strings.Contains(strings.ToLower(replicaSet.Namespace), searchLower) {
				found = true
			}

			// Search in labels
			if !found {
				for key, value := range replicaSet.Labels {
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

		filtered = append(filtered, replicaSet)
	}

	// Sort replicasets
	sortReplicaSets(filtered, options.Sort, options.Order)

	// Apply pagination
	if options.PageSize > 0 {
		start := (options.Page - 1) * options.PageSize
		if start >= len(filtered) {
			return []appsv1.ReplicaSet{}, nil
		}
		end := start + options.PageSize
		if end > len(filtered) {
			end = len(filtered)
		}
		filtered = filtered[start:end]
	}

	return filtered, nil
}

// sortDeployments sorts deployments by the specified field and order
func sortDeployments(deployments []appsv1.Deployment, sortField, order string) {
	if sortField == "" {
		sortField = "name"
	}
	if order == "" {
		order = "asc"
	}

	sort.Slice(deployments, func(i, j int) bool {
		var less bool
		switch sortField {
		case "name":
			less = deployments[i].Name < deployments[j].Name
		case "namespace":
			less = deployments[i].Namespace < deployments[j].Namespace
		case "replicas":
			replicasI := int32(0)
			replicasJ := int32(0)
			if deployments[i].Spec.Replicas != nil {
				replicasI = *deployments[i].Spec.Replicas
			}
			if deployments[j].Spec.Replicas != nil {
				replicasJ = *deployments[j].Spec.Replicas
			}
			less = replicasI < replicasJ
		case "age":
			less = deployments[i].CreationTimestamp.Time.After(deployments[j].CreationTimestamp.Time)
		default:
			less = deployments[i].Name < deployments[j].Name
		}

		if order == "desc" {
			return !less
		}
		return less
	})
}

// sortStatefulSets sorts statefulsets by the specified field and order
func sortStatefulSets(statefulSets []appsv1.StatefulSet, sortField, order string) {
	if sortField == "" {
		sortField = "name"
	}
	if order == "" {
		order = "asc"
	}

	sort.Slice(statefulSets, func(i, j int) bool {
		var less bool
		switch sortField {
		case "name":
			less = statefulSets[i].Name < statefulSets[j].Name
		case "namespace":
			less = statefulSets[i].Namespace < statefulSets[j].Namespace
		case "replicas":
			replicasI := int32(0)
			replicasJ := int32(0)
			if statefulSets[i].Spec.Replicas != nil {
				replicasI = *statefulSets[i].Spec.Replicas
			}
			if statefulSets[j].Spec.Replicas != nil {
				replicasJ = *statefulSets[j].Spec.Replicas
			}
			less = replicasI < replicasJ
		case "age":
			less = statefulSets[i].CreationTimestamp.Time.After(statefulSets[j].CreationTimestamp.Time)
		default:
			less = statefulSets[i].Name < statefulSets[j].Name
		}

		if order == "desc" {
			return !less
		}
		return less
	})
}

// sortServices sorts services by the specified field and order
func sortServices(services []v1.Service, sortField, order string) {
	if sortField == "" {
		sortField = "name"
	}
	if order == "" {
		order = "asc"
	}

	sort.Slice(services, func(i, j int) bool {
		var less bool
		switch sortField {
		case "name":
			less = services[i].Name < services[j].Name
		case "namespace":
			less = services[i].Namespace < services[j].Namespace
		case "type":
			less = string(services[i].Spec.Type) < string(services[j].Spec.Type)
		case "age":
			less = services[i].CreationTimestamp.Time.After(services[j].CreationTimestamp.Time)
		default:
			less = services[i].Name < services[j].Name
		}

		if order == "desc" {
			return !less
		}
		return less
	})
}

// sortDaemonSets sorts daemonsets by the specified field and order
func sortDaemonSets(daemonSets []appsv1.DaemonSet, sortField, order string) {
	if sortField == "" {
		sortField = "name"
	}
	if order == "" {
		order = "asc"
	}

	sort.Slice(daemonSets, func(i, j int) bool {
		var less bool
		switch sortField {
		case "name":
			less = daemonSets[i].Name < daemonSets[j].Name
		case "namespace":
			less = daemonSets[i].Namespace < daemonSets[j].Namespace
		case "desired":
			less = daemonSets[i].Status.DesiredNumberScheduled < daemonSets[j].Status.DesiredNumberScheduled
		case "current":
			less = daemonSets[i].Status.CurrentNumberScheduled < daemonSets[j].Status.CurrentNumberScheduled
		case "ready":
			less = daemonSets[i].Status.NumberReady < daemonSets[j].Status.NumberReady
		case "age":
			less = daemonSets[i].CreationTimestamp.Time.After(daemonSets[j].CreationTimestamp.Time)
		default:
			less = daemonSets[i].Name < daemonSets[j].Name
		}

		if order == "desc" {
			return !less
		}
		return less
	})
}

// sortReplicaSets sorts replicasets by the specified field and order
func sortReplicaSets(replicaSets []appsv1.ReplicaSet, sortField, order string) {
	if sortField == "" {
		sortField = "name"
	}
	if order == "" {
		order = "asc"
	}

	sort.Slice(replicaSets, func(i, j int) bool {
		var less bool
		switch sortField {
		case "name":
			less = replicaSets[i].Name < replicaSets[j].Name
		case "namespace":
			less = replicaSets[i].Namespace < replicaSets[j].Namespace
		case "replicas":
			replicasI := int32(0)
			replicasJ := int32(0)
			if replicaSets[i].Spec.Replicas != nil {
				replicasI = *replicaSets[i].Spec.Replicas
			}
			if replicaSets[j].Spec.Replicas != nil {
				replicasJ = *replicaSets[j].Spec.Replicas
			}
			less = replicasI < replicasJ
		case "age":
			less = replicaSets[i].CreationTimestamp.Time.After(replicaSets[j].CreationTimestamp.Time)
		default:
			less = replicaSets[i].Name < replicaSets[j].Name
		}

		if order == "desc" {
			return !less
		}
		return less
	})
}

// FilterJobs filters a list of jobs based on the given options
func FilterJobs(jobs []batchv1.Job, options JobFilterOptions) ([]batchv1.Job, error) {
	var filtered []batchv1.Job

	// Apply namespace filter
	for _, job := range jobs {
		if options.Namespace != "" && job.Namespace != options.Namespace {
			continue
		}

		// Apply label selector
		if options.LabelSelector != "" {
			selector, err := labels.Parse(options.LabelSelector)
			if err != nil {
				return nil, fmt.Errorf("invalid label selector: %w", err)
			}
			if !selector.Matches(labels.Set(job.Labels)) {
				continue
			}
		}

		// Apply field selector
		if options.FieldSelector != "" {
			selector, err := fields.ParseSelector(options.FieldSelector)
			if err != nil {
				return nil, fmt.Errorf("invalid field selector: %w", err)
			}
			// Field selector support for basic fields
			fieldSet := fields.Set{
				"metadata.name":      job.Name,
				"metadata.namespace": job.Namespace,
			}
			if !selector.Matches(fieldSet) {
				continue
			}
		}

		// Apply search filter
		if options.Search != "" {
			searchLower := strings.ToLower(options.Search)
			found := false

			// Search in name
			if strings.Contains(strings.ToLower(job.Name), searchLower) {
				found = true
			}

			// Search in namespace
			if strings.Contains(strings.ToLower(job.Namespace), searchLower) {
				found = true
			}

			// Search in labels
			for k, v := range job.Labels {
				if strings.Contains(strings.ToLower(k), searchLower) ||
					strings.Contains(strings.ToLower(v), searchLower) {
					found = true
					break
				}
			}

			if !found {
				continue
			}
		}

		filtered = append(filtered, job)
	}

	// Sort the results
	sortJobs(filtered, options.Sort, options.Order)

	// Apply pagination
	if options.PageSize > 0 {
		start := (options.Page - 1) * options.PageSize
		if start >= len(filtered) {
			return []batchv1.Job{}, nil
		}

		end := start + options.PageSize
		if end > len(filtered) {
			end = len(filtered)
		}

		filtered = filtered[start:end]
	}

	return filtered, nil
}

// sortJobs sorts jobs by the specified field and order
func sortJobs(jobs []batchv1.Job, sortField, order string) {
	if sortField == "" {
		sortField = "name"
	}
	if order == "" {
		order = "asc"
	}

	sort.Slice(jobs, func(i, j int) bool {
		var less bool
		switch sortField {
		case "name":
			less = jobs[i].Name < jobs[j].Name
		case "namespace":
			less = jobs[i].Namespace < jobs[j].Namespace
		case "completions":
			completionsI := int32(0)
			completionsJ := int32(0)
			if jobs[i].Spec.Completions != nil {
				completionsI = *jobs[i].Spec.Completions
			}
			if jobs[j].Spec.Completions != nil {
				completionsJ = *jobs[j].Spec.Completions
			}
			less = completionsI < completionsJ
		case "duration":
			var durationI, durationJ int64
			if jobs[i].Status.StartTime != nil && jobs[i].Status.CompletionTime != nil {
				durationI = jobs[i].Status.CompletionTime.Unix() - jobs[i].Status.StartTime.Unix()
			}
			if jobs[j].Status.StartTime != nil && jobs[j].Status.CompletionTime != nil {
				durationJ = jobs[j].Status.CompletionTime.Unix() - jobs[j].Status.StartTime.Unix()
			}
			less = durationI < durationJ
		case "age":
			less = jobs[i].CreationTimestamp.Time.After(jobs[j].CreationTimestamp.Time)
		default:
			less = jobs[i].Name < jobs[j].Name
		}

		if order == "desc" {
			return !less
		}
		return less
	})
}

// FilterCronJobs filters a list of cronjobs based on the given options
func FilterCronJobs(cronJobs []batchv1.CronJob, options CronJobFilterOptions) ([]batchv1.CronJob, error) {
	var filtered []batchv1.CronJob

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

	// Apply filters
	for _, cronJob := range cronJobs {
		// Namespace filter
		if options.Namespace != "" && cronJob.Namespace != options.Namespace {
			continue
		}

		// Label selector filter
		if labelSelector != nil {
			cronJobLabels := labels.Set(cronJob.Labels)
			if !labelSelector.Matches(cronJobLabels) {
				continue
			}
		}

		// Field selector filter
		if fieldSelector != nil {
			cronJobFields := fields.Set{
				"metadata.name":      cronJob.Name,
				"metadata.namespace": cronJob.Namespace,
			}
			if !fieldSelector.Matches(cronJobFields) {
				continue
			}
		}

		// Search filter
		if options.Search != "" {
			searchTerm := strings.ToLower(options.Search)
			name := strings.ToLower(cronJob.Name)
			namespace := strings.ToLower(cronJob.Namespace)
			schedule := strings.ToLower(cronJob.Spec.Schedule)

			// Search in labels
			labelMatch := false
			for key, value := range cronJob.Labels {
				if strings.Contains(strings.ToLower(key), searchTerm) ||
					strings.Contains(strings.ToLower(value), searchTerm) {
					labelMatch = true
					break
				}
			}

			if !strings.Contains(name, searchTerm) &&
				!strings.Contains(namespace, searchTerm) &&
				!strings.Contains(schedule, searchTerm) &&
				!labelMatch {
				continue
			}
		}

		filtered = append(filtered, cronJob)
	}

	// Sort
	sortCronJobs(filtered, options.Sort, options.Order)

	// Paginate
	if options.PageSize > 0 {
		start := (options.Page - 1) * options.PageSize
		if start >= len(filtered) {
			return []batchv1.CronJob{}, nil
		}
		end := start + options.PageSize
		if end > len(filtered) {
			end = len(filtered)
		}
		filtered = filtered[start:end]
	}

	return filtered, nil
}

// sortCronJobs sorts cronjobs by the specified field and order
func sortCronJobs(cronJobs []batchv1.CronJob, sortField, order string) {
	if sortField == "" {
		sortField = "name"
	}
	if order == "" {
		order = "asc"
	}

	sort.Slice(cronJobs, func(i, j int) bool {
		var less bool
		switch sortField {
		case "name":
			less = cronJobs[i].Name < cronJobs[j].Name
		case "namespace":
			less = cronJobs[i].Namespace < cronJobs[j].Namespace
		case "schedule":
			less = cronJobs[i].Spec.Schedule < cronJobs[j].Spec.Schedule
		case "suspend":
			suspendI := false
			suspendJ := false
			if cronJobs[i].Spec.Suspend != nil {
				suspendI = *cronJobs[i].Spec.Suspend
			}
			if cronJobs[j].Spec.Suspend != nil {
				suspendJ = *cronJobs[j].Spec.Suspend
			}
			less = !suspendI && suspendJ // Active jobs first
		case "active":
			activeI := len(cronJobs[i].Status.Active)
			activeJ := len(cronJobs[j].Status.Active)
			less = activeI < activeJ
		case "age":
			less = cronJobs[i].CreationTimestamp.Time.After(cronJobs[j].CreationTimestamp.Time)
		default:
			less = cronJobs[i].Name < cronJobs[j].Name
		}

		if order == "desc" {
			return !less
		}
		return less
	})
}

// FilterEndpoints filters a list of endpoints based on the given options
func FilterEndpoints(endpoints []v1.Endpoints, options EndpointsFilterOptions) ([]v1.Endpoints, error) {
	var filtered []v1.Endpoints

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

	for _, endpoint := range endpoints {
		// Filter by namespace
		if options.Namespace != "" && endpoint.Namespace != options.Namespace {
			continue
		}

		// Filter by text search (name, namespace, labels)
		if options.Search != "" {
			searchLower := strings.ToLower(options.Search)
			found := false

			// Search in endpoint name
			if strings.Contains(strings.ToLower(endpoint.Name), searchLower) {
				found = true
			}

			// Search in namespace
			if !found && strings.Contains(strings.ToLower(endpoint.Namespace), searchLower) {
				found = true
			}

			// Search in labels
			if !found {
				for key, value := range endpoint.Labels {
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

		// Apply label selector
		if labelSelector != nil && !labelSelector.Matches(labels.Set(endpoint.Labels)) {
			continue
		}

		// Apply field selector (basic implementation)
		if fieldSelector != nil {
			fieldSet := fields.Set{
				"metadata.name":      endpoint.Name,
				"metadata.namespace": endpoint.Namespace,
			}
			if !fieldSelector.Matches(fieldSet) {
				continue
			}
		}

		filtered = append(filtered, endpoint)
	}

	// Sort
	sortEndpoints(filtered, options.Sort, options.Order)

	// Paginate
	if options.PageSize > 0 {
		start := (options.Page - 1) * options.PageSize
		if start >= len(filtered) {
			return []v1.Endpoints{}, nil
		}
		end := start + options.PageSize
		if end > len(filtered) {
			end = len(filtered)
		}
		filtered = filtered[start:end]
	}

	return filtered, nil
}

// sortEndpoints sorts endpoints by the specified field and order
func sortEndpoints(endpoints []v1.Endpoints, sortField, order string) {
	if sortField == "" {
		sortField = "name"
	}
	if order == "" {
		order = "asc"
	}

	sort.Slice(endpoints, func(i, j int) bool {
		var less bool
		switch sortField {
		case "name":
			less = endpoints[i].Name < endpoints[j].Name
		case "namespace":
			less = endpoints[i].Namespace < endpoints[j].Namespace
		case "subsets":
			less = len(endpoints[i].Subsets) < len(endpoints[j].Subsets)
		case "age":
			less = endpoints[i].CreationTimestamp.Time.After(endpoints[j].CreationTimestamp.Time)
		default:
			less = endpoints[i].Name < endpoints[j].Name
		}

		if order == "desc" {
			return !less
		}
		return less
	})
}

// NetworkPolicyFilterOptions represents filtering options for network policies
type NetworkPolicyFilterOptions struct {
	Namespace     string
	LabelSelector string
	FieldSelector string
	Page          int
	PageSize      int
	Sort          string // Field to sort by (name, namespace, age, ingressRules, egressRules)
	Order         string // Sort order (asc, desc)
	Search        string // Text search across name, namespace, labels
}

// FilterNetworkPolicies filters network policies based on the provided options
func FilterNetworkPolicies(networkPolicies []networkingv1.NetworkPolicy, options NetworkPolicyFilterOptions) ([]networkingv1.NetworkPolicy, error) {
	var filtered []networkingv1.NetworkPolicy

	// Parse label selector if provided
	var labelSelector labels.Selector
	var err error
	if options.LabelSelector != "" {
		labelSelector, err = labels.Parse(options.LabelSelector)
		if err != nil {
			return nil, fmt.Errorf("invalid label selector: %w", err)
		}
	}

	// Parse field selector if provided
	var fieldSelector fields.Selector
	if options.FieldSelector != "" {
		fieldSelector, err = fields.ParseSelector(options.FieldSelector)
		if err != nil {
			return nil, fmt.Errorf("invalid field selector: %w", err)
		}
	}

	for _, networkPolicy := range networkPolicies {
		// Apply namespace filter
		if options.Namespace != "" && networkPolicy.Namespace != options.Namespace {
			continue
		}

		// Apply label selector filter
		if labelSelector != nil && !labelSelector.Matches(labels.Set(networkPolicy.Labels)) {
			continue
		}

		// Apply field selector filter
		if fieldSelector != nil {
			fieldSet := fields.Set{
				"metadata.name":      networkPolicy.Name,
				"metadata.namespace": networkPolicy.Namespace,
			}
			if !fieldSelector.Matches(fieldSet) {
				continue
			}
		}

		// Apply search filter
		if options.Search != "" {
			searchLower := strings.ToLower(options.Search)
			found := false

			// Search in name
			if strings.Contains(strings.ToLower(networkPolicy.Name), searchLower) {
				found = true
			}

			// Search in namespace
			if !found && strings.Contains(strings.ToLower(networkPolicy.Namespace), searchLower) {
				found = true
			}

			// Search in labels
			if !found {
				for key, value := range networkPolicy.Labels {
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

		filtered = append(filtered, networkPolicy)
	}

	// Sort
	sortNetworkPolicies(filtered, options.Sort, options.Order)

	// Paginate
	if options.PageSize > 0 {
		start := (options.Page - 1) * options.PageSize
		if start >= len(filtered) {
			return []networkingv1.NetworkPolicy{}, nil
		}
		end := start + options.PageSize
		if end > len(filtered) {
			end = len(filtered)
		}
		filtered = filtered[start:end]
	}

	return filtered, nil
}

// sortNetworkPolicies sorts network policies by the specified field and order
func sortNetworkPolicies(networkPolicies []networkingv1.NetworkPolicy, sortField, order string) {
	if sortField == "" {
		sortField = "name"
	}
	if order == "" {
		order = "asc"
	}

	sort.Slice(networkPolicies, func(i, j int) bool {
		var less bool
		switch sortField {
		case "name":
			less = networkPolicies[i].Name < networkPolicies[j].Name
		case "namespace":
			less = networkPolicies[i].Namespace < networkPolicies[j].Namespace
		case "age":
			less = networkPolicies[i].CreationTimestamp.Time.After(networkPolicies[j].CreationTimestamp.Time)
		case "ingressRules":
			less = len(networkPolicies[i].Spec.Ingress) < len(networkPolicies[j].Spec.Ingress)
		case "egressRules":
			less = len(networkPolicies[i].Spec.Egress) < len(networkPolicies[j].Spec.Egress)
		default:
			less = networkPolicies[i].Name < networkPolicies[j].Name
		}

		if order == "desc" {
			return !less
		}
		return less
	})
}

// ResourceQuotaFilterOptions represents filtering options for resource quotas
type ResourceQuotaFilterOptions struct {
	Namespace     string
	LabelSelector string
	FieldSelector string
	Page          int
	PageSize      int
	Sort          string // Field to sort by (name, namespace, age)
	Order         string // Sort order (asc, desc)
	Search        string // Text search across name, namespace, labels
}

// FilterResourceQuotas filters and paginates resource quotas based on the provided options
func FilterResourceQuotas(resourceQuotas []v1.ResourceQuota, options ResourceQuotaFilterOptions) ([]v1.ResourceQuota, error) {
	var filtered []v1.ResourceQuota

	// Apply label selector filter
	labelSelector := labels.Everything()
	if options.LabelSelector != "" {
		var err error
		labelSelector, err = labels.Parse(options.LabelSelector)
		if err != nil {
			return nil, fmt.Errorf("invalid label selector: %w", err)
		}
	}

	// Apply field selector filter
	fieldSelector := fields.Everything()
	if options.FieldSelector != "" {
		var err error
		fieldSelector, err = fields.ParseSelector(options.FieldSelector)
		if err != nil {
			return nil, fmt.Errorf("invalid field selector: %w", err)
		}
	}

	for _, rq := range resourceQuotas {
		// Namespace filter
		if options.Namespace != "" && rq.Namespace != options.Namespace {
			continue
		}

		// Label selector filter
		if !labelSelector.Matches(labels.Set(rq.Labels)) {
			continue
		}

		// Field selector filter (basic support for metadata.name and metadata.namespace)
		fieldsSet := fields.Set{
			"metadata.name":      rq.Name,
			"metadata.namespace": rq.Namespace,
		}
		if !fieldSelector.Matches(fieldsSet) {
			continue
		}

		// Search filter
		if options.Search != "" {
			searchLower := strings.ToLower(options.Search)
			found := false

			// Search in name
			if strings.Contains(strings.ToLower(rq.Name), searchLower) {
				found = true
			}

			// Search in namespace
			if !found && strings.Contains(strings.ToLower(rq.Namespace), searchLower) {
				found = true
			}

			// Search in labels
			if !found {
				for key, value := range rq.Labels {
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

		filtered = append(filtered, rq)
	}

	// Sort
	sortResourceQuotas(filtered, options.Sort, options.Order)

	// Paginate
	if options.PageSize > 0 {
		start := (options.Page - 1) * options.PageSize
		if start >= len(filtered) {
			return []v1.ResourceQuota{}, nil
		}
		end := start + options.PageSize
		if end > len(filtered) {
			end = len(filtered)
		}
		filtered = filtered[start:end]
	}

	return filtered, nil
}

// sortResourceQuotas sorts resource quotas by the specified field and order
func sortResourceQuotas(resourceQuotas []v1.ResourceQuota, sortField, order string) {
	if sortField == "" {
		sortField = "name"
	}
	if order == "" {
		order = "asc"
	}

	sort.Slice(resourceQuotas, func(i, j int) bool {
		var less bool
		switch sortField {
		case "name":
			less = resourceQuotas[i].Name < resourceQuotas[j].Name
		case "namespace":
			less = resourceQuotas[i].Namespace < resourceQuotas[j].Namespace
		case "age":
			less = resourceQuotas[i].CreationTimestamp.Time.After(resourceQuotas[j].CreationTimestamp.Time)
		default:
			less = resourceQuotas[i].Name < resourceQuotas[j].Name
		}

		if order == "desc" {
			return !less
		}
		return less
	})
}

// FilterSecrets filters a list of secrets based on the given options
func FilterSecrets(secrets []v1.Secret, options SecretFilterOptions) ([]v1.Secret, error) {
	var filtered []v1.Secret

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

	for _, secret := range secrets {
		// Filter by namespace
		if options.Namespace != "" && secret.Namespace != options.Namespace {
			continue
		}

		// Filter by type
		if options.Type != "" && string(secret.Type) != options.Type {
			continue
		}

		// Apply label selector
		if labelSelector != nil && !labelSelector.Matches(labels.Set(secret.Labels)) {
			continue
		}

		// Apply field selector
		if fieldSelector != nil {
			fields := fields.Set{
				"metadata.name":      secret.Name,
				"metadata.namespace": secret.Namespace,
				"type":               string(secret.Type),
			}
			if !fieldSelector.Matches(fields) {
				continue
			}
		}

		// Apply text search
		if options.Search != "" {
			searchLower := strings.ToLower(options.Search)
			found := false

			// Search in name
			if strings.Contains(strings.ToLower(secret.Name), searchLower) {
				found = true
			}

			// Search in namespace
			if !found && strings.Contains(strings.ToLower(secret.Namespace), searchLower) {
				found = true
			}

			// Search in type
			if !found && strings.Contains(strings.ToLower(string(secret.Type)), searchLower) {
				found = true
			}

			// Search in labels
			if !found {
				for key, value := range secret.Labels {
					if strings.Contains(strings.ToLower(key), searchLower) ||
						strings.Contains(strings.ToLower(value), searchLower) {
						found = true
						break
					}
				}
			}

			// Search in annotations
			if !found {
				for key, value := range secret.Annotations {
					if strings.Contains(strings.ToLower(key), searchLower) ||
						strings.Contains(strings.ToLower(value), searchLower) {
						found = true
						break
					}
				}
			}

			// Search in data keys (but not values for security)
			if !found {
				for key := range secret.Data {
					if strings.Contains(strings.ToLower(key), searchLower) {
						found = true
						break
					}
				}
			}

			if !found {
				continue
			}
		}

		filtered = append(filtered, secret)
	}

	// Sort
	sortSecrets(filtered, options.Sort, options.Order)

	// Paginate
	if options.PageSize > 0 {
		start := (options.Page - 1) * options.PageSize
		if start >= len(filtered) {
			return []v1.Secret{}, nil
		}
		end := start + options.PageSize
		if end > len(filtered) {
			end = len(filtered)
		}
		filtered = filtered[start:end]
	}

	return filtered, nil
}

// sortSecrets sorts secrets by the specified field and order
func sortSecrets(secrets []v1.Secret, sortField, order string) {
	if sortField == "" {
		sortField = "name"
	}
	if order == "" {
		order = "asc"
	}

	sort.Slice(secrets, func(i, j int) bool {
		var less bool
		switch sortField {
		case "name":
			less = secrets[i].Name < secrets[j].Name
		case "namespace":
			less = secrets[i].Namespace < secrets[j].Namespace
		case "type":
			less = string(secrets[i].Type) < string(secrets[j].Type)
		case "keys":
			less = len(secrets[i].Data) < len(secrets[j].Data)
		case "age":
			less = secrets[i].CreationTimestamp.Time.After(secrets[j].CreationTimestamp.Time)
		default:
			less = secrets[i].Name < secrets[j].Name
		}

		if order == "desc" {
			return !less
		}
		return less
	})
}

// FilterEvents filters a list of events based on the given options
func FilterEvents(events []v1.Event, options EventFilterOptions) ([]v1.Event, error) {
	var filtered []v1.Event

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

	for _, event := range events {
		// Filter by namespace
		if options.Namespace != "" && event.Namespace != options.Namespace {
			continue
		}

		// Filter by event type
		if options.Type != "" && event.Type != options.Type {
			continue
		}

		// Filter by event reason
		if options.Reason != "" && event.Reason != options.Reason {
			continue
		}

		// Apply label selector
		if labelSelector != nil && !labelSelector.Matches(labels.Set(event.Labels)) {
			continue
		}

		// Apply field selector
		if fieldSelector != nil {
			fieldSet := fields.Set{
				"metadata.name":      event.Name,
				"metadata.namespace": event.Namespace,
				"type":               event.Type,
				"reason":             event.Reason,
			}
			if !fieldSelector.Matches(fieldSet) {
				continue
			}
		}

		// Apply search filter
		if options.Search != "" {
			searchLower := strings.ToLower(options.Search)
			found := false

			// Search in name
			if strings.Contains(strings.ToLower(event.Name), searchLower) {
				found = true
			}

			// Search in namespace
			if !found && strings.Contains(strings.ToLower(event.Namespace), searchLower) {
				found = true
			}

			// Search in reason
			if !found && strings.Contains(strings.ToLower(event.Reason), searchLower) {
				found = true
			}

			// Search in message
			if !found && strings.Contains(strings.ToLower(event.Message), searchLower) {
				found = true
			}

			// Search in involved object
			if !found {
				involvedObj := fmt.Sprintf("%s/%s", event.InvolvedObject.Kind, event.InvolvedObject.Name)
				if strings.Contains(strings.ToLower(involvedObj), searchLower) {
					found = true
				}
			}

			// Search in labels
			if !found {
				for key, value := range event.Labels {
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

		filtered = append(filtered, event)
	}

	// Sort events
	sortEvents(filtered, options.Sort, options.SortOrder)

	// Apply pagination
	if options.PageSize > 0 {
		start := (options.Page - 1) * options.PageSize
		if start >= len(filtered) {
			return []v1.Event{}, nil
		}
		end := start + options.PageSize
		if end > len(filtered) {
			end = len(filtered)
		}
		filtered = filtered[start:end]
	}

	return filtered, nil
}

// sortEvents sorts events by the specified field and order
func sortEvents(events []v1.Event, sortField, order string) {
	if sortField == "" {
		sortField = "lastTimestamp"
	}
	if order == "" {
		order = "desc"
	}

	sort.Slice(events, func(i, j int) bool {
		var less bool
		switch sortField {
		case "name":
			less = events[i].Name < events[j].Name
		case "namespace":
			less = events[i].Namespace < events[j].Namespace
		case "type":
			less = events[i].Type < events[j].Type
		case "reason":
			less = events[i].Reason < events[j].Reason
		case "lastTimestamp":
			// Handle zero timestamps
			iTime := events[i].LastTimestamp.Time
			jTime := events[j].LastTimestamp.Time
			if iTime.IsZero() {
				iTime = events[i].FirstTimestamp.Time
			}
			if jTime.IsZero() {
				jTime = events[j].FirstTimestamp.Time
			}
			less = iTime.Before(jTime)
		case "firstTimestamp":
			less = events[i].FirstTimestamp.Time.Before(events[j].FirstTimestamp.Time)
		case "count":
			less = events[i].Count < events[j].Count
		case "age":
			less = events[i].CreationTimestamp.Time.After(events[j].CreationTimestamp.Time)
		default:
			// Default to lastTimestamp
			iTime := events[i].LastTimestamp.Time
			jTime := events[j].LastTimestamp.Time
			if iTime.IsZero() {
				iTime = events[i].FirstTimestamp.Time
			}
			if jTime.IsZero() {
				jTime = events[j].FirstTimestamp.Time
			}
			less = iTime.Before(jTime)
		}

		if order == "desc" {
			return !less
		}
		return less
	})
}

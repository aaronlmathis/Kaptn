package selectors

import (
	"fmt"
	"sort"
	"strings"

	appsv1 "k8s.io/api/apps/v1"
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

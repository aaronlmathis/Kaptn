// Package formatters provides domain-specific response formatting functions
// for converting Kubernetes cluster resources to API response formats.
package formatters

import (
	"time"

	"github.com/aaronlmathis/kaptn/internal/k8s/resources"
	v1 "k8s.io/api/core/v1"
)

// ClusterFormatter provides formatting functions for cluster-level resources
type ClusterFormatter struct{}

// NewClusterFormatter creates a new cluster formatter
func NewClusterFormatter() *ClusterFormatter {
	return &ClusterFormatter{}
}

// NamespaceToResponse converts a Namespace to a response format
func (f *ClusterFormatter) NamespaceToResponse(namespace *v1.Namespace) map[string]interface{} {
	// Calculate age
	age := "unknown"
	if !namespace.CreationTimestamp.IsZero() {
		age = calculateAge(namespace.CreationTimestamp.Time)
	}

	// Count labels and annotations
	labelsCount := 0
	annotationsCount := 0
	if namespace.Labels != nil {
		labelsCount = len(namespace.Labels)
	}
	if namespace.Annotations != nil {
		annotationsCount = len(namespace.Annotations)
	}

	return map[string]interface{}{
		"name":              namespace.Name,
		"status":            string(namespace.Status.Phase),
		"age":               age,
		"labelsCount":       labelsCount,
		"annotationsCount":  annotationsCount,
		"creationTimestamp": namespace.CreationTimestamp.Time,
		"labels":            namespace.Labels,
		"annotations":       namespace.Annotations,
	}
}

// NodeToSummary converts a Node to a summary format
func (f *ClusterFormatter) NodeToSummary(node *v1.Node) map[string]interface{} {
	// Extract node roles from labels
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

	// Check if node is ready
	ready := false
	for _, condition := range node.Status.Conditions {
		if condition.Type == v1.NodeReady && condition.Status == v1.ConditionTrue {
			ready = true
			break
		}
	}

	// Extract taints
	taints := []map[string]string{}
	for _, taint := range node.Spec.Taints {
		taints = append(taints, map[string]string{
			"key":    taint.Key,
			"value":  taint.Value,
			"effect": string(taint.Effect),
		})
	}

	return map[string]interface{}{
		"name":              node.Name,
		"roles":             roles,
		"kubeletVersion":    node.Status.NodeInfo.KubeletVersion,
		"ready":             ready,
		"unschedulable":     node.Spec.Unschedulable,
		"taints":            taints,
		"capacity":          node.Status.Capacity,
		"allocatable":       node.Status.Allocatable,
		"creationTimestamp": node.CreationTimestamp.Time,
	}
}

// NodeToEnrichedResponse converts a Kubernetes node to enriched response format with maintenance alerts
func (f *ClusterFormatter) NodeToEnrichedResponse(node *v1.Node) map[string]interface{} {
	// Calculate age
	age := calculateAge(node.CreationTimestamp.Time)

	// Extract node roles from labels
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

	// Analyze node status and conditions
	ready := false
	var conditions []map[string]interface{}
	var alerts []map[string]interface{}

	for _, condition := range node.Status.Conditions {
		conditionMap := map[string]interface{}{
			"type":               string(condition.Type),
			"status":             string(condition.Status),
			"lastTransitionTime": condition.LastTransitionTime.Time,
			"reason":             condition.Reason,
			"message":            condition.Message,
		}
		conditions = append(conditions, conditionMap)

		// Check for maintenance alerts
		if condition.Type == v1.NodeReady && condition.Status != v1.ConditionTrue {
			alerts = append(alerts, map[string]interface{}{
				"type":      "error",
				"message":   "Node is not ready",
				"reason":    condition.Reason,
				"details":   condition.Message,
				"timestamp": condition.LastTransitionTime.Time,
			})
		} else if condition.Type == v1.NodeReady && condition.Status == v1.ConditionTrue {
			ready = true
		}

		// Check for disk pressure
		if condition.Type == v1.NodeDiskPressure && condition.Status == v1.ConditionTrue {
			alerts = append(alerts, map[string]interface{}{
				"type":      "warning",
				"message":   "Node experiencing disk pressure",
				"reason":    condition.Reason,
				"details":   condition.Message,
				"timestamp": condition.LastTransitionTime.Time,
			})
		}

		// Check for memory pressure
		if condition.Type == v1.NodeMemoryPressure && condition.Status == v1.ConditionTrue {
			alerts = append(alerts, map[string]interface{}{
				"type":      "warning",
				"message":   "Node experiencing memory pressure",
				"reason":    condition.Reason,
				"details":   condition.Message,
				"timestamp": condition.LastTransitionTime.Time,
			})
		}

		// Check for PID pressure
		if condition.Type == v1.NodePIDPressure && condition.Status == v1.ConditionTrue {
			alerts = append(alerts, map[string]interface{}{
				"type":      "warning",
				"message":   "Node experiencing PID pressure",
				"reason":    condition.Reason,
				"details":   condition.Message,
				"timestamp": condition.LastTransitionTime.Time,
			})
		}
	}

	// Extract taints
	var taints []map[string]interface{}
	for _, taint := range node.Spec.Taints {
		taintMap := map[string]interface{}{
			"key":    taint.Key,
			"value":  taint.Value,
			"effect": string(taint.Effect),
		}
		if taint.TimeAdded != nil {
			taintMap["timeAdded"] = taint.TimeAdded.Time
		}
		taints = append(taints, taintMap)

		// Add maintenance alerts for certain taints
		if taint.Key == "node.kubernetes.io/not-ready" {
			alerts = append(alerts, map[string]interface{}{
				"type":    "error",
				"message": "Node is tainted as not ready",
				"reason":  "NodeNotReady",
				"details": "Node has not-ready taint",
			})
		}
		if taint.Key == "node.kubernetes.io/unreachable" {
			alerts = append(alerts, map[string]interface{}{
				"type":    "error",
				"message": "Node is unreachable",
				"reason":  "NodeUnreachable",
				"details": "Node has unreachable taint",
			})
		}
	}

	// Calculate resource usage percentages
	var resourceUsage map[string]interface{}
	if node.Status.Capacity != nil && node.Status.Allocatable != nil {
		cpuCapacity := node.Status.Capacity["cpu"]
		cpuAllocatable := node.Status.Allocatable["cpu"]
		memCapacity := node.Status.Capacity["memory"]
		memAllocatable := node.Status.Allocatable["memory"]

		resourceUsage = map[string]interface{}{
			"cpu": map[string]interface{}{
				"capacity":    cpuCapacity.String(),
				"allocatable": cpuAllocatable.String(),
			},
			"memory": map[string]interface{}{
				"capacity":    memCapacity.String(),
				"allocatable": memAllocatable.String(),
			},
		}
	}

	// Node addresses
	var addresses []map[string]interface{}
	for _, addr := range node.Status.Addresses {
		addresses = append(addresses, map[string]interface{}{
			"type":    string(addr.Type),
			"address": addr.Address,
		})
	}

	return map[string]interface{}{
		"name":  node.Name,
		"roles": roles,
		"status": map[string]interface{}{
			"ready":         ready,
			"unschedulable": node.Spec.Unschedulable,
			"conditions":    conditions,
		},
		"alerts":    alerts,
		"taints":    taints,
		"addresses": addresses,
		"nodeInfo": map[string]interface{}{
			"kubeletVersion":   node.Status.NodeInfo.KubeletVersion,
			"kubeProxyVersion": node.Status.NodeInfo.KubeProxyVersion,
			"containerRuntime": node.Status.NodeInfo.ContainerRuntimeVersion,
			"osImage":          node.Status.NodeInfo.OSImage,
			"kernel":           node.Status.NodeInfo.KernelVersion,
			"architecture":     node.Status.NodeInfo.Architecture,
		},
		"resourceUsage":     resourceUsage,
		"capacity":          node.Status.Capacity,
		"allocatable":       node.Status.Allocatable,
		"age":               age,
		"labels":            node.Labels,
		"annotations":       node.Annotations,
		"creationTimestamp": node.CreationTimestamp.Time,
	}
}

// FormatNamespaceSummary creates a basic namespace summary
func FormatNamespaceSummary(namespace *v1.Namespace) map[string]interface{} {
	// Calculate age
	age := "unknown"
	if !namespace.CreationTimestamp.IsZero() {
		age = time.Since(namespace.CreationTimestamp.Time).String()
	}

	// Count labels and annotations
	labelsCount := 0
	annotationsCount := 0
	if namespace.Labels != nil {
		labelsCount = len(namespace.Labels)
	}
	if namespace.Annotations != nil {
		annotationsCount = len(namespace.Annotations)
	}

	return map[string]interface{}{
		"name":              namespace.Name,
		"status":            string(namespace.Status.Phase),
		"age":               age,
		"labelsCount":       labelsCount,
		"annotationsCount":  annotationsCount,
		"creationTimestamp": namespace.CreationTimestamp.Time,
		"labels":            namespace.Labels,
		"annotations":       namespace.Annotations,
	}
}

// APIResourceToResponse converts an API resource to response format
func (f *ClusterFormatter) APIResourceToResponse(resource resources.APIResource) map[string]interface{} {
	shortNamesStr := ""
	if len(resource.ShortNames) > 0 {
		for i, shortName := range resource.ShortNames {
			if i > 0 {
				shortNamesStr += ","
			}
			shortNamesStr += shortName
		}
	}

	categoriesStr := ""
	if len(resource.Categories) > 0 {
		for i, category := range resource.Categories {
			if i > 0 {
				categoriesStr += ","
			}
			categoriesStr += category
		}
	}

	verbsStr := ""
	if len(resource.Verbs) > 0 {
		for i, verb := range resource.Verbs {
			if i > 0 {
				verbsStr += ","
			}
			verbsStr += verb
		}
	}

	namespacedStr := "false"
	if resource.Namespaced {
		namespacedStr = "true"
	}

	return map[string]interface{}{
		"id":           resource.ID,
		"name":         resource.Name,
		"singularName": resource.SingularName,
		"shortNames":   shortNamesStr,
		"kind":         resource.Kind,
		"group":        resource.Group,
		"version":      resource.Version,
		"apiVersion":   resource.APIVersion,
		"namespaced":   namespacedStr,
		"categories":   categoriesStr,
		"verbs":        verbsStr,
	}
}

// APIResourceToEnrichedResponse converts an API resource to enriched response format
func (f *ClusterFormatter) APIResourceToEnrichedResponse(resource resources.APIResource) map[string]interface{} {
	// Create summary-like response for details view
	return map[string]interface{}{
		"summary": map[string]interface{}{
			"name":            resource.Name,
			"singularName":    resource.SingularName,
			"shortNames":      resource.ShortNames,
			"kind":            resource.Kind,
			"group":           resource.Group,
			"version":         resource.Version,
			"apiVersion":      resource.APIVersion,
			"namespaced":      resource.Namespaced,
			"categories":      resource.Categories,
			"verbs":           resource.Verbs,
			"shortNamesCount": len(resource.ShortNames),
			"categoriesCount": len(resource.Categories),
			"verbsCount":      len(resource.Verbs),
		},
		"metadata": map[string]interface{}{
			"name":       resource.Name,
			"kind":       resource.Kind,
			"apiVersion": resource.APIVersion,
		},
		"kind":       resource.Kind,
		"apiVersion": resource.APIVersion,
	}
}

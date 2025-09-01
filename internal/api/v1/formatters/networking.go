// Package formatters provides domain-specific response formatting functions
// for converting Kubernetes networking resources to API response formats.
package formatters

import (
	"fmt"
	"time"

	v1 "k8s.io/api/core/v1"
	networkingv1 "k8s.io/api/networking/v1"
)

// NetworkingFormatter provides formatting functions for networking resources
type NetworkingFormatter struct{}

// NewNetworkingFormatter creates a new networking formatter
func NewNetworkingFormatter() *NetworkingFormatter {
	return &NetworkingFormatter{}
}

// ServiceToResponse converts a Kubernetes service to response format
func (f *NetworkingFormatter) ServiceToResponse(service v1.Service) map[string]interface{} {
	// Calculate age
	age := calculateAge(service.CreationTimestamp.Time)

	// Prepare ports information
	var ports []map[string]interface{}
	for _, port := range service.Spec.Ports {
		portInfo := map[string]interface{}{
			"name":       port.Name,
			"port":       port.Port,
			"protocol":   string(port.Protocol),
			"targetPort": port.TargetPort.String(),
		}
		if port.NodePort != 0 {
			portInfo["nodePort"] = port.NodePort
		}
		ports = append(ports, portInfo)
	}

	// Prepare selector information
	selector := service.Spec.Selector
	if selector == nil {
		selector = make(map[string]string)
	}

	// Get external IPs
	var externalIPs []string
	externalIPs = append(externalIPs, service.Spec.ExternalIPs...)

	// Add LoadBalancer ingress IPs/hostnames
	for _, ingress := range service.Status.LoadBalancer.Ingress {
		if ingress.IP != "" {
			externalIPs = append(externalIPs, ingress.IP)
		}
		if ingress.Hostname != "" {
			externalIPs = append(externalIPs, ingress.Hostname)
		}
	}

	return map[string]interface{}{
		"name":              service.Name,
		"namespace":         service.Namespace,
		"type":              string(service.Spec.Type),
		"clusterIP":         service.Spec.ClusterIP,
		"externalIPs":       externalIPs,
		"ports":             ports,
		"selector":          selector,
		"age":               age,
		"labels":            service.Labels,
		"annotations":       service.Annotations,
		"creationTimestamp": service.CreationTimestamp.Time,
	}
}

// IngressToResponse converts an Ingress to a response format
func (f *NetworkingFormatter) IngressToResponse(ingress interface{}) map[string]interface{} {
	// Handle both unstructured and typed ingresses
	var ingressObj map[string]interface{}

	switch ing := ingress.(type) {
	case map[string]interface{}:
		ingressObj = ing
	default:
		// This should not happen with the current implementation, but handle it gracefully
		return map[string]interface{}{
			"name":      "unknown",
			"namespace": "unknown",
			"error":     "unsupported ingress type",
		}
	}

	metadata, _ := ingressObj["metadata"].(map[string]interface{})
	spec, _ := ingressObj["spec"].(map[string]interface{})
	status, _ := ingressObj["status"].(map[string]interface{})

	name, _ := metadata["name"].(string)
	namespace, _ := metadata["namespace"].(string)
	creationTimestamp, _ := metadata["creationTimestamp"].(string)
	labels, _ := metadata["labels"].(map[string]interface{})
	annotations, _ := metadata["annotations"].(map[string]interface{})

	// Calculate age
	age := "Unknown"
	if creationTimestamp != "" {
		if createdTime, err := time.Parse(time.RFC3339, creationTimestamp); err == nil {
			age = calculateAge(createdTime)
		}
	}

	// Extract ingress class
	ingressClass := "Unknown"
	if ic, ok := spec["ingressClassName"].(string); ok && ic != "" {
		ingressClass = ic
	} else if annotations != nil {
		if ic, ok := annotations["kubernetes.io/ingress.class"].(string); ok && ic != "" {
			ingressClass = ic
		}
	}

	// Extract hosts and paths
	hosts := []string{}
	paths := []string{}

	if rules, ok := spec["rules"].([]interface{}); ok {
		for _, ruleInterface := range rules {
			if rule, ok := ruleInterface.(map[string]interface{}); ok {
				if host, ok := rule["host"].(string); ok && host != "" {
					hosts = append(hosts, host)
				}

				if http, ok := rule["http"].(map[string]interface{}); ok {
					if pathsArray, ok := http["paths"].([]interface{}); ok {
						for _, pathInterface := range pathsArray {
							if pathObj, ok := pathInterface.(map[string]interface{}); ok {
								if pathStr, ok := pathObj["path"].(string); ok && pathStr != "" {
									paths = append(paths, pathStr)
								}
							}
						}
					}
				}
			}
		}
	}

	// Extract external IPs/load balancer ingress
	externalIPs := []string{}
	if status != nil {
		if loadBalancer, ok := status["loadBalancer"].(map[string]interface{}); ok {
			if ingressArray, ok := loadBalancer["ingress"].([]interface{}); ok {
				for _, ingressInterface := range ingressArray {
					if ingressItem, ok := ingressInterface.(map[string]interface{}); ok {
						if ip, ok := ingressItem["ip"].(string); ok && ip != "" {
							externalIPs = append(externalIPs, ip)
						}
						if hostname, ok := ingressItem["hostname"].(string); ok && hostname != "" {
							externalIPs = append(externalIPs, hostname)
						}
					}
				}
			}
		}
	}

	// Format hosts display
	hostsDisplay := "N/A"
	if len(hosts) > 0 {
		if len(hosts) == 1 {
			hostsDisplay = hosts[0]
		} else {
			hostsDisplay = fmt.Sprintf("%s (+%d more)", hosts[0], len(hosts)-1)
		}
	}

	// Format external IPs display
	externalIPsDisplay := "N/A"
	if len(externalIPs) > 0 {
		if len(externalIPs) == 1 {
			externalIPsDisplay = externalIPs[0]
		} else {
			externalIPsDisplay = fmt.Sprintf("%s (+%d more)", externalIPs[0], len(externalIPs)-1)
		}
	}

	return map[string]interface{}{
		"name":               name,
		"namespace":          namespace,
		"age":                age,
		"ingressClass":       ingressClass,
		"hosts":              hosts,
		"hostsDisplay":       hostsDisplay,
		"paths":              paths,
		"externalIPs":        externalIPs,
		"externalIPsDisplay": externalIPsDisplay,
		"creationTimestamp":  creationTimestamp,
		"labels":             labels,
		"annotations":        annotations,
	}
}

// EndpointsToResponse converts a Kubernetes endpoints to response format
func (f *NetworkingFormatter) EndpointsToResponse(endpoint v1.Endpoints) map[string]interface{} {
	age := calculateAge(endpoint.CreationTimestamp.Time)

	// Calculate total addresses across all subsets
	totalAddresses := 0
	totalPorts := 0
	var addresses []string
	var ports []string

	for _, subset := range endpoint.Subsets {
		totalAddresses += len(subset.Addresses) + len(subset.NotReadyAddresses)
		totalPorts += len(subset.Ports)

		// Collect unique addresses
		for _, addr := range subset.Addresses {
			addresses = append(addresses, addr.IP)
		}
		for _, addr := range subset.NotReadyAddresses {
			addresses = append(addresses, addr.IP+" (not ready)")
		}

		// Collect unique ports
		for _, port := range subset.Ports {
			portStr := fmt.Sprintf("%d", port.Port)
			if port.Name != "" {
				portStr = fmt.Sprintf("%s:%d", port.Name, port.Port)
			}
			if port.Protocol != "" {
				portStr = fmt.Sprintf("%s/%s", portStr, port.Protocol)
			}
			ports = append(ports, portStr)
		}
	}

	// Format addresses display
	addressesDisplay := "None"
	if totalAddresses > 0 {
		if totalAddresses == 1 && len(addresses) > 0 {
			addressesDisplay = addresses[0]
		} else {
			addressesDisplay = fmt.Sprintf("%d address(es)", totalAddresses)
		}
	}

	// Format ports display
	portsDisplay := "None"
	if totalPorts > 0 {
		if totalPorts == 1 && len(ports) > 0 {
			portsDisplay = ports[0]
		} else {
			portsDisplay = fmt.Sprintf("%d port(s)", totalPorts)
		}
	}

	return map[string]interface{}{
		"name":              endpoint.Name,
		"namespace":         endpoint.Namespace,
		"age":               age,
		"subsets":           len(endpoint.Subsets),
		"totalAddresses":    totalAddresses,
		"totalPorts":        totalPorts,
		"addresses":         addresses,
		"ports":             ports,
		"addressesDisplay":  addressesDisplay,
		"portsDisplay":      portsDisplay,
		"creationTimestamp": endpoint.CreationTimestamp.Time,
		"labels":            endpoint.Labels,
		"annotations":       endpoint.Annotations,
	}
}

// EndpointSliceToResponse converts a Kubernetes EndpointSlice to response format
func (f *NetworkingFormatter) EndpointSliceToResponse(endpointSlice interface{}) map[string]interface{} {
	endpointSliceMap, ok := endpointSlice.(map[string]interface{})
	if !ok {
		return map[string]interface{}{}
	}

	// Extract metadata
	metadata, _ := endpointSliceMap["metadata"].(map[string]interface{})
	name, _ := metadata["name"].(string)
	namespace, _ := metadata["namespace"].(string)
	labels, _ := metadata["labels"].(map[string]interface{})
	annotations, _ := metadata["annotations"].(map[string]interface{})

	// Extract creation timestamp and calculate age
	var age string
	var creationTimestamp interface{}
	if creationTimestampStr, ok := metadata["creationTimestamp"].(string); ok {
		if creationTime, err := time.Parse(time.RFC3339, creationTimestampStr); err == nil {
			age = calculateAge(creationTime)
			creationTimestamp = creationTime
		}
	}

	// Extract addressType from spec
	spec, _ := endpointSliceMap["spec"].(map[string]interface{})
	addressType, _ := spec["addressType"].(string)

	// Extract endpoints from spec
	endpoints, _ := spec["endpoints"].([]interface{})
	endpointCount := len(endpoints)

	// Count ready and not ready endpoints
	readyCount := 0
	notReadyCount := 0
	addresses := make([]string, 0) // Initialize as empty slice, not nil

	for _, ep := range endpoints {
		if epMap, ok := ep.(map[string]interface{}); ok {
			// Check if endpoint is ready
			conditions, _ := epMap["conditions"].(map[string]interface{})
			ready, _ := conditions["ready"].(bool)

			if ready {
				readyCount++
			} else {
				notReadyCount++
			}

			// Extract addresses
			if addressesSlice, ok := epMap["addresses"].([]interface{}); ok {
				for _, addr := range addressesSlice {
					if addrStr, ok := addr.(string); ok {
						statusSuffix := ""
						if !ready {
							statusSuffix = " (not ready)"
						}
						addresses = append(addresses, addrStr+statusSuffix)
					}
				}
			}
		}
	}

	// Extract ports from spec
	ports, _ := spec["ports"].([]interface{})
	portCount := len(ports)
	portStrings := make([]string, 0) // Initialize as empty slice, not nil

	for _, port := range ports {
		if portMap, ok := port.(map[string]interface{}); ok {
			portNum, _ := portMap["port"].(float64) // JSON numbers are float64
			portName, _ := portMap["name"].(string)
			protocol, _ := portMap["protocol"].(string)

			portStr := fmt.Sprintf("%.0f", portNum)
			if portName != "" {
				portStr = fmt.Sprintf("%s:%.0f", portName, portNum)
			}
			if protocol != "" {
				portStr = fmt.Sprintf("%s/%s", portStr, protocol)
			}
			portStrings = append(portStrings, portStr)
		}
	}

	// Format addresses display
	addressesDisplay := "None"
	if len(addresses) > 0 {
		if len(addresses) == 1 {
			addressesDisplay = addresses[0]
		} else {
			addressesDisplay = fmt.Sprintf("%d address(es)", len(addresses))
		}
	}

	// Format ready status
	readyStatus := fmt.Sprintf("%d/%d", readyCount, endpointCount)

	// Format ports display
	portsDisplay := "None"
	if len(portStrings) > 0 {
		if len(portStrings) == 1 {
			portsDisplay = portStrings[0]
		} else {
			portsDisplay = fmt.Sprintf("%d port(s)", len(portStrings))
		}
	}

	return map[string]interface{}{
		"name":              name,
		"namespace":         namespace,
		"age":               age,
		"addressType":       addressType,
		"endpoints":         endpointCount,
		"ready":             readyStatus,
		"readyCount":        readyCount,
		"notReadyCount":     notReadyCount,
		"ports":             portCount,
		"addresses":         addresses,
		"portStrings":       portStrings,
		"addressesDisplay":  addressesDisplay,
		"portsDisplay":      portsDisplay,
		"creationTimestamp": creationTimestamp,
		"labels":            labels,
		"annotations":       annotations,
	}
}

// NetworkPolicyToResponse converts a NetworkPolicy to a response format
func (f *NetworkingFormatter) NetworkPolicyToResponse(networkPolicy networkingv1.NetworkPolicy) map[string]interface{} {
	age := calculateAge(networkPolicy.CreationTimestamp.Time)

	// Format pod selector
	podSelector := "All Pods"
	if networkPolicy.Spec.PodSelector.MatchLabels != nil && len(networkPolicy.Spec.PodSelector.MatchLabels) > 0 {
		selectorParts := make([]string, 0, len(networkPolicy.Spec.PodSelector.MatchLabels))
		for key, value := range networkPolicy.Spec.PodSelector.MatchLabels {
			selectorParts = append(selectorParts, fmt.Sprintf("%s=%s", key, value))
		}
		podSelector = fmt.Sprintf("%d label(s)", len(selectorParts))
	}

	// Count ingress and egress rules
	ingressRules := len(networkPolicy.Spec.Ingress)
	egressRules := len(networkPolicy.Spec.Egress)

	// Format policy types
	policyTypes := ""
	if len(networkPolicy.Spec.PolicyTypes) > 0 {
		for i, policyType := range networkPolicy.Spec.PolicyTypes {
			if i > 0 {
				policyTypes += ", "
			}
			policyTypes += string(policyType)
		}
	} else {
		policyTypes = "Ingress"
	}

	// For now, we'll set affectedPods to 0 as calculating this requires querying pods
	// This could be enhanced later with actual pod counting
	affectedPods := 0

	return map[string]interface{}{
		"name":              networkPolicy.Name,
		"namespace":         networkPolicy.Namespace,
		"age":               age,
		"podSelector":       podSelector,
		"ingressRules":      ingressRules,
		"egressRules":       egressRules,
		"policyTypes":       policyTypes,
		"affectedPods":      affectedPods,
		"creationTimestamp": networkPolicy.CreationTimestamp.Time,
		"labels":            networkPolicy.Labels,
		"annotations":       networkPolicy.Annotations,
	}
}

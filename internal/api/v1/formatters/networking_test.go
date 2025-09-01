package formatters

import (
	"testing"
	"time"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/util/intstr"
)

func TestNetworkingFormatter_ServiceToResponse(t *testing.T) {
	formatter := &NetworkingFormatter{}
	
	service := &corev1.Service{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "test-service",
			Namespace: "default",
			Labels: map[string]string{
				"app": "test",
			},
			CreationTimestamp: metav1.Time{Time: time.Now().Add(-24 * time.Hour)},
		},
		Spec: corev1.ServiceSpec{
			Type:     corev1.ServiceTypeClusterIP,
			ClusterIP: "10.96.0.1",
			Ports: []corev1.ServicePort{
				{
					Name:     "http",
					Protocol: corev1.ProtocolTCP,
					Port:     80,
					TargetPort: intstr.FromInt(8080),
				},
			},
			Selector: map[string]string{
				"app": "test",
			},
		},
	}

	result := formatter.ServiceToResponse(*service)

	if result["name"] != "test-service" {
		t.Errorf("Expected name 'test-service', got %v", result["name"])
	}
	
	if result["namespace"] != "default" {
		t.Errorf("Expected namespace 'default', got %v", result["namespace"])
	}
	
	if result["type"] != "ClusterIP" {
		t.Errorf("Expected type 'ClusterIP', got %v", result["type"])
	}
	
	if result["clusterIP"] != "10.96.0.1" {
		t.Errorf("Expected clusterIP '10.96.0.1', got %v", result["clusterIP"])
	}
}

func TestNetworkingFormatter_IngressToResponse(t *testing.T) {
	formatter := &NetworkingFormatter{}
	
	// Create unstructured ingress object as the method expects
	ingress := map[string]interface{}{
		"metadata": map[string]interface{}{
			"name":      "test-ingress",
			"namespace": "default",
			"labels": map[string]string{
				"app": "test",
			},
			"creationTimestamp": time.Now().Add(-12 * time.Hour).Format(time.RFC3339),
		},
		"spec": map[string]interface{}{
			"rules": []interface{}{
				map[string]interface{}{
					"host": "example.com",
					"http": map[string]interface{}{
						"paths": []interface{}{
							map[string]interface{}{
								"path":     "/api",
								"pathType": "Prefix",
								"backend": map[string]interface{}{
									"service": map[string]interface{}{
										"name": "api-service",
										"port": map[string]interface{}{
											"number": 80,
										},
									},
								},
							},
						},
					},
				},
			},
		},
	}

	result := formatter.IngressToResponse(ingress)

	if result["name"] != "test-ingress" {
		t.Errorf("Expected name 'test-ingress', got %v", result["name"])
	}
	
	if result["namespace"] != "default" {
		t.Errorf("Expected namespace 'default', got %v", result["namespace"])
	}
	
	// Check that hosts array exists and contains expected host
	hosts, ok := result["hosts"].([]string)
	if !ok || len(hosts) != 1 {
		t.Errorf("Expected 1 host, got %v", result["hosts"])
	} else {
		if hosts[0] != "example.com" {
			t.Errorf("Expected host 'example.com', got %v", hosts[0])
		}
	}
	
	// Check that paths array exists
	paths, ok := result["paths"].([]string)
	if !ok || len(paths) != 1 {
		t.Errorf("Expected 1 path, got %v", result["paths"])
	} else {
		if paths[0] != "/api" {
			t.Errorf("Expected path '/api', got %v", paths[0])
		}
	}
}

func TestNetworkingFormatter_EndpointsToResponse(t *testing.T) {
	
	endpoints := &corev1.Endpoints{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "test-endpoints",
			Namespace: "default",
			CreationTimestamp: metav1.Time{Time: time.Now().Add(-6 * time.Hour)},
		},
		Subsets: []corev1.EndpointSubset{
			{
				Addresses: []corev1.EndpointAddress{
					{
						IP: "192.168.1.10",
						TargetRef: &corev1.ObjectReference{
							Kind: "Pod",
							Name: "test-pod-1",
						},
					},
					{
						IP: "192.168.1.11", 
						TargetRef: &corev1.ObjectReference{
							Kind: "Pod",
							Name: "test-pod-2",
						},
					},
				},
				Ports: []corev1.EndpointPort{
					{
						Name:     "http",
						Port:     8080,
						Protocol: corev1.ProtocolTCP,
					},
				},
			},
		},
	}

	formatter := &NetworkingFormatter{}
	result := formatter.EndpointsToResponse(*endpoints)

	if result["name"] != "test-endpoints" {
		t.Errorf("Expected name 'test-endpoints', got %v", result["name"])
	}
	
	if result["namespace"] != "default" {
		t.Errorf("Expected namespace 'default', got %v", result["namespace"])
	}
	
	// Check that subsets count is correct
	subsetsCount, ok := result["subsets"].(int)
	if !ok || subsetsCount != 1 {
		t.Errorf("Expected 1 subset, got %v", result["subsets"])
	}
	
	// Check addresses array (flat string array)
	addresses, ok := result["addresses"].([]string)
	if !ok || len(addresses) != 2 {
		t.Errorf("Expected 2 addresses, got %v", result["addresses"])
	} else {
		if addresses[0] != "192.168.1.10" {
			t.Errorf("Expected first IP '192.168.1.10', got %v", addresses[0])
		}
		if addresses[1] != "192.168.1.11" {
			t.Errorf("Expected second IP '192.168.1.11', got %v", addresses[1])
		}
	}
	
	// Check ports array (flat string array)
	ports, ok := result["ports"].([]string)
	if !ok || len(ports) != 1 {
		t.Errorf("Expected 1 port, got %v", result["ports"])
	} else {
		// Port format should be "http:8080/TCP"
		if ports[0] != "http:8080/TCP" {
			t.Errorf("Expected port 'http:8080/TCP', got %v", ports[0])
		}
	}
}

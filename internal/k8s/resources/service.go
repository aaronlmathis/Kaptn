package resources

import (
	"context"
	"fmt"

	"go.uber.org/zap"
	appsv1 "k8s.io/api/apps/v1"
	v1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/kubernetes"
)

// ResourceManager provides advanced resource management operations
type ResourceManager struct {
	logger        *zap.Logger
	kubeClient    kubernetes.Interface
	dynamicClient dynamic.Interface
}

// ScaleRequest represents a request to scale a resource
type ScaleRequest struct {
	Namespace string `json:"namespace"`
	Name      string `json:"name"`
	Kind      string `json:"kind"`
	Replicas  int32  `json:"replicas"`
}

// DeleteRequest represents a request to delete resources
type DeleteRequest struct {
	Namespace          string `json:"namespace"`
	Name               string `json:"name"`
	Kind               string `json:"kind"`
	DeletePods         bool   `json:"deletePods"` // For deployments/statefulsets
	GracePeriodSeconds *int64 `json:"gracePeriodSeconds,omitempty"`
}

// NamespaceRequest represents a request to create/delete a namespace
type NamespaceRequest struct {
	Name   string            `json:"name"`
	Labels map[string]string `json:"labels,omitempty"`
}

// ResourceExport represents an exported resource
type ResourceExport struct {
	APIVersion string      `json:"apiVersion"`
	Kind       string      `json:"kind"`
	Metadata   interface{} `json:"metadata"`
	Spec       interface{} `json:"spec"`
}

// NewResourceManager creates a new resource manager
func NewResourceManager(logger *zap.Logger, kubeClient kubernetes.Interface, dynamicClient dynamic.Interface) *ResourceManager {
	return &ResourceManager{
		logger:        logger,
		kubeClient:    kubeClient,
		dynamicClient: dynamicClient,
	}
}

// ScaleResource scales a deployment, replicaset, or statefulset
func (rm *ResourceManager) ScaleResource(ctx context.Context, req ScaleRequest) error {
	rm.logger.Info("Scaling resource",
		zap.String("namespace", req.Namespace),
		zap.String("name", req.Name),
		zap.String("kind", req.Kind),
		zap.Int32("replicas", req.Replicas))

	switch req.Kind {
	case "Deployment":
		return rm.scaleDeployment(ctx, req.Namespace, req.Name, req.Replicas)
	case "ReplicaSet":
		return rm.scaleReplicaSet(ctx, req.Namespace, req.Name, req.Replicas)
	case "StatefulSet":
		return rm.scaleStatefulSet(ctx, req.Namespace, req.Name, req.Replicas)
	default:
		return fmt.Errorf("unsupported resource kind for scaling: %s", req.Kind)
	}
}

// scaleDeployment scales a deployment
func (rm *ResourceManager) scaleDeployment(ctx context.Context, namespace, name string, replicas int32) error {
	deployment, err := rm.kubeClient.AppsV1().Deployments(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return fmt.Errorf("failed to get deployment: %w", err)
	}

	deployment.Spec.Replicas = &replicas
	_, err = rm.kubeClient.AppsV1().Deployments(namespace).Update(ctx, deployment, metav1.UpdateOptions{})
	if err != nil {
		return fmt.Errorf("failed to scale deployment: %w", err)
	}

	return nil
}

// scaleReplicaSet scales a replicaset
func (rm *ResourceManager) scaleReplicaSet(ctx context.Context, namespace, name string, replicas int32) error {
	replicaSet, err := rm.kubeClient.AppsV1().ReplicaSets(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return fmt.Errorf("failed to get replicaset: %w", err)
	}

	replicaSet.Spec.Replicas = &replicas
	_, err = rm.kubeClient.AppsV1().ReplicaSets(namespace).Update(ctx, replicaSet, metav1.UpdateOptions{})
	if err != nil {
		return fmt.Errorf("failed to scale replicaset: %w", err)
	}

	return nil
}

// scaleStatefulSet scales a statefulset
func (rm *ResourceManager) scaleStatefulSet(ctx context.Context, namespace, name string, replicas int32) error {
	statefulSet, err := rm.kubeClient.AppsV1().StatefulSets(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return fmt.Errorf("failed to get statefulset: %w", err)
	}

	statefulSet.Spec.Replicas = &replicas
	_, err = rm.kubeClient.AppsV1().StatefulSets(namespace).Update(ctx, statefulSet, metav1.UpdateOptions{})
	if err != nil {
		return fmt.Errorf("failed to scale statefulset: %w", err)
	}

	return nil
}

// DeleteResource deletes a resource with optional cascade options
func (rm *ResourceManager) DeleteResource(ctx context.Context, req DeleteRequest) error {
	rm.logger.Info("Deleting resource",
		zap.String("namespace", req.Namespace),
		zap.String("name", req.Name),
		zap.String("kind", req.Kind),
		zap.Bool("deletePods", req.DeletePods))

	deleteOptions := metav1.DeleteOptions{}
	if req.GracePeriodSeconds != nil {
		deleteOptions.GracePeriodSeconds = req.GracePeriodSeconds
	}

	// Set propagation policy
	if req.DeletePods {
		foreground := metav1.DeletePropagationForeground
		deleteOptions.PropagationPolicy = &foreground
	} else {
		orphan := metav1.DeletePropagationOrphan
		deleteOptions.PropagationPolicy = &orphan
	}

	switch req.Kind {
	case "Pod":
		return rm.kubeClient.CoreV1().Pods(req.Namespace).Delete(ctx, req.Name, deleteOptions)
	case "Deployment":
		return rm.kubeClient.AppsV1().Deployments(req.Namespace).Delete(ctx, req.Name, deleteOptions)
	case "ReplicaSet":
		return rm.kubeClient.AppsV1().ReplicaSets(req.Namespace).Delete(ctx, req.Name, deleteOptions)
	case "StatefulSet":
		return rm.kubeClient.AppsV1().StatefulSets(req.Namespace).Delete(ctx, req.Name, deleteOptions)
	case "Service":
		return rm.kubeClient.CoreV1().Services(req.Namespace).Delete(ctx, req.Name, deleteOptions)
	case "ConfigMap":
		return rm.kubeClient.CoreV1().ConfigMaps(req.Namespace).Delete(ctx, req.Name, deleteOptions)
	case "Secret":
		return rm.kubeClient.CoreV1().Secrets(req.Namespace).Delete(ctx, req.Name, deleteOptions)
	default:
		return fmt.Errorf("unsupported resource kind for deletion: %s", req.Kind)
	}
}

// CreateNamespace creates a new namespace
func (rm *ResourceManager) CreateNamespace(ctx context.Context, req NamespaceRequest) error {
	rm.logger.Info("Creating namespace", zap.String("name", req.Name))

	namespace := &v1.Namespace{
		ObjectMeta: metav1.ObjectMeta{
			Name:   req.Name,
			Labels: req.Labels,
		},
	}

	_, err := rm.kubeClient.CoreV1().Namespaces().Create(ctx, namespace, metav1.CreateOptions{})
	if err != nil {
		if errors.IsAlreadyExists(err) {
			return fmt.Errorf("namespace %s already exists", req.Name)
		}
		return fmt.Errorf("failed to create namespace: %w", err)
	}

	return nil
}

// DeleteNamespace deletes a namespace
func (rm *ResourceManager) DeleteNamespace(ctx context.Context, name string) error {
	rm.logger.Info("Deleting namespace", zap.String("name", name))

	// Check if namespace is a system namespace
	systemNamespaces := []string{"kube-system", "kube-public", "kube-node-lease", "default"}
	for _, sysNs := range systemNamespaces {
		if name == sysNs {
			return fmt.Errorf("cannot delete system namespace: %s", name)
		}
	}

	err := rm.kubeClient.CoreV1().Namespaces().Delete(ctx, name, metav1.DeleteOptions{})
	if err != nil {
		return fmt.Errorf("failed to delete namespace: %w", err)
	}

	return nil
}

// ExportResource exports a resource as YAML
func (rm *ResourceManager) ExportResource(ctx context.Context, namespace, name, kind string) (*ResourceExport, error) {
	var obj *unstructured.Unstructured

	switch kind {
	case "Pod":
		pod, err := rm.kubeClient.CoreV1().Pods(namespace).Get(ctx, name, metav1.GetOptions{})
		if err != nil {
			return nil, err
		}
		unstructuredPod := rm.convertToUnstructured(pod)
		if unstructuredPod == nil {
			return nil, fmt.Errorf("failed to convert Pod to unstructured")
		}
		obj = rm.stripManagedFields(unstructuredPod)
	case "Deployment":
		deployment, err := rm.kubeClient.AppsV1().Deployments(namespace).Get(ctx, name, metav1.GetOptions{})
		if err != nil {
			return nil, err
		}
		unstructuredDeployment := rm.convertToUnstructured(deployment)
		if unstructuredDeployment == nil {
			return nil, fmt.Errorf("failed to convert Deployment to unstructured")
		}
		obj = rm.stripManagedFields(unstructuredDeployment)
	case "Service":
		service, err := rm.kubeClient.CoreV1().Services(namespace).Get(ctx, name, metav1.GetOptions{})
		if err != nil {
			return nil, err
		}
		unstructuredService := rm.convertToUnstructured(service)
		if unstructuredService == nil {
			return nil, fmt.Errorf("failed to convert Service to unstructured")
		}
		obj = rm.stripManagedFields(unstructuredService)
	case "ConfigMap":
		configMap, err := rm.kubeClient.CoreV1().ConfigMaps(namespace).Get(ctx, name, metav1.GetOptions{})
		if err != nil {
			return nil, err
		}
		unstructuredConfigMap := rm.convertToUnstructured(configMap)
		if unstructuredConfigMap == nil {
			return nil, fmt.Errorf("failed to convert ConfigMap to unstructured")
		}
		obj = rm.stripManagedFields(unstructuredConfigMap)
	case "Secret":
		secret, err := rm.kubeClient.CoreV1().Secrets(namespace).Get(ctx, name, metav1.GetOptions{})
		if err != nil {
			return nil, err
		}
		unstructuredSecret := rm.convertToUnstructured(secret)
		if unstructuredSecret == nil {
			return nil, fmt.Errorf("failed to convert Secret to unstructured")
		}
		obj = rm.stripManagedFields(unstructuredSecret)
	default:
		return nil, fmt.Errorf("unsupported resource kind for export: %s", kind)
	}

	export := &ResourceExport{
		APIVersion: obj.GetAPIVersion(),
		Kind:       obj.GetKind(),
		Metadata:   obj.Object["metadata"],
		Spec:       obj.Object["spec"],
	}

	return export, nil
}

// ListServices lists all services in a namespace
func (rm *ResourceManager) ListServices(ctx context.Context, namespace string) ([]v1.Service, error) {
	services, err := rm.kubeClient.CoreV1().Services(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}
	return services.Items, nil
}

// ListDeployments lists all deployments in a namespace or across all namespaces
func (rm *ResourceManager) ListDeployments(ctx context.Context, namespace string) ([]appsv1.Deployment, error) {
	deployments, err := rm.kubeClient.AppsV1().Deployments(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}
	return deployments.Items, nil
}

// ListIngresses lists all ingresses in a namespace
func (rm *ResourceManager) ListIngresses(ctx context.Context, namespace string) ([]interface{}, error) {
	// Try networking.k8s.io/v1 first, then fall back to extensions/v1beta1
	ingressGVR := schema.GroupVersionResource{
		Group:    "networking.k8s.io",
		Version:  "v1",
		Resource: "ingresses",
	}

	ingresses, err := rm.dynamicClient.Resource(ingressGVR).Namespace(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		// Fallback to extensions/v1beta1
		ingressGVR.Group = "extensions"
		ingressGVR.Version = "v1beta1"
		ingresses, err = rm.dynamicClient.Resource(ingressGVR).Namespace(namespace).List(ctx, metav1.ListOptions{})
		if err != nil {
			return nil, err
		}
	}

	var result []interface{}
	for _, ingress := range ingresses.Items {
		result = append(result, ingress.Object)
	}

	return result, nil
}

// GetPodLogs retrieves logs for a pod
func (rm *ResourceManager) GetPodLogs(ctx context.Context, namespace, podName, containerName string, tailLines *int64) (string, error) {
	logOptions := &v1.PodLogOptions{
		Container: containerName,
	}

	if tailLines != nil {
		logOptions.TailLines = tailLines
	}

	req := rm.kubeClient.CoreV1().Pods(namespace).GetLogs(podName, logOptions)
	logs, err := req.DoRaw(ctx)
	if err != nil {
		return "", fmt.Errorf("failed to get pod logs: %w", err)
	}

	return string(logs), nil
}

// stripManagedFields removes managed fields and other runtime metadata
func (rm *ResourceManager) stripManagedFields(obj *unstructured.Unstructured) *unstructured.Unstructured {
	// Remove runtime metadata that shouldn't be exported
	metadata := obj.Object["metadata"].(map[string]interface{})

	fieldsToRemove := []string{
		"managedFields",
		"resourceVersion",
		"uid",
		"selfLink",
		"generation",
		"creationTimestamp",
	}

	for _, field := range fieldsToRemove {
		delete(metadata, field)
	}

	// Remove status field
	delete(obj.Object, "status")

	return obj
}

// convertToUnstructured converts a typed object to unstructured using the proper runtime converter
func (rm *ResourceManager) convertToUnstructured(obj interface{}) *unstructured.Unstructured {
	unstructuredObj, err := runtime.DefaultUnstructuredConverter.ToUnstructured(obj)
	if err != nil {
		rm.logger.Error("Failed to convert object to unstructured", zap.Error(err))
		return nil
	}

	result := &unstructured.Unstructured{Object: unstructuredObj}

	// Manually set apiVersion and kind as they are stripped by the converter
	switch obj.(type) {
	case *v1.Pod:
		result.SetAPIVersion("v1")
		result.SetKind("Pod")
	case *appsv1.Deployment:
		result.SetAPIVersion("apps/v1")
		result.SetKind("Deployment")
	case *v1.Service:
		result.SetAPIVersion("v1")
		result.SetKind("Service")
	case *v1.ConfigMap:
		result.SetAPIVersion("v1")
		result.SetKind("ConfigMap")
	case *v1.Secret:
		result.SetAPIVersion("v1")
		result.SetKind("Secret")
	}

	return result
}

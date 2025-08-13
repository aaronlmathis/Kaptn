package resources

import (
	"context"
	"fmt"
	"strings"

	"go.uber.org/zap"
	appsv1 "k8s.io/api/apps/v1"
	batchv1 "k8s.io/api/batch/v1"
	v1 "k8s.io/api/core/v1"
	networkingv1 "k8s.io/api/networking/v1"
	rbacv1 "k8s.io/api/rbac/v1"
	storagev1 "k8s.io/api/storage/v1"
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
	case "DaemonSet":
		return rm.kubeClient.AppsV1().DaemonSets(req.Namespace).Delete(ctx, req.Name, deleteOptions)
	case "Service":
		return rm.kubeClient.CoreV1().Services(req.Namespace).Delete(ctx, req.Name, deleteOptions)
	case "Job":
		return rm.kubeClient.BatchV1().Jobs(req.Namespace).Delete(ctx, req.Name, deleteOptions)
	case "CronJob":
		return rm.kubeClient.BatchV1().CronJobs(req.Namespace).Delete(ctx, req.Name, deleteOptions)
	case "ConfigMap":
		return rm.kubeClient.CoreV1().ConfigMaps(req.Namespace).Delete(ctx, req.Name, deleteOptions)
	case "Secret":
		return rm.kubeClient.CoreV1().Secrets(req.Namespace).Delete(ctx, req.Name, deleteOptions)
	case "Endpoints":
		return rm.kubeClient.CoreV1().Endpoints(req.Namespace).Delete(ctx, req.Name, deleteOptions)
	case "EndpointSlice":
		return rm.deleteEndpointSlice(ctx, req.Namespace, req.Name, deleteOptions)
	case "Ingress":
		return rm.deleteIngress(ctx, req.Namespace, req.Name, deleteOptions)
	case "Gateway":
		return rm.deleteIstioGateway(ctx, req.Namespace, req.Name, deleteOptions)
	case "StorageClass":
		return rm.DeleteStorageClass(ctx, req.Name, deleteOptions)
	case "CSIDriver":
		return rm.DeleteCSIDriver(ctx, req.Name, deleteOptions)
	case "Node":
		return rm.kubeClient.CoreV1().Nodes().Delete(ctx, req.Name, deleteOptions)
	case "VolumeSnapshot":
		return rm.deleteVolumeSnapshot(ctx, req.Namespace, req.Name, deleteOptions)
	case "VolumeSnapshotClass":
		return rm.deleteVolumeSnapshotClass(ctx, req.Name, deleteOptions)
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
	case "StatefulSet":
		statefulSet, err := rm.kubeClient.AppsV1().StatefulSets(namespace).Get(ctx, name, metav1.GetOptions{})
		if err != nil {
			return nil, err
		}
		unstructuredStatefulSet := rm.convertToUnstructured(statefulSet)
		if unstructuredStatefulSet == nil {
			return nil, fmt.Errorf("failed to convert StatefulSet to unstructured")
		}
		obj = rm.stripManagedFields(unstructuredStatefulSet)
	case "DaemonSet":
		daemonSet, err := rm.kubeClient.AppsV1().DaemonSets(namespace).Get(ctx, name, metav1.GetOptions{})
		if err != nil {
			return nil, err
		}
		unstructuredDaemonSet := rm.convertToUnstructured(daemonSet)
		if unstructuredDaemonSet == nil {
			return nil, fmt.Errorf("failed to convert DaemonSet to unstructured")
		}
		obj = rm.stripManagedFields(unstructuredDaemonSet)
	case "ReplicaSet":
		replicaSet, err := rm.kubeClient.AppsV1().ReplicaSets(namespace).Get(ctx, name, metav1.GetOptions{})
		if err != nil {
			return nil, err
		}
		unstructuredReplicaSet := rm.convertToUnstructured(replicaSet)
		if unstructuredReplicaSet == nil {
			return nil, fmt.Errorf("failed to convert ReplicaSet to unstructured")
		}
		obj = rm.stripManagedFields(unstructuredReplicaSet)
	case "Job":
		job, err := rm.kubeClient.BatchV1().Jobs(namespace).Get(ctx, name, metav1.GetOptions{})
		if err != nil {
			return nil, err
		}
		unstructuredJob := rm.convertToUnstructured(job)
		if unstructuredJob == nil {
			return nil, fmt.Errorf("failed to convert Job to unstructured")
		}
		obj = rm.stripManagedFields(unstructuredJob)
	case "CronJob":
		cronJob, err := rm.kubeClient.BatchV1().CronJobs(namespace).Get(ctx, name, metav1.GetOptions{})
		if err != nil {
			return nil, err
		}
		unstructuredCronJob := rm.convertToUnstructured(cronJob)
		if unstructuredCronJob == nil {
			return nil, fmt.Errorf("failed to convert CronJob to unstructured")
		}
		obj = rm.stripManagedFields(unstructuredCronJob)
	case "Ingress":
		// Get ingress using dynamic client (handles both networking.k8s.io/v1 and extensions/v1beta1)
		ingressObj, err := rm.GetIngress(ctx, namespace, name)
		if err != nil {
			return nil, err
		}

		// Convert map to unstructured
		unstructuredIngress := &unstructured.Unstructured{Object: ingressObj}
		obj = rm.stripManagedFields(unstructuredIngress)
	case "Gateway":
		// Get Istio Gateway using dynamic client
		gatewayObj, err := rm.getIstioGateway(ctx, namespace, name)
		if err != nil {
			return nil, err
		}

		// Convert map to unstructured
		unstructuredGateway := &unstructured.Unstructured{Object: gatewayObj}
		obj = rm.stripManagedFields(unstructuredGateway)
	case "VirtualService":
		// Get Istio VirtualService using dynamic client
		virtualServiceObj, err := rm.getIstioVirtualService(ctx, namespace, name)
		if err != nil {
			return nil, err
		}

		// Convert map to unstructured
		unstructuredVirtualService := &unstructured.Unstructured{Object: virtualServiceObj}
		obj = rm.stripManagedFields(unstructuredVirtualService)
	case "Endpoints":
		endpoints, err := rm.kubeClient.CoreV1().Endpoints(namespace).Get(ctx, name, metav1.GetOptions{})
		if err != nil {
			return nil, err
		}
		unstructuredEndpoints := rm.convertToUnstructured(endpoints)
		if unstructuredEndpoints == nil {
			return nil, fmt.Errorf("failed to convert Endpoints to unstructured")
		}
		obj = rm.stripManagedFields(unstructuredEndpoints)
	case "EndpointSlice":
		// Get EndpointSlice using dynamic client
		endpointSliceObj, err := rm.GetEndpointSlice(ctx, namespace, name)
		if err != nil {
			return nil, err
		}

		// Convert map to unstructured
		unstructuredEndpointSlice := &unstructured.Unstructured{Object: endpointSliceObj.(map[string]interface{})}
		obj = rm.stripManagedFields(unstructuredEndpointSlice)
	case "Namespace":
		namespace, err := rm.kubeClient.CoreV1().Namespaces().Get(ctx, name, metav1.GetOptions{})
		if err != nil {
			return nil, err
		}
		unstructuredNamespace := rm.convertToUnstructured(namespace)
		if unstructuredNamespace == nil {
			return nil, fmt.Errorf("failed to convert Namespace to unstructured")
		}
		obj = rm.stripManagedFields(unstructuredNamespace)
	case "PersistentVolume":
		persistentVolume, err := rm.kubeClient.CoreV1().PersistentVolumes().Get(ctx, name, metav1.GetOptions{})
		if err != nil {
			return nil, err
		}
		unstructuredPV := rm.convertToUnstructured(persistentVolume)
		if unstructuredPV == nil {
			return nil, fmt.Errorf("failed to convert PersistentVolume to unstructured")
		}
		obj = rm.stripManagedFields(unstructuredPV)
	case "PersistentVolumeClaim":
		persistentVolumeClaim, err := rm.kubeClient.CoreV1().PersistentVolumeClaims(namespace).Get(ctx, name, metav1.GetOptions{})
		if err != nil {
			return nil, err
		}
		unstructuredPVC := rm.convertToUnstructured(persistentVolumeClaim)
		if unstructuredPVC == nil {
			return nil, fmt.Errorf("failed to convert PersistentVolumeClaim to unstructured")
		}
		obj = rm.stripManagedFields(unstructuredPVC)
	case "StorageClass":
		storageClass, err := rm.kubeClient.StorageV1().StorageClasses().Get(ctx, name, metav1.GetOptions{})
		if err != nil {
			return nil, err
		}
		unstructuredSC := rm.convertToUnstructured(storageClass)
		if unstructuredSC == nil {
			return nil, fmt.Errorf("failed to convert StorageClass to unstructured")
		}
		obj = rm.stripManagedFields(unstructuredSC)
	case "CSIDriver":
		csiDriver, err := rm.kubeClient.StorageV1().CSIDrivers().Get(ctx, name, metav1.GetOptions{})
		if err != nil {
			return nil, err
		}
		unstructuredCSI := rm.convertToUnstructured(csiDriver)
		if unstructuredCSI == nil {
			return nil, fmt.Errorf("failed to convert CSIDriver to unstructured")
		}
		obj = rm.stripManagedFields(unstructuredCSI)
	case "Node":
		node, err := rm.kubeClient.CoreV1().Nodes().Get(ctx, name, metav1.GetOptions{})
		if err != nil {
			return nil, err
		}
		unstructuredNode := rm.convertToUnstructured(node)
		if unstructuredNode == nil {
			return nil, fmt.Errorf("failed to convert Node to unstructured")
		}
		obj = rm.stripManagedFields(unstructuredNode)
	case "VolumeSnapshot":
		// Get VolumeSnapshot using dynamic client
		volumeSnapshotObj, err := rm.GetVolumeSnapshot(ctx, namespace, name)
		if err != nil {
			return nil, err
		}

		// Convert map to unstructured
		unstructuredVolumeSnapshot := &unstructured.Unstructured{Object: volumeSnapshotObj.(map[string]interface{})}
		obj = rm.stripManagedFields(unstructuredVolumeSnapshot)
	case "VolumeSnapshotClass":
		// Get VolumeSnapshotClass using dynamic client
		volumeSnapshotClassObj, err := rm.GetVolumeSnapshotClass(ctx, name)
		if err != nil {
			return nil, err
		}

		// Convert map to unstructured
		unstructuredVolumeSnapshotClass := &unstructured.Unstructured{Object: volumeSnapshotClassObj.(map[string]interface{})}
		obj = rm.stripManagedFields(unstructuredVolumeSnapshotClass)
	case "Role":
		role, err := rm.kubeClient.RbacV1().Roles(namespace).Get(ctx, name, metav1.GetOptions{})
		if err != nil {
			return nil, err
		}
		unstructuredRole := rm.convertToUnstructured(role)
		if unstructuredRole == nil {
			return nil, fmt.Errorf("failed to convert Role to unstructured")
		}
		obj = rm.stripManagedFields(unstructuredRole)
	case "RoleBinding":
		roleBinding, err := rm.kubeClient.RbacV1().RoleBindings(namespace).Get(ctx, name, metav1.GetOptions{})
		if err != nil {
			return nil, err
		}
		unstructuredRoleBinding := rm.convertToUnstructured(roleBinding)
		if unstructuredRoleBinding == nil {
			return nil, fmt.Errorf("failed to convert RoleBinding to unstructured")
		}
		obj = rm.stripManagedFields(unstructuredRoleBinding)
	case "ClusterRole":
		clusterRole, err := rm.kubeClient.RbacV1().ClusterRoles().Get(ctx, name, metav1.GetOptions{})
		if err != nil {
			return nil, err
		}
		unstructuredClusterRole := rm.convertToUnstructured(clusterRole)
		if unstructuredClusterRole == nil {
			return nil, fmt.Errorf("failed to convert ClusterRole to unstructured")
		}
		obj = rm.stripManagedFields(unstructuredClusterRole)
	case "ClusterRoleBinding":
		clusterRoleBinding, err := rm.kubeClient.RbacV1().ClusterRoleBindings().Get(ctx, name, metav1.GetOptions{})
		if err != nil {
			return nil, err
		}
		unstructuredClusterRoleBinding := rm.convertToUnstructured(clusterRoleBinding)
		if unstructuredClusterRoleBinding == nil {
			return nil, fmt.Errorf("failed to convert ClusterRoleBinding to unstructured")
		}
		obj = rm.stripManagedFields(unstructuredClusterRoleBinding)
	case "ResourceQuota":
		resourceQuota, err := rm.kubeClient.CoreV1().ResourceQuotas(namespace).Get(ctx, name, metav1.GetOptions{})
		if err != nil {
			return nil, err
		}
		unstructuredResourceQuota := rm.convertToUnstructured(resourceQuota)
		if unstructuredResourceQuota == nil {
			return nil, fmt.Errorf("failed to convert ResourceQuota to unstructured")
		}
		obj = rm.stripManagedFields(unstructuredResourceQuota)
	default:
		return nil, fmt.Errorf("unsupported resource kind for export: %s", kind)
	}

	export := &ResourceExport{
		APIVersion: obj.GetAPIVersion(),
		Kind:       obj.GetKind(),
		Metadata:   obj.Object["metadata"],
		Spec:       obj.Object["spec"],
	}

	// Special handling for resources that don't have a spec field
	if kind == "StorageClass" {
		// For StorageClass, the relevant fields are at the root level
		storageClassSpec := make(map[string]interface{})
		if provisioner, exists := obj.Object["provisioner"]; exists {
			storageClassSpec["provisioner"] = provisioner
		}
		if reclaimPolicy, exists := obj.Object["reclaimPolicy"]; exists {
			storageClassSpec["reclaimPolicy"] = reclaimPolicy
		}
		if volumeBindingMode, exists := obj.Object["volumeBindingMode"]; exists {
			storageClassSpec["volumeBindingMode"] = volumeBindingMode
		}
		if allowVolumeExpansion, exists := obj.Object["allowVolumeExpansion"]; exists {
			storageClassSpec["allowVolumeExpansion"] = allowVolumeExpansion
		}
		if parameters, exists := obj.Object["parameters"]; exists {
			storageClassSpec["parameters"] = parameters
		}
		if mountOptions, exists := obj.Object["mountOptions"]; exists {
			storageClassSpec["mountOptions"] = mountOptions
		}
		export.Spec = storageClassSpec
	}

	if kind == "CSIDriver" {
		// For CSIDriver, extract the spec fields
		if spec, exists := obj.Object["spec"]; exists {
			export.Spec = spec
		}
	}

	return export, nil
}

// ListServices lists all services in a namespace
func (rm *ResourceManager) ListServices(ctx context.Context, namespace string) ([]v1.Service, error) {
	services, err := rm.kubeClient.CoreV1().Services(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}
	if services.Items == nil {
		return []v1.Service{}, nil
	}
	return services.Items, nil
}

// ListDeployments lists all deployments in a namespace or across all namespaces
func (rm *ResourceManager) ListDeployments(ctx context.Context, namespace string) ([]appsv1.Deployment, error) {
	deployments, err := rm.kubeClient.AppsV1().Deployments(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}
	if deployments.Items == nil {
		return []appsv1.Deployment{}, nil
	}
	return deployments.Items, nil
}

// ListStatefulSets lists all statefulsets in a namespace or across all namespaces
func (rm *ResourceManager) ListStatefulSets(ctx context.Context, namespace string) ([]appsv1.StatefulSet, error) {
	statefulSets, err := rm.kubeClient.AppsV1().StatefulSets(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}
	if statefulSets.Items == nil {
		return []appsv1.StatefulSet{}, nil
	}
	return statefulSets.Items, nil
}

// ListDaemonSets lists all daemonsets in a namespace or across all namespaces
func (rm *ResourceManager) ListDaemonSets(ctx context.Context, namespace string) ([]appsv1.DaemonSet, error) {
	daemonSets, err := rm.kubeClient.AppsV1().DaemonSets(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}
	if daemonSets.Items == nil {
		return []appsv1.DaemonSet{}, nil
	}
	return daemonSets.Items, nil
}

// ListReplicaSets lists all replicasets in a namespace or across all namespaces
func (rm *ResourceManager) ListReplicaSets(ctx context.Context, namespace string) ([]appsv1.ReplicaSet, error) {
	replicaSets, err := rm.kubeClient.AppsV1().ReplicaSets(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}
	if replicaSets.Items == nil {
		return []appsv1.ReplicaSet{}, nil
	}
	return replicaSets.Items, nil
}

// ListJobs lists all jobs in a namespace or across all namespaces
func (rm *ResourceManager) ListJobs(ctx context.Context, namespace string) ([]batchv1.Job, error) {
	jobs, err := rm.kubeClient.BatchV1().Jobs(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}
	if jobs.Items == nil {
		return []batchv1.Job{}, nil
	}
	return jobs.Items, nil
}

// ListCronJobs lists all cronjobs in a namespace or across all namespaces
func (rm *ResourceManager) ListCronJobs(ctx context.Context, namespace string) ([]batchv1.CronJob, error) {
	cronJobs, err := rm.kubeClient.BatchV1().CronJobs(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}
	if cronJobs.Items == nil {
		return []batchv1.CronJob{}, nil
	}
	return cronJobs.Items, nil
}

// ListEndpoints lists all endpoints in a namespace or across all namespaces
func (rm *ResourceManager) ListEndpoints(ctx context.Context, namespace string) ([]v1.Endpoints, error) {
	endpoints, err := rm.kubeClient.CoreV1().Endpoints(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}
	if endpoints.Items == nil {
		return []v1.Endpoints{}, nil
	}
	return endpoints.Items, nil
}

// ListEvents lists all events in a namespace or across all namespaces
func (rm *ResourceManager) ListEvents(ctx context.Context, namespace string) ([]v1.Event, error) {
	events, err := rm.kubeClient.CoreV1().Events(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}
	if events.Items == nil {
		return []v1.Event{}, nil
	}
	return events.Items, nil
}

// ListEndpointSlices lists all endpoint slices in a namespace or across all namespaces
func (rm *ResourceManager) ListEndpointSlices(ctx context.Context, namespace string) ([]interface{}, error) {
	// Use dynamic client to get EndpointSlices from discovery.k8s.io/v1
	endpointSlicesGVR := schema.GroupVersionResource{
		Group:    "discovery.k8s.io",
		Version:  "v1",
		Resource: "endpointslices",
	}

	endpointSlicesList, err := rm.dynamicClient.Resource(endpointSlicesGVR).Namespace(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to list endpoint slices: %w", err)
	}

	var result []interface{}
	for _, item := range endpointSlicesList.Items {
		result = append(result, item.Object)
	}

	return result, nil
}

// GetEndpointSlice gets a specific endpoint slice
func (rm *ResourceManager) GetEndpointSlice(ctx context.Context, namespace, name string) (interface{}, error) {
	endpointSlicesGVR := schema.GroupVersionResource{
		Group:    "discovery.k8s.io",
		Version:  "v1",
		Resource: "endpointslices",
	}

	endpointSlice, err := rm.dynamicClient.Resource(endpointSlicesGVR).Namespace(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to get endpoint slice: %w", err)
	}

	return endpointSlice.Object, nil
}

// GetConfigMap gets a specific config map
func (rm *ResourceManager) GetConfigMap(ctx context.Context, namespace, name string) (interface{}, error) {
	configMap, err := rm.kubeClient.CoreV1().ConfigMaps(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to get config map: %w", err)
	}

	unstructuredConfigMap := rm.convertToUnstructured(configMap)
	if unstructuredConfigMap == nil {
		return nil, fmt.Errorf("failed to convert ConfigMap to unstructured")
	}
	obj := rm.stripManagedFields(unstructuredConfigMap)

	return obj.Object, nil
}

// ListIngresses lists all ingresses and Istio gateways in a namespace
func (rm *ResourceManager) ListIngresses(ctx context.Context, namespace string) ([]interface{}, error) {
	var result []interface{}

	// Use channels for concurrent fetching to improve performance
	ingressChan := make(chan []interface{}, 1)
	gatewayChan := make(chan []interface{}, 1)
	errChan := make(chan error, 2)

	// Fetch standard ingresses concurrently
	go func() {
		ingresses, err := rm.fetchStandardIngresses(ctx, namespace)
		if err != nil {
			errChan <- err
			return
		}
		ingressChan <- ingresses
	}()

	// Fetch Istio gateways concurrently
	go func() {
		gateways, err := rm.fetchIstioGateways(ctx, namespace)
		if err != nil {
			// Don't fail if Istio is not installed, just log and continue
			rm.logger.Debug("Failed to fetch Istio gateways (Istio may not be installed)",
				zap.String("namespace", namespace), zap.Error(err))
			gatewayChan <- []interface{}{}
			return
		}
		gatewayChan <- gateways
	}()

	// Collect results
	ingressesReceived := false
	gatewaysReceived := false

	for !ingressesReceived || !gatewaysReceived {
		select {
		case ingresses := <-ingressChan:
			result = append(result, ingresses...)
			ingressesReceived = true
		case gateways := <-gatewayChan:
			result = append(result, gateways...)
			gatewaysReceived = true
		case err := <-errChan:
			return nil, err
		}
	}

	return result, nil
}

// fetchStandardIngresses fetches standard Kubernetes ingresses
func (rm *ResourceManager) fetchStandardIngresses(ctx context.Context, namespace string) ([]interface{}, error) {
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
		// Create a deep copy to avoid modifying the original object
		ingressCopy := ingress.DeepCopy()
		ingressObj := ingressCopy.Object
		if ingressObj == nil {
			ingressObj = make(map[string]interface{})
		}
		if metadata, ok := ingressObj["metadata"].(map[string]interface{}); ok {
			if annotations, ok := metadata["annotations"].(map[string]interface{}); ok {
				annotations["kaptn.io/resource-type"] = "ingress"
			} else {
				metadata["annotations"] = map[string]interface{}{
					"kaptn.io/resource-type": "ingress",
				}
			}
		}
		result = append(result, ingressObj)
	}

	return result, nil
}

// fetchIstioGateways fetches Istio Gateway resources
func (rm *ResourceManager) fetchIstioGateways(ctx context.Context, namespace string) ([]interface{}, error) {
	gatewayGVR := schema.GroupVersionResource{
		Group:    "networking.istio.io",
		Version:  "v1beta1",
		Resource: "gateways",
	}

	gateways, err := rm.dynamicClient.Resource(gatewayGVR).Namespace(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var result []interface{}
	for _, gateway := range gateways.Items {
		// Create a deep copy to avoid modifying the original object
		gatewayCopy := gateway.DeepCopy()
		gatewayObj := gatewayCopy.Object
		if gatewayObj == nil {
			gatewayObj = make(map[string]interface{})
		}
		if metadata, ok := gatewayObj["metadata"].(map[string]interface{}); ok {
			if annotations, ok := metadata["annotations"].(map[string]interface{}); ok {
				annotations["kaptn.io/resource-type"] = "istio-gateway"
			} else {
				metadata["annotations"] = map[string]interface{}{
					"kaptn.io/resource-type": "istio-gateway",
				}
			}
		}
		result = append(result, gatewayObj)
	}

	return result, nil
}

// GetIngress gets a specific ingress or Istio gateway by name and namespace
func (rm *ResourceManager) GetIngress(ctx context.Context, namespace, name string) (map[string]interface{}, error) {
	// Try to get standard ingress first
	ingress, err := rm.getStandardIngress(ctx, namespace, name)
	if err == nil {
		return ingress, nil
	}

	// If standard ingress not found, try Istio gateway
	gateway, gatewayErr := rm.getIstioGateway(ctx, namespace, name)
	if gatewayErr == nil {
		return gateway, nil
	}

	// Return the original ingress error if both fail
	return nil, err
}

// getStandardIngress gets a standard Kubernetes ingress
func (rm *ResourceManager) getStandardIngress(ctx context.Context, namespace, name string) (map[string]interface{}, error) {
	// Try networking.k8s.io/v1 first, then fall back to extensions/v1beta1
	ingressGVR := schema.GroupVersionResource{
		Group:    "networking.k8s.io",
		Version:  "v1",
		Resource: "ingresses",
	}

	ingress, err := rm.dynamicClient.Resource(ingressGVR).Namespace(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		// Fallback to extensions/v1beta1
		ingressGVR.Group = "extensions"
		ingressGVR.Version = "v1beta1"
		ingress, err = rm.dynamicClient.Resource(ingressGVR).Namespace(namespace).Get(ctx, name, metav1.GetOptions{})
		if err != nil {
			return nil, err
		}
	}

	// Create a deep copy and add type indicator
	ingressCopy := ingress.DeepCopy()
	ingressObj := ingressCopy.Object
	if metadata, ok := ingressObj["metadata"].(map[string]interface{}); ok {
		if annotations, ok := metadata["annotations"].(map[string]interface{}); ok {
			annotations["kaptn.io/resource-type"] = "ingress"
		} else {
			metadata["annotations"] = map[string]interface{}{
				"kaptn.io/resource-type": "ingress",
			}
		}
	}

	return ingressObj, nil
}

// getIstioGateway gets an Istio Gateway resource
func (rm *ResourceManager) getIstioGateway(ctx context.Context, namespace, name string) (map[string]interface{}, error) {
	gatewayGVR := schema.GroupVersionResource{
		Group:    "networking.istio.io",
		Version:  "v1beta1",
		Resource: "gateways",
	}

	gateway, err := rm.dynamicClient.Resource(gatewayGVR).Namespace(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return nil, err
	}

	// Create a deep copy and add type indicator
	gatewayCopy := gateway.DeepCopy()
	gatewayObj := gatewayCopy.Object
	if metadata, ok := gatewayObj["metadata"].(map[string]interface{}); ok {
		if annotations, ok := metadata["annotations"].(map[string]interface{}); ok {
			annotations["kaptn.io/resource-type"] = "istio-gateway"
		} else {
			metadata["annotations"] = map[string]interface{}{
				"kaptn.io/resource-type": "istio-gateway",
			}
		}
	}

	return gatewayObj, nil
}

// getIstioVirtualService gets an Istio VirtualService resource
func (rm *ResourceManager) getIstioVirtualService(ctx context.Context, namespace, name string) (map[string]interface{}, error) {
	virtualServiceGVR := schema.GroupVersionResource{
		Group:    "networking.istio.io",
		Version:  "v1beta1",
		Resource: "virtualservices",
	}

	virtualService, err := rm.dynamicClient.Resource(virtualServiceGVR).Namespace(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return nil, err
	}

	// Create a deep copy and add type indicator
	virtualServiceCopy := virtualService.DeepCopy()
	virtualServiceObj := virtualServiceCopy.Object
	if metadata, ok := virtualServiceObj["metadata"].(map[string]interface{}); ok {
		if annotations, ok := metadata["annotations"].(map[string]interface{}); ok {
			annotations["kaptn.io/resource-type"] = "istio-virtualservice"
		} else {
			metadata["annotations"] = map[string]interface{}{
				"kaptn.io/resource-type": "istio-virtualservice",
			}
		}
	}

	return virtualServiceObj, nil
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
	case *appsv1.StatefulSet:
		result.SetAPIVersion("apps/v1")
		result.SetKind("StatefulSet")
	case *appsv1.DaemonSet:
		result.SetAPIVersion("apps/v1")
		result.SetKind("DaemonSet")
	case *appsv1.ReplicaSet:
		result.SetAPIVersion("apps/v1")
		result.SetKind("ReplicaSet")
	case *batchv1.Job:
		result.SetAPIVersion("batch/v1")
		result.SetKind("Job")
	case *batchv1.CronJob:
		result.SetAPIVersion("batch/v1")
		result.SetKind("CronJob")
	case *v1.Service:
		result.SetAPIVersion("v1")
		result.SetKind("Service")
	case *v1.ConfigMap:
		result.SetAPIVersion("v1")
		result.SetKind("ConfigMap")
	case *v1.Secret:
		result.SetAPIVersion("v1")
		result.SetKind("Secret")
	case *v1.Endpoints:
		result.SetAPIVersion("v1")
		result.SetKind("Endpoints")
	case *storagev1.StorageClass:
		result.SetAPIVersion("storage.k8s.io/v1")
		result.SetKind("StorageClass")
	}

	return result
}

// deleteIngress deletes a standard Kubernetes ingress
func (rm *ResourceManager) deleteIngress(ctx context.Context, namespace, name string, deleteOptions metav1.DeleteOptions) error {
	// Try networking.k8s.io/v1 first, then fall back to extensions/v1beta1
	ingressGVR := schema.GroupVersionResource{
		Group:    "networking.k8s.io",
		Version:  "v1",
		Resource: "ingresses",
	}

	err := rm.dynamicClient.Resource(ingressGVR).Namespace(namespace).Delete(ctx, name, deleteOptions)
	if err != nil {
		// Fallback to extensions/v1beta1
		ingressGVR.Group = "extensions"
		ingressGVR.Version = "v1beta1"
		err = rm.dynamicClient.Resource(ingressGVR).Namespace(namespace).Delete(ctx, name, deleteOptions)
		if err != nil {
			return fmt.Errorf("failed to delete ingress: %w", err)
		}
	}

	return nil
}

// deleteIstioGateway deletes an Istio Gateway resource
func (rm *ResourceManager) deleteIstioGateway(ctx context.Context, namespace, name string, deleteOptions metav1.DeleteOptions) error {
	gatewayGVR := schema.GroupVersionResource{
		Group:    "networking.istio.io",
		Version:  "v1beta1",
		Resource: "gateways",
	}

	err := rm.dynamicClient.Resource(gatewayGVR).Namespace(namespace).Delete(ctx, name, deleteOptions)
	if err != nil {
		return fmt.Errorf("failed to delete Istio gateway: %w", err)
	}

	return nil
}

// ListNetworkPolicies retrieves network policies from the specified namespace
func (rm *ResourceManager) ListNetworkPolicies(ctx context.Context, namespace string) ([]networkingv1.NetworkPolicy, error) {
	var networkPolicies []networkingv1.NetworkPolicy

	if namespace != "" {
		// Get network policies from specific namespace
		netPolList, err := rm.kubeClient.NetworkingV1().NetworkPolicies(namespace).List(ctx, metav1.ListOptions{})
		if err != nil {
			return nil, fmt.Errorf("failed to list network policies in namespace %s: %w", namespace, err)
		}
		if netPolList.Items == nil {
			networkPolicies = []networkingv1.NetworkPolicy{}
		} else {
			networkPolicies = netPolList.Items
		}
	} else {
		// Get network policies from all namespaces
		netPolList, err := rm.kubeClient.NetworkingV1().NetworkPolicies("").List(ctx, metav1.ListOptions{})
		if err != nil {
			return nil, fmt.Errorf("failed to list network policies: %w", err)
		}
		if netPolList.Items == nil {
			networkPolicies = []networkingv1.NetworkPolicy{}
		} else {
			networkPolicies = netPolList.Items
		}
	}

	return networkPolicies, nil
}

// ListConfigMaps retrieves config maps from the specified namespace
func (rm *ResourceManager) ListConfigMaps(ctx context.Context, namespace string) ([]v1.ConfigMap, error) {
	var configMaps []v1.ConfigMap

	if namespace != "" {
		// Get config maps from specific namespace
		configMapList, err := rm.kubeClient.CoreV1().ConfigMaps(namespace).List(ctx, metav1.ListOptions{})
		if err != nil {
			return nil, fmt.Errorf("failed to list config maps in namespace %s: %w", namespace, err)
		}
		if configMapList.Items == nil {
			configMaps = []v1.ConfigMap{}
		} else {
			configMaps = configMapList.Items
		}
	} else {
		// Get config maps from all namespaces
		configMapList, err := rm.kubeClient.CoreV1().ConfigMaps("").List(ctx, metav1.ListOptions{})
		if err != nil {
			return nil, fmt.Errorf("failed to list config maps: %w", err)
		}
		if configMapList.Items == nil {
			configMaps = []v1.ConfigMap{}
		} else {
			configMaps = configMapList.Items
		}
	}

	return configMaps, nil
}

// ListSecrets retrieves secrets from the specified namespace
func (rm *ResourceManager) ListSecrets(ctx context.Context, namespace string) ([]v1.Secret, error) {
	var secrets []v1.Secret

	if namespace != "" {
		// Get secrets from specific namespace
		secretList, err := rm.kubeClient.CoreV1().Secrets(namespace).List(ctx, metav1.ListOptions{})
		if err != nil {
			return nil, fmt.Errorf("failed to list secrets in namespace %s: %w", namespace, err)
		}
		if secretList.Items == nil {
			secrets = []v1.Secret{}
		} else {
			secrets = secretList.Items
		}
	} else {
		// Get secrets from all namespaces
		secretList, err := rm.kubeClient.CoreV1().Secrets("").List(ctx, metav1.ListOptions{})
		if err != nil {
			return nil, fmt.Errorf("failed to list secrets: %w", err)
		}
		if secretList.Items == nil {
			secrets = []v1.Secret{}
		} else {
			secrets = secretList.Items
		}
	}

	return secrets, nil
}

// GetSecret gets a specific secret
func (rm *ResourceManager) GetSecret(ctx context.Context, namespace, name string) (*v1.Secret, error) {
	secret, err := rm.kubeClient.CoreV1().Secrets(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to get secret %s in namespace %s: %w", name, namespace, err)
	}
	return secret, nil
}

// CreateSecret creates a new secret
func (rm *ResourceManager) CreateSecret(ctx context.Context, secret *v1.Secret) (*v1.Secret, error) {
	createdSecret, err := rm.kubeClient.CoreV1().Secrets(secret.Namespace).Create(ctx, secret, metav1.CreateOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to create secret %s in namespace %s: %w", secret.Name, secret.Namespace, err)
	}
	return createdSecret, nil
}

// UpdateSecret updates an existing secret
func (rm *ResourceManager) UpdateSecret(ctx context.Context, secret *v1.Secret) (*v1.Secret, error) {
	updatedSecret, err := rm.kubeClient.CoreV1().Secrets(secret.Namespace).Update(ctx, secret, metav1.UpdateOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to update secret %s in namespace %s: %w", secret.Name, secret.Namespace, err)
	}
	return updatedSecret, nil
}

// DeleteSecret deletes a secret
func (rm *ResourceManager) DeleteSecret(ctx context.Context, namespace, name string, deleteOptions metav1.DeleteOptions) error {
	err := rm.kubeClient.CoreV1().Secrets(namespace).Delete(ctx, name, deleteOptions)
	if err != nil {
		return fmt.Errorf("failed to delete secret %s in namespace %s: %w", name, namespace, err)
	}
	return nil
}

// deleteEndpointSlice deletes an EndpointSlice resource
func (rm *ResourceManager) deleteEndpointSlice(ctx context.Context, namespace, name string, deleteOptions metav1.DeleteOptions) error {
	endpointSlicesGVR := schema.GroupVersionResource{
		Group:    "discovery.k8s.io",
		Version:  "v1",
		Resource: "endpointslices",
	}

	err := rm.dynamicClient.Resource(endpointSlicesGVR).Namespace(namespace).Delete(ctx, name, deleteOptions)
	if err != nil {
		return fmt.Errorf("failed to delete EndpointSlice: %w", err)
	}

	return nil
}

// ListStorageClasses lists all storage classes in the cluster
func (rm *ResourceManager) ListStorageClasses(ctx context.Context) ([]storagev1.StorageClass, error) {
	storageClasses, err := rm.kubeClient.StorageV1().StorageClasses().List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to list storage classes: %w", err)
	}
	if storageClasses.Items == nil {
		return []storagev1.StorageClass{}, nil
	}
	return storageClasses.Items, nil
}

// GetStorageClass gets a specific storage class
func (rm *ResourceManager) GetStorageClass(ctx context.Context, name string) (*storagev1.StorageClass, error) {
	storageClass, err := rm.kubeClient.StorageV1().StorageClasses().Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to get storage class %s: %w", name, err)
	}
	return storageClass, nil
}

// DeleteStorageClass deletes a storage class
func (rm *ResourceManager) DeleteStorageClass(ctx context.Context, name string, deleteOptions metav1.DeleteOptions) error {
	err := rm.kubeClient.StorageV1().StorageClasses().Delete(ctx, name, deleteOptions)
	if err != nil {
		return fmt.Errorf("failed to delete storage class: %w", err)
	}
	return nil
}

// ListVolumeSnapshots lists all volume snapshots in a namespace
func (rm *ResourceManager) ListVolumeSnapshots(ctx context.Context, namespace string) ([]interface{}, error) {
	// Use dynamic client to get VolumeSnapshots from snapshot.storage.k8s.io/v1
	volumeSnapshotsGVR := schema.GroupVersionResource{
		Group:    "snapshot.storage.k8s.io",
		Version:  "v1",
		Resource: "volumesnapshots",
	}

	volumeSnapshotsList, err := rm.dynamicClient.Resource(volumeSnapshotsGVR).Namespace(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to list volume snapshots: %w", err)
	}

	var result []interface{}
	for _, item := range volumeSnapshotsList.Items {
		result = append(result, item.Object)
	}

	return result, nil
}

// GetVolumeSnapshot gets a specific volume snapshot
func (rm *ResourceManager) GetVolumeSnapshot(ctx context.Context, namespace, name string) (interface{}, error) {
	volumeSnapshotsGVR := schema.GroupVersionResource{
		Group:    "snapshot.storage.k8s.io",
		Version:  "v1",
		Resource: "volumesnapshots",
	}

	volumeSnapshot, err := rm.dynamicClient.Resource(volumeSnapshotsGVR).Namespace(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to get volume snapshot: %w", err)
	}

	return volumeSnapshot.Object, nil
}

// deleteVolumeSnapshot deletes a VolumeSnapshot resource
func (rm *ResourceManager) deleteVolumeSnapshot(ctx context.Context, namespace, name string, deleteOptions metav1.DeleteOptions) error {
	volumeSnapshotsGVR := schema.GroupVersionResource{
		Group:    "snapshot.storage.k8s.io",
		Version:  "v1",
		Resource: "volumesnapshots",
	}

	err := rm.dynamicClient.Resource(volumeSnapshotsGVR).Namespace(namespace).Delete(ctx, name, deleteOptions)
	if err != nil {
		return fmt.Errorf("failed to delete VolumeSnapshot: %w", err)
	}

	return nil
}

// ListVolumeSnapshotClasses lists all volume snapshot classes in the cluster
func (rm *ResourceManager) ListVolumeSnapshotClasses(ctx context.Context) ([]interface{}, error) {
	// Use dynamic client to get VolumeSnapshotClasses from snapshot.storage.k8s.io/v1
	volumeSnapshotClassesGVR := schema.GroupVersionResource{
		Group:    "snapshot.storage.k8s.io",
		Version:  "v1",
		Resource: "volumesnapshotclasses",
	}

	volumeSnapshotClassesList, err := rm.dynamicClient.Resource(volumeSnapshotClassesGVR).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to list volume snapshot classes: %w", err)
	}

	var result []interface{}
	for _, item := range volumeSnapshotClassesList.Items {
		result = append(result, item.Object)
	}

	return result, nil
}

// GetVolumeSnapshotClass gets a specific volume snapshot class
func (rm *ResourceManager) GetVolumeSnapshotClass(ctx context.Context, name string) (interface{}, error) {
	volumeSnapshotClassesGVR := schema.GroupVersionResource{
		Group:    "snapshot.storage.k8s.io",
		Version:  "v1",
		Resource: "volumesnapshotclasses",
	}

	volumeSnapshotClass, err := rm.dynamicClient.Resource(volumeSnapshotClassesGVR).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to get volume snapshot class: %w", err)
	}

	return volumeSnapshotClass.Object, nil
}

// deleteVolumeSnapshotClass deletes a VolumeSnapshotClass resource
func (rm *ResourceManager) deleteVolumeSnapshotClass(ctx context.Context, name string, deleteOptions metav1.DeleteOptions) error {
	volumeSnapshotClassesGVR := schema.GroupVersionResource{
		Group:    "snapshot.storage.k8s.io",
		Version:  "v1",
		Resource: "volumesnapshotclasses",
	}

	err := rm.dynamicClient.Resource(volumeSnapshotClassesGVR).Delete(ctx, name, deleteOptions)
	if err != nil {
		return fmt.Errorf("failed to delete VolumeSnapshotClass: %w", err)
	}

	return nil
}

// ListCSIDrivers lists all CSI drivers in the cluster
func (rm *ResourceManager) ListCSIDrivers(ctx context.Context) ([]storagev1.CSIDriver, error) {
	csiDrivers, err := rm.kubeClient.StorageV1().CSIDrivers().List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to list CSI drivers: %w", err)
	}
	if csiDrivers.Items == nil {
		return []storagev1.CSIDriver{}, nil
	}
	return csiDrivers.Items, nil
}

// GetCSIDriver gets a specific CSI driver
func (rm *ResourceManager) GetCSIDriver(ctx context.Context, name string) (*storagev1.CSIDriver, error) {
	csiDriver, err := rm.kubeClient.StorageV1().CSIDrivers().Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to get CSI driver %s: %w", name, err)
	}
	return csiDriver, nil
}

// DeleteCSIDriver deletes a CSI driver
func (rm *ResourceManager) DeleteCSIDriver(ctx context.Context, name string, deleteOptions metav1.DeleteOptions) error {
	err := rm.kubeClient.StorageV1().CSIDrivers().Delete(ctx, name, deleteOptions)
	if err != nil {
		return fmt.Errorf("failed to delete CSI driver: %w", err)
	}
	return nil
}

// ListResourceQuotas lists resource quotas in a namespace or all namespaces
func (rm *ResourceManager) ListResourceQuotas(ctx context.Context, namespace string) ([]v1.ResourceQuota, error) {
	if namespace == "" {
		resourceQuotas, err := rm.kubeClient.CoreV1().ResourceQuotas("").List(ctx, metav1.ListOptions{})
		if err != nil {
			return nil, fmt.Errorf("failed to list resource quotas: %w", err)
		}
		return resourceQuotas.Items, nil
	}

	resourceQuotas, err := rm.kubeClient.CoreV1().ResourceQuotas(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to list resource quotas in namespace %s: %w", namespace, err)
	}

	return resourceQuotas.Items, nil
}

// GetResourceQuota gets a specific resource quota
func (rm *ResourceManager) GetResourceQuota(ctx context.Context, namespace, name string) (*v1.ResourceQuota, error) {
	resourceQuota, err := rm.kubeClient.CoreV1().ResourceQuotas(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to get resource quota %s in namespace %s: %w", name, namespace, err)
	}
	return resourceQuota, nil
}

// DeleteResourceQuota deletes a resource quota
func (rm *ResourceManager) DeleteResourceQuota(ctx context.Context, namespace, name string, deleteOptions metav1.DeleteOptions) error {
	err := rm.kubeClient.CoreV1().ResourceQuotas(namespace).Delete(ctx, name, deleteOptions)
	if err != nil {
		return fmt.Errorf("failed to delete resource quota %s in namespace %s: %w", name, namespace, err)
	}
	return nil
}

// APIResource represents a Kubernetes API resource
type APIResource struct {
	ID           int      `json:"id"`
	Name         string   `json:"name"`
	SingularName string   `json:"singularName"`
	ShortNames   []string `json:"shortNames"`
	Kind         string   `json:"kind"`
	Group        string   `json:"group"`
	Version      string   `json:"version"`
	APIVersion   string   `json:"apiVersion"`
	Namespaced   bool     `json:"namespaced"`
	Categories   []string `json:"categories"`
	Verbs        []string `json:"verbs"`
}

// ListAPIResources lists all API resources available in the cluster
func (rm *ResourceManager) ListAPIResources(ctx context.Context) ([]APIResource, error) {
	// Get API resource lists from the discovery client
	discoveryClient := rm.kubeClient.Discovery()

	// Get all API groups and versions
	apiGroupList, err := discoveryClient.ServerGroups()
	if err != nil {
		return nil, fmt.Errorf("failed to get API groups: %w", err)
	}

	var allAPIResources []APIResource
	id := 1

	// Process core API group (v1)
	coreResourceList, err := discoveryClient.ServerResourcesForGroupVersion("v1")
	if err != nil {
		rm.logger.Warn("Failed to get core API resources", zap.Error(err))
	} else {
		for _, resource := range coreResourceList.APIResources {
			// Skip subresources (those with / in the name)
			if strings.Contains(resource.Name, "/") {
				continue
			}

			apiResource := APIResource{
				ID:           id,
				Name:         resource.Name,
				SingularName: resource.SingularName,
				ShortNames:   resource.ShortNames,
				Kind:         resource.Kind,
				Group:        "", // Core API group has no group name
				Version:      "v1",
				APIVersion:   "v1",
				Namespaced:   resource.Namespaced,
				Categories:   resource.Categories,
				Verbs:        resource.Verbs,
			}
			allAPIResources = append(allAPIResources, apiResource)
			id++
		}
	}

	// Process all other API groups
	for _, group := range apiGroupList.Groups {
		for _, version := range group.Versions {
			groupVersion := fmt.Sprintf("%s/%s", group.Name, version.Version)
			resourceList, err := discoveryClient.ServerResourcesForGroupVersion(groupVersion)
			if err != nil {
				rm.logger.Warn("Failed to get resources for group version",
					zap.String("groupVersion", groupVersion),
					zap.Error(err))
				continue
			}

			for _, resource := range resourceList.APIResources {
				// Skip subresources (those with / in the name)
				if strings.Contains(resource.Name, "/") {
					continue
				}

				apiResource := APIResource{
					ID:           id,
					Name:         resource.Name,
					SingularName: resource.SingularName,
					ShortNames:   resource.ShortNames,
					Kind:         resource.Kind,
					Group:        group.Name,
					Version:      version.Version,
					APIVersion:   groupVersion,
					Namespaced:   resource.Namespaced,
					Categories:   resource.Categories,
					Verbs:        resource.Verbs,
				}
				allAPIResources = append(allAPIResources, apiResource)
				id++
			}
		}
	}

	return allAPIResources, nil
}

// GetAPIResource gets a specific API resource by name and group
func (rm *ResourceManager) GetAPIResource(ctx context.Context, name, group string) (*APIResource, error) {
	allResources, err := rm.ListAPIResources(ctx)
	if err != nil {
		return nil, err
	}

	for _, resource := range allResources {
		if resource.Name == name && resource.Group == group {
			return &resource, nil
		}
	}

	return nil, fmt.Errorf("API resource %s not found in group %s", name, group)
}

// ListIngressClasses lists all IngressClasses in the cluster (IngressClasses are cluster-scoped)
func (rm *ResourceManager) ListIngressClasses(ctx context.Context) ([]interface{}, error) {
	ingressClasses, err := rm.kubeClient.NetworkingV1().IngressClasses().List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to list ingress classes: %w", err)
	}

	var result []interface{}
	for _, ic := range ingressClasses.Items {
		// Convert to map for consistent API response format
		ingressClassMap := map[string]interface{}{
			"id":                ic.Name, // Use name as ID since IngressClasses are cluster-scoped
			"name":              ic.Name,
			"controller":        ic.Spec.Controller,
			"isDefault":         false,
			"parameters":        nil,
			"annotations":       ic.Annotations,
			"labels":            ic.Labels,
			"creationTimestamp": ic.CreationTimestamp.Time,
		}

		// Check if it's the default ingress class
		if ic.Annotations != nil {
			if defaultAnnotation, exists := ic.Annotations["ingressclass.kubernetes.io/is-default-class"]; exists {
				ingressClassMap["isDefault"] = defaultAnnotation == "true"
			}
		}

		// Add parameters if they exist
		if ic.Spec.Parameters != nil {
			ingressClassMap["parameters"] = map[string]interface{}{
				"kind":      ic.Spec.Parameters.Kind,
				"name":      ic.Spec.Parameters.Name,
				"namespace": ic.Spec.Parameters.Namespace,
				"scope":     ic.Spec.Parameters.Scope,
			}
		}

		result = append(result, ingressClassMap)
	}

	return result, nil
}

// GetIngressClass gets a specific IngressClass by name
func (rm *ResourceManager) GetIngressClass(ctx context.Context, name string) (interface{}, error) {
	ingressClass, err := rm.kubeClient.NetworkingV1().IngressClasses().Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to get ingress class %s: %w", name, err)
	}

	// Convert to map for consistent API response format
	ingressClassMap := map[string]interface{}{
		"id":                ingressClass.Name,
		"name":              ingressClass.Name,
		"controller":        ingressClass.Spec.Controller,
		"isDefault":         false,
		"parameters":        nil,
		"annotations":       ingressClass.Annotations,
		"labels":            ingressClass.Labels,
		"creationTimestamp": ingressClass.CreationTimestamp.Time,
		"spec":              ingressClass.Spec,
	}

	// Check if it's the default ingress class
	if ingressClass.Annotations != nil {
		if defaultAnnotation, exists := ingressClass.Annotations["ingressclass.kubernetes.io/is-default-class"]; exists {
			ingressClassMap["isDefault"] = defaultAnnotation == "true"
		}
	}

	// Add parameters if they exist
	if ingressClass.Spec.Parameters != nil {
		ingressClassMap["parameters"] = map[string]interface{}{
			"kind":      ingressClass.Spec.Parameters.Kind,
			"name":      ingressClass.Spec.Parameters.Name,
			"namespace": ingressClass.Spec.Parameters.Namespace,
			"scope":     ingressClass.Spec.Parameters.Scope,
		}
	}

	return ingressClassMap, nil
}

// ListCustomResourceDefinitions lists all CRDs in the cluster
func (rm *ResourceManager) ListCustomResourceDefinitions(ctx context.Context) ([]interface{}, error) {
	// Use dynamic client to get CRDs
	gvr := schema.GroupVersionResource{
		Group:    "apiextensions.k8s.io",
		Version:  "v1",
		Resource: "customresourcedefinitions",
	}

	result, err := rm.dynamicClient.Resource(gvr).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to list custom resource definitions: %w", err)
	}

	var crds []interface{}
	for _, item := range result.Items {
		crdMap, err := runtime.DefaultUnstructuredConverter.ToUnstructured(&item)
		if err != nil {
			rm.logger.Warn("Failed to convert CRD to map", zap.Error(err))
			continue
		}
		crds = append(crds, crdMap)
	}

	return crds, nil
}

// GetCustomResourceDefinition gets a specific CRD by name
func (rm *ResourceManager) GetCustomResourceDefinition(ctx context.Context, name string) (interface{}, error) {
	// Use dynamic client to get CRD
	gvr := schema.GroupVersionResource{
		Group:    "apiextensions.k8s.io",
		Version:  "v1",
		Resource: "customresourcedefinitions",
	}

	result, err := rm.dynamicClient.Resource(gvr).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to get custom resource definition %s: %w", name, err)
	}

	crdMap, err := runtime.DefaultUnstructuredConverter.ToUnstructured(result)
	if err != nil {
		return nil, fmt.Errorf("failed to convert CRD to map: %w", err)
	}

	return crdMap, nil
}

// ListRoles lists all roles in a namespace or across all namespaces
func (rm *ResourceManager) ListRoles(ctx context.Context, namespace string) ([]interface{}, error) {
	roles, err := rm.kubeClient.RbacV1().Roles(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to list roles: %w", err)
	}

	var result []interface{}
	for _, role := range roles.Items {
		result = append(result, role)
	}

	return result, nil
}

// GetRole gets a specific role
func (rm *ResourceManager) GetRole(ctx context.Context, namespace, name string) (*rbacv1.Role, error) {
	role, err := rm.kubeClient.RbacV1().Roles(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to get role %s in namespace %s: %w", name, namespace, err)
	}
	return role, nil
}

// ListRoleBindings lists all role bindings in a namespace or across all namespaces
func (rm *ResourceManager) ListRoleBindings(ctx context.Context, namespace string) ([]interface{}, error) {
	roleBindings, err := rm.kubeClient.RbacV1().RoleBindings(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to list role bindings: %w", err)
	}

	var result []interface{}
	for _, roleBinding := range roleBindings.Items {
		result = append(result, roleBinding)
	}

	return result, nil
}

// GetRoleBinding gets a specific role binding
func (rm *ResourceManager) GetRoleBinding(ctx context.Context, namespace, name string) (*rbacv1.RoleBinding, error) {
	roleBinding, err := rm.kubeClient.RbacV1().RoleBindings(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to get role binding %s in namespace %s: %w", name, namespace, err)
	}
	return roleBinding, nil
}

// ListClusterRoles lists all cluster roles
func (rm *ResourceManager) ListClusterRoles(ctx context.Context) ([]*rbacv1.ClusterRole, error) {
	clusterRoles, err := rm.kubeClient.RbacV1().ClusterRoles().List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to list cluster roles: %w", err)
	}

	var result []*rbacv1.ClusterRole
	for i := range clusterRoles.Items {
		result = append(result, &clusterRoles.Items[i])
	}

	return result, nil
}

// GetClusterRole gets a specific cluster role
func (rm *ResourceManager) GetClusterRole(ctx context.Context, name string) (*rbacv1.ClusterRole, error) {
	clusterRole, err := rm.kubeClient.RbacV1().ClusterRoles().Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to get cluster role %s: %w", name, err)
	}
	return clusterRole, nil
}

// ListClusterRoleBindings lists all cluster role bindings
func (rm *ResourceManager) ListClusterRoleBindings(ctx context.Context) ([]*rbacv1.ClusterRoleBinding, error) {
	clusterRoleBindings, err := rm.kubeClient.RbacV1().ClusterRoleBindings().List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to list cluster role bindings: %w", err)
	}

	var result []*rbacv1.ClusterRoleBinding
	for i := range clusterRoleBindings.Items {
		result = append(result, &clusterRoleBindings.Items[i])
	}

	return result, nil
}

// GetClusterRoleBinding gets a specific cluster role binding
func (rm *ResourceManager) GetClusterRoleBinding(ctx context.Context, name string) (*rbacv1.ClusterRoleBinding, error) {
	clusterRoleBinding, err := rm.kubeClient.RbacV1().ClusterRoleBindings().Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to get cluster role binding %s: %w", name, err)
	}
	return clusterRoleBinding, nil
}

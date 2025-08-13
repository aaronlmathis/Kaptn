package informers

import (
	"context"
	"fmt"
	"time"

	"go.uber.org/zap"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/dynamic/dynamicinformer"
	"k8s.io/client-go/informers"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/tools/cache"
)

// Manager manages shared informers for various Kubernetes resources
type Manager struct {
	logger  *zap.Logger
	client  kubernetes.Interface
	factory informers.SharedInformerFactory

	// Dynamic client for CRDs
	dynamicClient  dynamic.Interface
	dynamicFactory dynamicinformer.DynamicSharedInformerFactory

	// Tier 1: Critical Resources (Real-time updates essential)
	NodesInformer          cache.SharedIndexInformer
	PodsInformer           cache.SharedIndexInformer
	DeploymentsInformer    cache.SharedIndexInformer
	ServicesInformer       cache.SharedIndexInformer
	NamespacesInformer     cache.SharedIndexInformer
	ResourceQuotasInformer cache.SharedIndexInformer
	EventsInformer         cache.SharedIndexInformer

	// Tier 2: Important Resources (Moderate real-time needs)
	ReplicaSetsInformer            cache.SharedIndexInformer
	StatefulSetsInformer           cache.SharedIndexInformer
	DaemonSetsInformer             cache.SharedIndexInformer
	ConfigMapsInformer             cache.SharedIndexInformer
	SecretsInformer                cache.SharedIndexInformer
	EndpointsInformer              cache.SharedIndexInformer
	EndpointSlicesInformer         cache.SharedIndexInformer
	JobsInformer                   cache.SharedIndexInformer
	CronJobsInformer               cache.SharedIndexInformer
	PersistentVolumesInformer      cache.SharedIndexInformer
	PersistentVolumeClaimsInformer cache.SharedIndexInformer
	StorageClassesInformer         cache.SharedIndexInformer

	// Tier 3: Optional Resources (Consider for future implementation)
	IngressesInformer       cache.SharedIndexInformer
	IngressClassesInformer  cache.SharedIndexInformer
	NetworkPoliciesInformer cache.SharedIndexInformer
	// PVCsInformer         cache.SharedIndexInformer

	// Volume Snapshot Resources (CRDs)
	VolumeSnapshotsInformer       cache.SharedIndexInformer
	VolumeSnapshotClassesInformer cache.SharedIndexInformer

	// Istio Resources (CRDs)
	GatewaysInformer cache.SharedIndexInformer

	// Custom Resource Definitions
	CustomResourceDefinitionsInformer cache.SharedIndexInformer

	// RBAC Resources
	RolesInformer               cache.SharedIndexInformer
	RoleBindingsInformer        cache.SharedIndexInformer
	ClusterRolesInformer        cache.SharedIndexInformer
	ClusterRoleBindingsInformer cache.SharedIndexInformer

	// Context for cancellation
	ctx    context.Context
	cancel context.CancelFunc
}

// NewManager creates a new informer manager
func NewManager(logger *zap.Logger, client kubernetes.Interface, dynamicClient dynamic.Interface) *Manager {
	ctx, cancel := context.WithCancel(context.Background())

	// Create shared informer factory with default resync period
	factory := informers.NewSharedInformerFactory(client, 30*time.Second)

	// Create dynamic informer factory for CRDs
	var dynamicFactory dynamicinformer.DynamicSharedInformerFactory
	if dynamicClient != nil {
		dynamicFactory = dynamicinformer.NewDynamicSharedInformerFactory(dynamicClient, 30*time.Second)
	}

	// Define volume snapshot GVRs
	volumeSnapshotGVR := schema.GroupVersionResource{
		Group:    "snapshot.storage.k8s.io",
		Version:  "v1",
		Resource: "volumesnapshots",
	}

	volumeSnapshotClassGVR := schema.GroupVersionResource{
		Group:    "snapshot.storage.k8s.io",
		Version:  "v1",
		Resource: "volumesnapshotclasses",
	}

	// Define Istio GVRs
	gatewayGVR := schema.GroupVersionResource{
		Group:    "networking.istio.io",
		Version:  "v1beta1",
		Resource: "gateways",
	}

	// Define CRD GVR
	crdGVR := schema.GroupVersionResource{
		Group:    "apiextensions.k8s.io",
		Version:  "v1",
		Resource: "customresourcedefinitions",
	}

	manager := &Manager{
		logger:         logger,
		client:         client,
		factory:        factory,
		dynamicClient:  dynamicClient,
		dynamicFactory: dynamicFactory,

		// Tier 1: Critical Resources
		NodesInformer:          factory.Core().V1().Nodes().Informer(),
		PodsInformer:           factory.Core().V1().Pods().Informer(),
		DeploymentsInformer:    factory.Apps().V1().Deployments().Informer(),
		ServicesInformer:       factory.Core().V1().Services().Informer(),
		NamespacesInformer:     factory.Core().V1().Namespaces().Informer(),
		ResourceQuotasInformer: factory.Core().V1().ResourceQuotas().Informer(),
		EventsInformer:         factory.Core().V1().Events().Informer(),

		// Tier 2: Important Resources
		ReplicaSetsInformer:            factory.Apps().V1().ReplicaSets().Informer(),
		StatefulSetsInformer:           factory.Apps().V1().StatefulSets().Informer(),
		DaemonSetsInformer:             factory.Apps().V1().DaemonSets().Informer(),
		ConfigMapsInformer:             factory.Core().V1().ConfigMaps().Informer(),
		SecretsInformer:                factory.Core().V1().Secrets().Informer(),
		EndpointsInformer:              factory.Core().V1().Endpoints().Informer(),
		EndpointSlicesInformer:         factory.Discovery().V1().EndpointSlices().Informer(),
		JobsInformer:                   factory.Batch().V1().Jobs().Informer(),
		CronJobsInformer:               factory.Batch().V1().CronJobs().Informer(),
		PersistentVolumesInformer:      factory.Core().V1().PersistentVolumes().Informer(),
		PersistentVolumeClaimsInformer: factory.Core().V1().PersistentVolumeClaims().Informer(),
		StorageClassesInformer:         factory.Storage().V1().StorageClasses().Informer(),

		// Tier 3: Optional Resources
		IngressesInformer:       factory.Networking().V1().Ingresses().Informer(),
		IngressClassesInformer:  factory.Networking().V1().IngressClasses().Informer(),
		NetworkPoliciesInformer: factory.Networking().V1().NetworkPolicies().Informer(),

		// RBAC Resources
		RolesInformer:               factory.Rbac().V1().Roles().Informer(),
		RoleBindingsInformer:        factory.Rbac().V1().RoleBindings().Informer(),
		ClusterRolesInformer:        factory.Rbac().V1().ClusterRoles().Informer(),
		ClusterRoleBindingsInformer: factory.Rbac().V1().ClusterRoleBindings().Informer(),

		ctx:    ctx,
		cancel: cancel,
	}

	// Add volume snapshot informers if dynamic client is available
	if dynamicFactory != nil {
		logger.Info("Creating volume snapshot informers")
		manager.VolumeSnapshotsInformer = dynamicFactory.ForResource(volumeSnapshotGVR).Informer()
		manager.VolumeSnapshotClassesInformer = dynamicFactory.ForResource(volumeSnapshotClassGVR).Informer()
		logger.Info("Volume snapshot informers created successfully")

		// Add Istio gateway informer
		logger.Info("Creating Istio gateway informer")
		manager.GatewaysInformer = dynamicFactory.ForResource(gatewayGVR).Informer()
		logger.Info("Istio gateway informer created successfully")

		// Add CRD informer
		logger.Info("Creating CustomResourceDefinition informer")
		manager.CustomResourceDefinitionsInformer = dynamicFactory.ForResource(crdGVR).Informer()
		logger.Info("CustomResourceDefinition informer created successfully")
	} else {
		logger.Warn("Dynamic client not available, volume snapshot and Istio gateway informers will not be created")
	}

	return manager
}

// Start starts all informers and waits for cache sync
func (m *Manager) Start() error {
	m.logger.Info("Starting informers")

	// Start the standard informer factory
	go m.factory.Start(m.ctx.Done())

	// Start the dynamic informer factory for CRDs if available
	if m.dynamicFactory != nil {
		go m.dynamicFactory.Start(m.ctx.Done())
	}

	// Wait for cache to sync
	m.logger.Info("Waiting for caches to sync")

	cacheSyncs := []cache.InformerSynced{
		// Tier 1: Critical Resources
		m.NodesInformer.HasSynced,
		m.PodsInformer.HasSynced,
		m.DeploymentsInformer.HasSynced,
		m.ServicesInformer.HasSynced,
		m.NamespacesInformer.HasSynced,
		m.ResourceQuotasInformer.HasSynced,
		m.EventsInformer.HasSynced,

		// Tier 2: Important Resources
		m.ReplicaSetsInformer.HasSynced,
		m.StatefulSetsInformer.HasSynced,
		m.DaemonSetsInformer.HasSynced,
		m.ConfigMapsInformer.HasSynced,
		m.SecretsInformer.HasSynced,
		m.EndpointsInformer.HasSynced,
		m.EndpointSlicesInformer.HasSynced,
		m.JobsInformer.HasSynced,
		m.CronJobsInformer.HasSynced,
		m.PersistentVolumesInformer.HasSynced,
		m.PersistentVolumeClaimsInformer.HasSynced,
		m.StorageClassesInformer.HasSynced,

		// Tier 3: Optional Resources
		m.IngressesInformer.HasSynced,
		m.IngressClassesInformer.HasSynced,
		m.NetworkPoliciesInformer.HasSynced,

		// RBAC Resources
		m.RolesInformer.HasSynced,
		m.RoleBindingsInformer.HasSynced,
		m.ClusterRolesInformer.HasSynced,
		m.ClusterRoleBindingsInformer.HasSynced,
	}

	// Add volume snapshot informers if available
	if m.VolumeSnapshotsInformer != nil {
		cacheSyncs = append(cacheSyncs, m.VolumeSnapshotsInformer.HasSynced)
	}
	if m.VolumeSnapshotClassesInformer != nil {
		cacheSyncs = append(cacheSyncs, m.VolumeSnapshotClassesInformer.HasSynced)
	}

	// Add Istio gateway informer if available
	if m.GatewaysInformer != nil {
		cacheSyncs = append(cacheSyncs, m.GatewaysInformer.HasSynced)
	}

	if !cache.WaitForCacheSync(m.ctx.Done(), cacheSyncs...) {
		return fmt.Errorf("failed to sync caches")
	}

	m.logger.Info("All caches synced successfully")
	return nil
}

// Stop stops all informers
func (m *Manager) Stop() {
	m.logger.Info("Stopping informers")
	m.cancel()
}

// AddNodeEventHandler adds an event handler for node events
func (m *Manager) AddNodeEventHandler(handler cache.ResourceEventHandler) {
	m.NodesInformer.AddEventHandler(handler)
}

// AddPodEventHandler adds an event handler for pod events
func (m *Manager) AddPodEventHandler(handler cache.ResourceEventHandler) {
	m.PodsInformer.AddEventHandler(handler)
}

// AddDeploymentEventHandler adds an event handler for deployment events
func (m *Manager) AddDeploymentEventHandler(handler cache.ResourceEventHandler) {
	m.DeploymentsInformer.AddEventHandler(handler)
}

// AddServiceEventHandler adds an event handler for service events
func (m *Manager) AddServiceEventHandler(handler cache.ResourceEventHandler) {
	m.ServicesInformer.AddEventHandler(handler)
}

// AddNamespaceEventHandler adds an event handler for namespace events
func (m *Manager) AddNamespaceEventHandler(handler cache.ResourceEventHandler) {
	m.NamespacesInformer.AddEventHandler(handler)
}

// AddResourceQuotaEventHandler adds an event handler for resource quota events
func (m *Manager) AddResourceQuotaEventHandler(handler cache.ResourceEventHandler) {
	m.ResourceQuotasInformer.AddEventHandler(handler)
}

// AddEventEventHandler adds an event handler for event events
func (m *Manager) AddEventEventHandler(handler cache.ResourceEventHandler) {
	m.EventsInformer.AddEventHandler(handler)
}

// AddReplicaSetEventHandler adds an event handler for replicaset events
func (m *Manager) AddReplicaSetEventHandler(handler cache.ResourceEventHandler) {
	m.ReplicaSetsInformer.AddEventHandler(handler)
}

// AddStatefulSetEventHandler adds an event handler for statefulset events
func (m *Manager) AddStatefulSetEventHandler(handler cache.ResourceEventHandler) {
	m.StatefulSetsInformer.AddEventHandler(handler)
}

// AddDaemonSetEventHandler adds an event handler for daemonset events
func (m *Manager) AddDaemonSetEventHandler(handler cache.ResourceEventHandler) {
	m.DaemonSetsInformer.AddEventHandler(handler)
}

// AddConfigMapEventHandler adds an event handler for configmap events
func (m *Manager) AddConfigMapEventHandler(handler cache.ResourceEventHandler) {
	m.ConfigMapsInformer.AddEventHandler(handler)
}

// AddSecretEventHandler adds an event handler for secret events
func (m *Manager) AddSecretEventHandler(handler cache.ResourceEventHandler) {
	m.SecretsInformer.AddEventHandler(handler)
}

// AddEndpointEventHandler adds an event handler for endpoint events
func (m *Manager) AddEndpointEventHandler(handler cache.ResourceEventHandler) {
	m.EndpointsInformer.AddEventHandler(handler)
}

// AddJobEventHandler adds an event handler for job events
func (m *Manager) AddJobEventHandler(handler cache.ResourceEventHandler) {
	m.JobsInformer.AddEventHandler(handler)
}

// AddCustomResourceDefinitionEventHandler adds an event handler for CRD events
func (m *Manager) AddCustomResourceDefinitionEventHandler(handler cache.ResourceEventHandler) {
	if m.CustomResourceDefinitionsInformer != nil {
		m.CustomResourceDefinitionsInformer.AddEventHandler(handler)
	}
}

// AddCronJobEventHandler adds an event handler for cronjob events
func (m *Manager) AddCronJobEventHandler(handler cache.ResourceEventHandler) {
	m.CronJobsInformer.AddEventHandler(handler)
}

// AddEndpointSliceEventHandler adds an event handler for endpointslice events
func (m *Manager) AddEndpointSliceEventHandler(handler cache.ResourceEventHandler) {
	m.EndpointSlicesInformer.AddEventHandler(handler)
}

// AddIngressEventHandler adds an event handler for ingress events
func (m *Manager) AddIngressEventHandler(handler cache.ResourceEventHandler) {
	m.IngressesInformer.AddEventHandler(handler)
}

// AddIngressClassEventHandler adds an event handler for ingress class events
func (m *Manager) AddIngressClassEventHandler(handler cache.ResourceEventHandler) {
	m.IngressClassesInformer.AddEventHandler(handler)
}

// AddNetworkPolicyEventHandler adds an event handler for network policy events
func (m *Manager) AddNetworkPolicyEventHandler(handler cache.ResourceEventHandler) {
	m.NetworkPoliciesInformer.AddEventHandler(handler)
}

// AddLoadBalancerEventHandler adds an event handler for LoadBalancer service events
func (m *Manager) AddLoadBalancerEventHandler(handler cache.ResourceEventHandler) {
	m.ServicesInformer.AddEventHandler(handler)
}

// AddPersistentVolumeEventHandler adds an event handler for persistent volume events
func (m *Manager) AddPersistentVolumeEventHandler(handler cache.ResourceEventHandler) {
	m.PersistentVolumesInformer.AddEventHandler(handler)
}

// AddStorageClassEventHandler adds an event handler for storage class events
func (m *Manager) AddStorageClassEventHandler(handler cache.ResourceEventHandler) {
	m.StorageClassesInformer.AddEventHandler(handler)
}

// AddPersistentVolumeClaimEventHandler adds an event handler for persistent volume claim events
func (m *Manager) AddPersistentVolumeClaimEventHandler(handler cache.ResourceEventHandler) {
	m.PersistentVolumeClaimsInformer.AddEventHandler(handler)
}

// AddVolumeSnapshotEventHandler adds an event handler for volume snapshot events
func (m *Manager) AddVolumeSnapshotEventHandler(handler cache.ResourceEventHandler) {
	m.logger.Info("AddVolumeSnapshotEventHandler called")
	if m.VolumeSnapshotsInformer != nil {
		m.logger.Info("Adding volume snapshot event handler to informer")
		m.VolumeSnapshotsInformer.AddEventHandler(handler)
	} else {
		m.logger.Warn("Volume snapshots informer is nil, cannot add event handler")
	}
}

// AddVolumeSnapshotClassEventHandler adds an event handler for volume snapshot class events
func (m *Manager) AddVolumeSnapshotClassEventHandler(handler cache.ResourceEventHandler) {
	if m.VolumeSnapshotClassesInformer != nil {
		m.VolumeSnapshotClassesInformer.AddEventHandler(handler)
	}
}

// AddGatewayEventHandler adds an event handler for gateway events
func (m *Manager) AddGatewayEventHandler(handler cache.ResourceEventHandler) {
	m.logger.Info("AddGatewayEventHandler called")
	if m.GatewaysInformer != nil {
		m.logger.Info("Adding gateway event handler to informer")
		m.GatewaysInformer.AddEventHandler(handler)
	} else {
		m.logger.Warn("Gateways informer is nil, cannot add event handler")
	}
}

// AddRoleEventHandler adds an event handler for role events
func (m *Manager) AddRoleEventHandler(handler cache.ResourceEventHandler) {
	m.RolesInformer.AddEventHandler(handler)
}

// AddRoleBindingEventHandler adds an event handler for role binding events
func (m *Manager) AddRoleBindingEventHandler(handler cache.ResourceEventHandler) {
	m.RoleBindingsInformer.AddEventHandler(handler)
}

// AddClusterRoleEventHandler adds an event handler for cluster role events
func (m *Manager) AddClusterRoleEventHandler(handler cache.ResourceEventHandler) {
	m.ClusterRolesInformer.AddEventHandler(handler)
}

// AddClusterRoleBindingEventHandler adds an event handler for cluster role binding events
func (m *Manager) AddClusterRoleBindingEventHandler(handler cache.ResourceEventHandler) {
	m.ClusterRoleBindingsInformer.AddEventHandler(handler)
}

// GetNodeLister returns a lister for nodes
func (m *Manager) GetNodeLister() cache.Indexer {
	return m.NodesInformer.GetIndexer()
}

// GetPodLister returns a lister for pods
func (m *Manager) GetPodLister() cache.Indexer {
	return m.PodsInformer.GetIndexer()
}

// GetDeploymentLister returns a lister for deployments
func (m *Manager) GetDeploymentLister() cache.Indexer {
	return m.DeploymentsInformer.GetIndexer()
}

// GetServiceLister returns a lister for services
func (m *Manager) GetServiceLister() cache.Indexer {
	return m.ServicesInformer.GetIndexer()
}

// GetNamespaceLister returns a lister for namespaces
func (m *Manager) GetNamespaceLister() cache.Indexer {
	return m.NamespacesInformer.GetIndexer()
}

// GetResourceQuotaLister returns a lister for resource quotas
func (m *Manager) GetResourceQuotaLister() cache.Indexer {
	return m.ResourceQuotasInformer.GetIndexer()
}

// GetEventLister returns a lister for events
func (m *Manager) GetEventLister() cache.Indexer {
	return m.EventsInformer.GetIndexer()
}

// GetReplicaSetLister returns a lister for replicasets
func (m *Manager) GetReplicaSetLister() cache.Indexer {
	return m.ReplicaSetsInformer.GetIndexer()
}

// GetStatefulSetLister returns a lister for statefulsets
func (m *Manager) GetStatefulSetLister() cache.Indexer {
	return m.StatefulSetsInformer.GetIndexer()
}

// GetDaemonSetLister returns a lister for daemonsets
func (m *Manager) GetDaemonSetLister() cache.Indexer {
	return m.DaemonSetsInformer.GetIndexer()
}

// GetConfigMapLister returns a lister for configmaps
func (m *Manager) GetConfigMapLister() cache.Indexer {
	return m.ConfigMapsInformer.GetIndexer()
}

// GetSecretLister returns a lister for secrets
func (m *Manager) GetSecretLister() cache.Indexer {
	return m.SecretsInformer.GetIndexer()
}

// GetEndpointLister returns a lister for endpoints
func (m *Manager) GetEndpointLister() cache.Indexer {
	return m.EndpointsInformer.GetIndexer()
}

// GetJobLister returns a lister for jobs
func (m *Manager) GetJobLister() cache.Indexer {
	return m.JobsInformer.GetIndexer()
}

// GetCronJobLister returns a lister for cronjobs
func (m *Manager) GetCronJobLister() cache.Indexer {
	return m.CronJobsInformer.GetIndexer()
}

// GetEndpointSliceLister returns a lister for endpointslices
func (m *Manager) GetEndpointSliceLister() cache.Indexer {
	return m.EndpointSlicesInformer.GetIndexer()
}

// GetIngressLister returns a lister for ingresses
func (m *Manager) GetIngressLister() cache.Indexer {
	return m.IngressesInformer.GetIndexer()
}

// GetIngressClassLister returns a lister for ingress classes
func (m *Manager) GetIngressClassLister() cache.Indexer {
	return m.IngressClassesInformer.GetIndexer()
}

// GetNetworkPolicyLister returns a lister for network policies
func (m *Manager) GetNetworkPolicyLister() cache.Indexer {
	return m.NetworkPoliciesInformer.GetIndexer()
}

// GetPersistentVolumeLister returns a lister for persistent volumes
func (m *Manager) GetPersistentVolumeLister() cache.Indexer {
	return m.PersistentVolumesInformer.GetIndexer()
}

// GetStorageClassLister returns a lister for storage classes
func (m *Manager) GetStorageClassLister() cache.Indexer {
	return m.StorageClassesInformer.GetIndexer()
}

// GetPersistentVolumeClaimLister returns a lister for persistent volume claims
func (m *Manager) GetPersistentVolumeClaimLister() cache.Indexer {
	return m.PersistentVolumeClaimsInformer.GetIndexer()
}

// GetVolumeSnapshotLister returns a lister for volume snapshots
func (m *Manager) GetVolumeSnapshotLister() cache.Indexer {
	return m.VolumeSnapshotsInformer.GetIndexer()
}

// GetVolumeSnapshotClassLister returns a lister for volume snapshot classes
func (m *Manager) GetVolumeSnapshotClassLister() cache.Indexer {
	return m.VolumeSnapshotClassesInformer.GetIndexer()
}

// GetGatewayLister returns a lister for gateways
func (m *Manager) GetGatewayLister() cache.Indexer {
	if m.GatewaysInformer != nil {
		return m.GatewaysInformer.GetIndexer()
	}
	return nil
}

// GetRoleLister returns a lister for roles
func (m *Manager) GetRoleLister() cache.Indexer {
	return m.RolesInformer.GetIndexer()
}

// GetRoleBindingLister returns a lister for role bindings
func (m *Manager) GetRoleBindingLister() cache.Indexer {
	return m.RoleBindingsInformer.GetIndexer()
}

// GetClusterRoleLister returns a lister for cluster roles
func (m *Manager) GetClusterRoleLister() cache.Indexer {
	return m.ClusterRolesInformer.GetIndexer()
}

// GetClusterRoleBindingLister returns a lister for cluster role bindings
func (m *Manager) GetClusterRoleBindingLister() cache.Indexer {
	return m.ClusterRoleBindingsInformer.GetIndexer()
}

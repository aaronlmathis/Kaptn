package informers

import (
	"context"
	"fmt"
	"time"

	"go.uber.org/zap"
	"k8s.io/client-go/informers"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/tools/cache"
)

// Manager manages shared informers for various Kubernetes resources
type Manager struct {
	logger  *zap.Logger
	client  kubernetes.Interface
	factory informers.SharedInformerFactory

	// Tier 1: Critical Resources (Real-time updates essential)
	NodesInformer       cache.SharedIndexInformer
	PodsInformer        cache.SharedIndexInformer
	DeploymentsInformer cache.SharedIndexInformer
	ServicesInformer    cache.SharedIndexInformer

	// Tier 2: Important Resources (Moderate real-time needs)
	ReplicaSetsInformer  cache.SharedIndexInformer
	StatefulSetsInformer cache.SharedIndexInformer
	DaemonSetsInformer   cache.SharedIndexInformer
	ConfigMapsInformer   cache.SharedIndexInformer
	SecretsInformer      cache.SharedIndexInformer
	EndpointsInformer    cache.SharedIndexInformer

	// Tier 3: Optional Resources (Consider for future implementation)
	// IngressesInformer    cache.SharedIndexInformer
	// JobsInformer         cache.SharedIndexInformer
	// CronJobsInformer     cache.SharedIndexInformer
	// PVCsInformer         cache.SharedIndexInformer

	// Context for cancellation
	ctx    context.Context
	cancel context.CancelFunc
}

// NewManager creates a new informer manager
func NewManager(logger *zap.Logger, client kubernetes.Interface) *Manager {
	ctx, cancel := context.WithCancel(context.Background())

	// Create shared informer factory with default resync period
	factory := informers.NewSharedInformerFactory(client, 30*time.Second)

	return &Manager{
		logger:  logger,
		client:  client,
		factory: factory,

		// Tier 1: Critical Resources
		NodesInformer:       factory.Core().V1().Nodes().Informer(),
		PodsInformer:        factory.Core().V1().Pods().Informer(),
		DeploymentsInformer: factory.Apps().V1().Deployments().Informer(),
		ServicesInformer:    factory.Core().V1().Services().Informer(),

		// Tier 2: Important Resources
		ReplicaSetsInformer:  factory.Apps().V1().ReplicaSets().Informer(),
		StatefulSetsInformer: factory.Apps().V1().StatefulSets().Informer(),
		DaemonSetsInformer:   factory.Apps().V1().DaemonSets().Informer(),
		ConfigMapsInformer:   factory.Core().V1().ConfigMaps().Informer(),
		SecretsInformer:      factory.Core().V1().Secrets().Informer(),
		EndpointsInformer:    factory.Core().V1().Endpoints().Informer(),

		ctx:    ctx,
		cancel: cancel,
	}
}

// Start starts all informers and waits for cache sync
func (m *Manager) Start() error {
	m.logger.Info("Starting informers")

	// Start the informer factory
	go m.factory.Start(m.ctx.Done())

	// Wait for cache to sync
	m.logger.Info("Waiting for caches to sync")

	cacheSyncs := []cache.InformerSynced{
		// Tier 1: Critical Resources
		m.NodesInformer.HasSynced,
		m.PodsInformer.HasSynced,
		m.DeploymentsInformer.HasSynced,
		m.ServicesInformer.HasSynced,

		// Tier 2: Important Resources
		m.ReplicaSetsInformer.HasSynced,
		m.StatefulSetsInformer.HasSynced,
		m.DaemonSetsInformer.HasSynced,
		m.ConfigMapsInformer.HasSynced,
		m.SecretsInformer.HasSynced,
		m.EndpointsInformer.HasSynced,
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

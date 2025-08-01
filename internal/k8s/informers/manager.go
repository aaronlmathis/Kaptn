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

	// Individual informers
	NodesInformer cache.SharedIndexInformer
	PodsInformer  cache.SharedIndexInformer

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
		logger:        logger,
		client:        client,
		factory:       factory,
		NodesInformer: factory.Core().V1().Nodes().Informer(),
		PodsInformer:  factory.Core().V1().Pods().Informer(),
		ctx:           ctx,
		cancel:        cancel,
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
		m.NodesInformer.HasSynced,
		m.PodsInformer.HasSynced,
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

// GetNodeLister returns a lister for nodes
func (m *Manager) GetNodeLister() cache.Indexer {
	return m.NodesInformer.GetIndexer()
}

// GetPodLister returns a lister for pods
func (m *Manager) GetPodLister() cache.Indexer {
	return m.PodsInformer.GetIndexer()
}

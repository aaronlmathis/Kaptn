package auth

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"go.uber.org/zap"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/watch"
	"k8s.io/client-go/kubernetes"
)

// ConfigMapBindingStore implements BindingStore using a Kubernetes ConfigMap with hot-reload
type ConfigMapBindingStore struct {
	client    kubernetes.Interface
	namespace string
	name      string
	logger    *zap.Logger

	// In-memory cache with hot-reload
	mutex    sync.RWMutex
	bindings map[string]*UserBinding
	watcher  watch.Interface
	ctx      context.Context
	cancel   context.CancelFunc
}

// NewConfigMapBindingStore creates a new ConfigMap-based binding store with hot-reload
func NewConfigMapBindingStore(client kubernetes.Interface, namespace, name string, logger *zap.Logger) (*ConfigMapBindingStore, error) {
	ctx, cancel := context.WithCancel(context.Background())

	store := &ConfigMapBindingStore{
		client:    client,
		namespace: namespace,
		name:      name,
		logger:    logger,
		bindings:  make(map[string]*UserBinding),
		ctx:       ctx,
		cancel:    cancel,
	}

	// Initial load
	if err := store.loadBindings(); err != nil {
		cancel()
		return nil, fmt.Errorf("failed to load initial bindings: %w", err)
	}

	// Start watcher for hot-reload
	go store.watchConfigMap()

	return store, nil
}

// GetUserBinding implements BindingStore interface
func (s *ConfigMapBindingStore) GetUserBinding(ctx context.Context, key string) (*UserBinding, error) {
	s.mutex.RLock()
	defer s.mutex.RUnlock()

	binding, exists := s.bindings[key]
	if !exists {
		return nil, fmt.Errorf("user binding not found for key: %s", key)
	}

	return binding, nil
}

// Close implements BindingStore interface
func (s *ConfigMapBindingStore) Close() error {
	s.cancel()
	if s.watcher != nil {
		s.watcher.Stop()
	}
	return nil
}

// loadBindings loads all bindings from the ConfigMap into memory
func (s *ConfigMapBindingStore) loadBindings() error {
	cm, err := s.client.CoreV1().ConfigMaps(s.namespace).Get(
		s.ctx, s.name, metav1.GetOptions{})
	if err != nil {
		return fmt.Errorf("failed to get ConfigMap %s/%s: %w", s.namespace, s.name, err)
	}

	s.mutex.Lock()
	defer s.mutex.Unlock()

	// Clear existing bindings
	s.bindings = make(map[string]*UserBinding)

	// Parse each data entry as a JSON UserBinding
	for key, data := range cm.Data {
		var binding UserBinding
		if err := json.Unmarshal([]byte(data), &binding); err != nil {
			s.logger.Error("Failed to parse user binding",
				zap.String("key", key),
				zap.String("data", data),
				zap.Error(err))
			continue
		}

		s.bindings[key] = &binding
		s.logger.Debug("Loaded user binding",
			zap.String("key", key),
			zap.String("user_id", binding.UserID),
			zap.Strings("groups", binding.Groups))
	}

	s.logger.Info("Loaded user bindings from ConfigMap",
		zap.String("configmap", fmt.Sprintf("%s/%s", s.namespace, s.name)),
		zap.Int("count", len(s.bindings)))

	return nil
}

// watchConfigMap watches for changes to the ConfigMap and reloads bindings
func (s *ConfigMapBindingStore) watchConfigMap() {
	for {
		select {
		case <-s.ctx.Done():
			return
		default:
			if err := s.startWatch(); err != nil {
				s.logger.Error("ConfigMap watch failed, retrying",
					zap.Error(err),
					zap.Duration("retry_in", 10*time.Second))
				time.Sleep(10 * time.Second)
			}
		}
	}
}

// startWatch creates a new watcher and processes events
func (s *ConfigMapBindingStore) startWatch() error {
	// Create field selector for our specific ConfigMap
	fieldSelector := fmt.Sprintf("metadata.name=%s", s.name)

	watcher, err := s.client.CoreV1().ConfigMaps(s.namespace).Watch(s.ctx, metav1.ListOptions{
		FieldSelector: fieldSelector,
	})
	if err != nil {
		return fmt.Errorf("failed to create ConfigMap watcher: %w", err)
	}

	s.watcher = watcher
	defer func() {
		s.watcher.Stop()
		s.watcher = nil
	}()

	s.logger.Info("Started ConfigMap watcher for user bindings",
		zap.String("configmap", fmt.Sprintf("%s/%s", s.namespace, s.name)))

	for {
		select {
		case <-s.ctx.Done():
			return nil
		case event, ok := <-watcher.ResultChan():
			if !ok {
				return fmt.Errorf("watcher channel closed")
			}

			s.handleWatchEvent(event)
		}
	}
}

// handleWatchEvent processes ConfigMap watch events
func (s *ConfigMapBindingStore) handleWatchEvent(event watch.Event) {
	switch event.Type {
	case watch.Modified, watch.Added:
		s.logger.Info("ConfigMap updated, reloading user bindings",
			zap.String("event_type", string(event.Type)))

		if err := s.loadBindings(); err != nil {
			s.logger.Error("Failed to reload bindings after ConfigMap update",
				zap.Error(err))
		}

	case watch.Deleted:
		s.logger.Warn("User bindings ConfigMap was deleted")

		s.mutex.Lock()
		s.bindings = make(map[string]*UserBinding)
		s.mutex.Unlock()

	case watch.Error:
		s.logger.Error("ConfigMap watch error", zap.Any("event", event))

	default:
		s.logger.Debug("Unhandled ConfigMap watch event",
			zap.String("event_type", string(event.Type)))
	}
}

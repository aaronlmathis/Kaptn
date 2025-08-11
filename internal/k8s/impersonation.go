package k8s

import (
	"fmt"

	"go.uber.org/zap"
	"k8s.io/client-go/discovery"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
)

// ImpersonatedClientFactory creates Kubernetes clients with impersonation headers
type ImpersonatedClientFactory struct {
	logger     *zap.Logger
	baseConfig *rest.Config
}

// NewImpersonatedClientFactory creates a new impersonated client factory
func NewImpersonatedClientFactory(logger *zap.Logger, baseConfig *rest.Config) *ImpersonatedClientFactory {
	return &ImpersonatedClientFactory{
		logger:     logger,
		baseConfig: baseConfig,
	}
}

// BuildImpersonatedConfig creates a new rest.Config with impersonation headers
func (f *ImpersonatedClientFactory) BuildImpersonatedConfig(username string, groups []string) *rest.Config {
	// Clone the base config to avoid modifying the original
	config := rest.CopyConfig(f.baseConfig)

	// Set impersonation headers
	config.Impersonate = rest.ImpersonationConfig{
		UserName: username,
		Groups:   groups,
	}

	f.logger.Debug("Created impersonated config",
		zap.String("username", username),
		zap.Strings("groups", groups))

	return config
}

// ImpersonatedClients holds all the impersonated Kubernetes clients
type ImpersonatedClients struct {
	Config    *rest.Config
	Clientset kubernetes.Interface
	Dynamic   dynamic.Interface
	Discovery discovery.DiscoveryInterface
	logger    *zap.Logger
}

// BuildImpersonatedClients creates all necessary Kubernetes clients with impersonation
func (f *ImpersonatedClientFactory) BuildImpersonatedClients(username string, groups []string) (*ImpersonatedClients, error) {
	// Create impersonated config
	config := f.BuildImpersonatedConfig(username, groups)

	// Create clientset with impersonation
	clientset, err := kubernetes.NewForConfig(config)
	if err != nil {
		return nil, fmt.Errorf("failed to create impersonated clientset: %w", err)
	}

	// Create dynamic client with impersonation
	dynamicClient, err := dynamic.NewForConfig(config)
	if err != nil {
		return nil, fmt.Errorf("failed to create impersonated dynamic client: %w", err)
	}

	// Create discovery client with impersonation
	discoveryClient, err := discovery.NewDiscoveryClientForConfig(config)
	if err != nil {
		return nil, fmt.Errorf("failed to create impersonated discovery client: %w", err)
	}

	f.logger.Info("Created impersonated Kubernetes clients",
		zap.String("username", username),
		zap.Strings("groups", groups))

	return &ImpersonatedClients{
		Config:    config,
		Clientset: clientset,
		Dynamic:   dynamicClient,
		Discovery: discoveryClient,
		logger:    f.logger,
	}, nil
}

// Client returns the Kubernetes clientset
func (ic *ImpersonatedClients) Client() kubernetes.Interface {
	return ic.Clientset
}

// DynamicClient returns the dynamic client
func (ic *ImpersonatedClients) DynamicClient() dynamic.Interface {
	return ic.Dynamic
}

// DiscoveryClient returns the discovery client
func (ic *ImpersonatedClients) DiscoveryClient() discovery.DiscoveryInterface {
	return ic.Discovery
}

// RESTConfig returns the REST config
func (ic *ImpersonatedClients) RESTConfig() *rest.Config {
	return ic.Config
}

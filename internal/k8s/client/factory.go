package client

import (
	"fmt"
	"os"
	"path/filepath"

	"go.uber.org/zap"
	"k8s.io/client-go/discovery"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
	"k8s.io/client-go/util/homedir"
)

// ClientMode represents the mode for creating Kubernetes clients
type ClientMode string

const (
	// InClusterMode uses in-cluster configuration (ServiceAccount)
	InClusterMode ClientMode = "incluster"
	// KubeconfigMode uses kubeconfig file
	KubeconfigMode ClientMode = "kubeconfig"
)

// Factory creates Kubernetes clients
type Factory struct {
	logger          *zap.Logger
	config          *rest.Config
	client          kubernetes.Interface
	dynamicClient   dynamic.Interface
	discoveryClient discovery.DiscoveryInterface
}

// NewFactory creates a new client factory
func NewFactory(logger *zap.Logger, mode ClientMode, kubeconfigPath string) (*Factory, error) {
	var config *rest.Config
	var err error

	switch mode {
	case InClusterMode:
		logger.Info("Creating in-cluster Kubernetes client")
		config, err = rest.InClusterConfig()
		if err != nil {
			return nil, fmt.Errorf("failed to create in-cluster config: %w", err)
		}
	case KubeconfigMode:
		logger.Info("Creating kubeconfig-based Kubernetes client", zap.String("kubeconfig", kubeconfigPath))
		config, err = buildKubeconfigFromPath(kubeconfigPath)
		if err != nil {
			return nil, fmt.Errorf("failed to create kubeconfig-based config: %w", err)
		}
	default:
		return nil, fmt.Errorf("unsupported client mode: %s", mode)
	}

	// Create the clientset
	clientset, err := kubernetes.NewForConfig(config)
	if err != nil {
		return nil, fmt.Errorf("failed to create Kubernetes clientset: %w", err)
	}

	// Create dynamic client
	dynamicClient, err := dynamic.NewForConfig(config)
	if err != nil {
		return nil, fmt.Errorf("failed to create dynamic client: %w", err)
	}

	// Create discovery client
	discoveryClient, err := discovery.NewDiscoveryClientForConfig(config)
	if err != nil {
		return nil, fmt.Errorf("failed to create discovery client: %w", err)
	}

	logger.Info("Kubernetes client factory created successfully")

	return &Factory{
		logger:          logger,
		config:          config,
		client:          clientset,
		dynamicClient:   dynamicClient,
		discoveryClient: discoveryClient,
	}, nil
}

// Client returns the Kubernetes clientset
func (f *Factory) Client() kubernetes.Interface {
	return f.client
}

// Config returns the REST config
func (f *Factory) Config() *rest.Config {
	return f.config
}

// DynamicClient returns the dynamic client
func (f *Factory) DynamicClient() dynamic.Interface {
	return f.dynamicClient
}

// DiscoveryClient returns the discovery client
func (f *Factory) DiscoveryClient() discovery.DiscoveryInterface {
	return f.discoveryClient
}

// RESTConfig returns the underlying REST config
func (f *Factory) RESTConfig() *rest.Config {
	return f.config
}

// buildKubeconfigFromPath builds a kubeconfig from the given path
func buildKubeconfigFromPath(kubeconfigPath string) (*rest.Config, error) {
	if kubeconfigPath == "" {
		// Try default locations
		if kubeconfig := os.Getenv("KUBECONFIG"); kubeconfig != "" {
			kubeconfigPath = kubeconfig
		} else if home := homedir.HomeDir(); home != "" {
			kubeconfigPath = filepath.Join(home, ".kube", "config")
		} else {
			return nil, fmt.Errorf("no kubeconfig path provided and unable to determine default location")
		}
	}

	// Check if the file exists
	if _, err := os.Stat(kubeconfigPath); os.IsNotExist(err) {
		return nil, fmt.Errorf("kubeconfig file does not exist: %s", kubeconfigPath)
	}

	// Build the config
	config, err := clientcmd.BuildConfigFromFlags("", kubeconfigPath)
	if err != nil {
		return nil, fmt.Errorf("failed to build config from kubeconfig %s: %w", kubeconfigPath, err)
	}

	return config, nil
}

// ValidateConnection tests the connection to the Kubernetes API server
func (f *Factory) ValidateConnection() error {
	f.logger.Info("Validating Kubernetes connection")

	// Try to get server version
	version, err := f.client.Discovery().ServerVersion()
	if err != nil {
		return fmt.Errorf("failed to connect to Kubernetes API: %w", err)
	}

	f.logger.Info("Kubernetes connection validated",
		zap.String("gitVersion", version.GitVersion),
		zap.String("platform", version.Platform),
	)

	return nil
}

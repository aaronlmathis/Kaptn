package informers

import (
	"context"
	"encoding/json"

	"go.uber.org/zap"
	discoveryv1 "k8s.io/api/discovery/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/fields"
	"k8s.io/client-go/tools/cache"
)

// EndpointSliceEventHandler handles EndpointSlice events
type EndpointSliceEventHandler struct {
	logger    *zap.Logger
	broadcast func(room string, event string, data interface{})
}

// NewEndpointSliceEventHandler creates a new EndpointSlice event handler
func NewEndpointSliceEventHandler(logger *zap.Logger, broadcast func(room string, event string, data interface{})) *EndpointSliceEventHandler {
	return &EndpointSliceEventHandler{
		logger:    logger,
		broadcast: broadcast,
	}
}

// OnAdd handles EndpointSlice add events
func (h *EndpointSliceEventHandler) OnAdd(obj interface{}, isInInitialList bool) {
	endpointSlice, ok := obj.(*discoveryv1.EndpointSlice)
	if !ok {
		h.logger.Error("Expected EndpointSlice object", zap.Any("obj", obj))
		return
	}

	h.logger.Debug("EndpointSlice added",
		zap.String("name", endpointSlice.Name),
		zap.String("namespace", endpointSlice.Namespace))

	summary := endpointSliceToSummary(endpointSlice)
	h.broadcast("overview", "endpointslice_added", summary)
}

// OnUpdate handles EndpointSlice update events
func (h *EndpointSliceEventHandler) OnUpdate(oldObj, newObj interface{}) {
	endpointSlice, ok := newObj.(*discoveryv1.EndpointSlice)
	if !ok {
		h.logger.Error("Expected EndpointSlice object", zap.Any("obj", newObj))
		return
	}

	h.logger.Debug("EndpointSlice updated",
		zap.String("name", endpointSlice.Name),
		zap.String("namespace", endpointSlice.Namespace))

	summary := endpointSliceToSummary(endpointSlice)
	h.broadcast("overview", "endpointslice_updated", summary)
}

// OnDelete handles EndpointSlice delete events
func (h *EndpointSliceEventHandler) OnDelete(obj interface{}) {
	endpointSlice, ok := obj.(*discoveryv1.EndpointSlice)
	if !ok {
		// Handle DeletedFinalStateUnknown
		if deletedObj, ok := obj.(cache.DeletedFinalStateUnknown); ok {
			endpointSlice, ok = deletedObj.Obj.(*discoveryv1.EndpointSlice)
			if !ok {
				h.logger.Error("Expected EndpointSlice object in DeletedFinalStateUnknown", zap.Any("obj", obj))
				return
			}
		} else {
			h.logger.Error("Expected EndpointSlice object", zap.Any("obj", obj))
			return
		}
	}

	h.logger.Debug("EndpointSlice deleted",
		zap.String("name", endpointSlice.Name),
		zap.String("namespace", endpointSlice.Namespace))

	summary := endpointSliceToSummary(endpointSlice)
	h.broadcast("overview", "endpointslice_deleted", summary)
}

// endpointSliceToSummary converts an EndpointSlice to summary format
func endpointSliceToSummary(endpointSlice *discoveryv1.EndpointSlice) map[string]interface{} {
	// Count ready and not ready endpoints
	readyEndpoints := 0
	notReadyEndpoints := 0
	totalEndpoints := len(endpointSlice.Endpoints)

	for _, endpoint := range endpointSlice.Endpoints {
		if endpoint.Conditions.Ready != nil && *endpoint.Conditions.Ready {
			readyEndpoints++
		} else {
			notReadyEndpoints++
		}
	}

	// Get address type
	addressType := "Unknown"
	if endpointSlice.AddressType == discoveryv1.AddressTypeIPv4 {
		addressType = "IPv4"
	} else if endpointSlice.AddressType == discoveryv1.AddressTypeIPv6 {
		addressType = "IPv6"
	} else if endpointSlice.AddressType == discoveryv1.AddressTypeFQDN {
		addressType = "FQDN"
	}

	// Get port information
	ports := make([]map[string]interface{}, 0, len(endpointSlice.Ports))
	for _, port := range endpointSlice.Ports {
		portInfo := map[string]interface{}{
			"protocol": string(*port.Protocol),
		}
		if port.Port != nil {
			portInfo["port"] = *port.Port
		}
		if port.Name != nil {
			portInfo["name"] = *port.Name
		}
		ports = append(ports, portInfo)
	}

	// Calculate age
	age := ""
	if !endpointSlice.CreationTimestamp.IsZero() {
		age = endpointSlice.CreationTimestamp.Format("2006-01-02T15:04:05Z")
	}

	// Get labels as JSON string for display
	labelsJSON := "{}"
	if len(endpointSlice.Labels) > 0 {
		if labelBytes, err := json.Marshal(endpointSlice.Labels); err == nil {
			labelsJSON = string(labelBytes)
		}
	}

	return map[string]interface{}{
		"name":              endpointSlice.Name,
		"namespace":         endpointSlice.Namespace,
		"uid":               string(endpointSlice.UID),
		"age":               age,
		"labels":            labelsJSON,
		"addressType":       addressType,
		"totalEndpoints":    totalEndpoints,
		"readyEndpoints":    readyEndpoints,
		"notReadyEndpoints": notReadyEndpoints,
		"ports":             ports,
		"creationTimestamp": endpointSlice.CreationTimestamp.Time,
	}
}

// NewEndpointSliceInformer creates a new EndpointSlice informer
func NewEndpointSliceInformer(ctx context.Context, manager *Manager) (cache.SharedIndexInformer, error) {
	listWatcher := cache.NewListWatchFromClient(
		manager.client.DiscoveryV1().RESTClient(),
		"endpointslices",
		metav1.NamespaceAll,
		fields.Everything(),
	)

	informer := cache.NewSharedIndexInformer(
		listWatcher,
		&discoveryv1.EndpointSlice{},
		0, // resyncPeriod
		cache.Indexers{},
	)

	return informer, nil
}

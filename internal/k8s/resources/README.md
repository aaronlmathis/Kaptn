# Ingress and Istio Gateway Support

This document describes the enhanced ingress functionality that supports both standard Kubernetes ingresses and Istio Gateways.

## Features

### 1. Unified Ingress Listing
The `ListIngresses()` function now returns both standard Kubernetes ingresses and Istio Gateway resources:
- Standard ingresses from `networking.k8s.io/v1` and `extensions/v1beta1` (fallback)
- Istio Gateways from `networking.istio.io/v1beta1`

### 2. Resource Type Identification
All returned resources include a `kaptn.io/resource-type` annotation to distinguish between:
- `ingress` - Standard Kubernetes ingress
- `istio-gateway` - Istio Gateway resource

### 3. Performance Optimizations
- Concurrent fetching of ingresses and gateways using goroutines
- Graceful handling when Istio is not installed (no failures, just logs debug message)
- Efficient error handling and fallback mechanisms

### 4. Unified Resource Operations
The following operations support both ingresses and gateways:
- `GetIngress()` - Get by name (tries ingress first, then gateway)
- `DeleteResource()` - Delete by kind ("Ingress" or "Gateway")
- `ExportResource()` - Export YAML for both types

## API Usage Examples

### Listing All Ingresses and Gateways
```go
ingresses, err := rm.ListIngresses(ctx, "my-namespace")
if err != nil {
    return err
}

for _, resource := range ingresses {
    resourceMap := resource.(map[string]interface{})
    metadata := resourceMap["metadata"].(map[string]interface{})
    annotations := metadata["annotations"].(map[string]interface{})
    resourceType := annotations["kaptn.io/resource-type"]
    
    if resourceType == "istio-gateway" {
        // Handle Istio Gateway
        fmt.Println("Found Istio Gateway:", metadata["name"])
    } else if resourceType == "ingress" {
        // Handle standard ingress
        fmt.Println("Found Ingress:", metadata["name"])
    }
}
```

### Getting a Specific Resource
```go
// This will try ingress first, then gateway
resource, err := rm.GetIngress(ctx, "my-namespace", "my-resource")
if err != nil {
    return err
}

// Check resource type
metadata := resource["metadata"].(map[string]interface{})
annotations := metadata["annotations"].(map[string]interface{})
resourceType := annotations["kaptn.io/resource-type"]
```

### Deleting Resources
```go
// Delete standard ingress
err := rm.DeleteResource(ctx, DeleteRequest{
    Namespace: "my-namespace",
    Name:      "my-ingress",
    Kind:      "Ingress",
})

// Delete Istio Gateway
err := rm.DeleteResource(ctx, DeleteRequest{
    Namespace: "my-namespace",
    Name:      "my-gateway",
    Kind:      "Gateway",
})
```

### Exporting Resources
```go
// Export standard ingress
export, err := rm.ExportResource(ctx, "my-namespace", "my-ingress", "Ingress")

// Export Istio Gateway
export, err := rm.ExportResource(ctx, "my-namespace", "my-gateway", "Gateway")
```

## Performance Characteristics

- **Concurrent Fetching**: Ingresses and gateways are fetched in parallel, reducing total response time
- **Graceful Degradation**: If Istio is not installed, the function continues without errors
- **Efficient Fallbacks**: Standard ingress API version fallback is handled efficiently
- **Minimal Overhead**: Resource type annotations are added without copying large objects

## Error Handling

- If standard ingress API calls fail and Istio is not available, appropriate errors are returned
- If only Istio is unavailable, debug logs are written but no errors are returned
- Resource-specific operations (get, delete, export) will try both resource types as appropriate

## Compatibility

- Kubernetes 1.19+ (networking.k8s.io/v1 ingresses)
- Kubernetes 1.14-1.18 (extensions/v1beta1 ingresses fallback)
- Istio 1.5+ (networking.istio.io/v1beta1 gateways)
- Works with or without Istio installed

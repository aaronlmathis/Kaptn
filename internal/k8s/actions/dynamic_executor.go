package actions

import (
    "context"
    "fmt"

    "go.uber.org/zap"
    metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
    "k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
    "k8s.io/apimachinery/pkg/runtime/schema"
    "k8s.io/apimachinery/pkg/types"
    "k8s.io/client-go/discovery"
    "k8s.io/client-go/discovery/cached/memory"
    "k8s.io/client-go/dynamic"
    "k8s.io/client-go/restmapper"
)

// DynamicExecutor executes generic actions using the dynamic client + RESTMapper.
type DynamicExecutor struct {
    dyn   dynamic.Interface
    disc  discovery.DiscoveryInterface
    log   *zap.Logger
}

func NewDynamicExecutor(dyn dynamic.Interface, disc discovery.DiscoveryInterface, log *zap.Logger) *DynamicExecutor {
    return &DynamicExecutor{dyn: dyn, disc: disc, log: log}
}

// Delete deletes a resource by apiVersion/kind/namespace/name with server-side dry-run support.
func (e *DynamicExecutor) Delete(ctx context.Context, apiVersion, kind, namespace, name string, dryRun bool, opts metav1.DeleteOptions) error {
    gvk := schema.FromAPIVersionAndKind(apiVersion, kind)
    mapper := restmapper.NewDeferredDiscoveryRESTMapper(memory.NewMemCacheClient(e.disc))
    m, err := mapper.RESTMapping(gvk.GroupKind(), gvk.Version)
    if err != nil { return fmt.Errorf("mapping: %w", err) }
    var ri dynamic.ResourceInterface
    if m.Scope.Name() == "namespace" {
        ri = e.dyn.Resource(m.Resource).Namespace(namespace)
    } else {
        ri = e.dyn.Resource(m.Resource)
    }
    if dryRun { opts.DryRun = []string{"All"} }
    return ri.Delete(ctx, name, opts)
}

// Patch applies a patch to a resource (merge/strategic/json) with server-side dry run.
func (e *DynamicExecutor) Patch(ctx context.Context, apiVersion, kind, namespace, name string, pt types.PatchType, patch []byte, po metav1.PatchOptions, dryRun bool) (*unstructured.Unstructured, error) {
    gvk := schema.FromAPIVersionAndKind(apiVersion, kind)
    mapper := restmapper.NewDeferredDiscoveryRESTMapper(memory.NewMemCacheClient(e.disc))
    m, err := mapper.RESTMapping(gvk.GroupKind(), gvk.Version)
    if err != nil { return nil, fmt.Errorf("mapping: %w", err) }
    var ri dynamic.ResourceInterface
    if m.Scope.Name() == "namespace" {
        ri = e.dyn.Resource(m.Resource).Namespace(namespace)
    } else {
        ri = e.dyn.Resource(m.Resource)
    }
    if dryRun { po.DryRun = []string{"All"} }
    return ri.Patch(ctx, name, pt, patch, po)
}

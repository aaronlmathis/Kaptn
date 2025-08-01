# Kubernetes RBAC for Admin Dashboard

This directory contains RBAC examples for the Kubernetes Admin Dashboard.

## Production ServiceAccount (Minimal Permissions)

Use this for production deployments with least-privilege access:

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: kad-sa
  namespace: kube-system
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: kad-readonly
rules:
  # Read access to core resources
  - apiGroups: [""]
    resources: ["nodes", "pods", "namespaces", "events"]
    verbs: ["get", "list", "watch"]
  # Read access to workloads
  - apiGroups: ["apps"]
    resources: ["deployments", "replicasets", "daemonsets", "statefulsets"]
    verbs: ["get", "list", "watch"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: kad-readonly-binding
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: kad-readonly
subjects:
  - kind: ServiceAccount
    name: kad-sa
    namespace: kube-system
```

## Development ServiceAccount (More Permissions)

Use this for development with node operations and apply capabilities:

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: kad-dev-sa
  namespace: kube-system
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: kad-dev-ops
rules:
  # Read access to all resources
  - apiGroups: ["*"]
    resources: ["*"]
    verbs: ["get", "list", "watch"]
  # Node operations
  - apiGroups: [""]
    resources: ["nodes"]
    verbs: ["update", "patch"]
  # Pod eviction for drain
  - apiGroups: ["policy"]
    resources: ["evictions"]
    verbs: ["create"]
  - apiGroups: [""]
    resources: ["pods/eviction"]
    verbs: ["create"]
  # Apply operations (limited to specific namespaces)
  - apiGroups: ["*"]
    resources: ["*"]
    verbs: ["create", "update", "patch", "delete"]
    resourceNames: []  # Restrict as needed
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: kad-dev-ops-binding
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: kad-dev-ops
subjects:
  - kind: ServiceAccount
    name: kad-dev-sa
    namespace: kube-system
```

## Usage

Apply the appropriate RBAC based on your environment:

**For production (read-only)**:
```bash
kubectl apply -f rbac-readonly.yaml
```

**For development**:
```bash
kubectl apply -f rbac-dev.yaml
```

## Security Notes

1. **Least Privilege**: Start with read-only permissions and add only what's needed
2. **Namespace Restrictions**: Consider restricting operations to specific namespaces
3. **Resource Names**: Use `resourceNames` to limit which specific resources can be modified
4. **Admission Controllers**: Use admission controllers for additional policy enforcement
5. **Audit Logs**: Enable audit logging to track all operations

## Testing RBAC

Test the permissions:

```bash
# Test read access
kubectl auth can-i get nodes --as=system:serviceaccount:kube-system:kad-sa

# Test write access (should fail for read-only)
kubectl auth can-i update nodes --as=system:serviceaccount:kube-system:kad-sa

# Test eviction (for drain operations)
kubectl auth can-i create evictions --as=system:serviceaccount:kube-system:kad-dev-sa
```

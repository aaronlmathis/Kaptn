#!/bin/bash

# ============================================================================
# KAPTN FRESH DEPLOYMENT SCRIPT
# ============================================================================
# This script deploys Kaptn with full OIDC + RBAC configuration from scratch

set -e  # Exit on any error

echo "🚀 Starting fresh Kaptn deployment..."
echo ""

# Check if kubectl is available
if ! command -v kubectl &> /dev/null; then
    echo "❌ kubectl is not installed or not in PATH"
    exit 1
fi

# Check if we can connect to cluster
if ! kubectl cluster-info &> /dev/null; then
    echo "❌ Cannot connect to Kubernetes cluster"
    exit 1
fi

echo "✅ Connected to cluster: $(kubectl config current-context)"
echo ""

# Remove any existing Kaptn deployment
echo "🧹 Cleaning up any existing Kaptn deployment..."
kubectl delete namespace kaptn --ignore-not-found=true --timeout=60s
echo "✅ Cleanup complete"
echo ""

# Deploy everything
echo "📦 Deploying Kaptn complete configuration..."
kubectl apply -f kaptn-complete-deployment.yaml

echo ""
echo "⏳ Waiting for namespace to be ready..."
kubectl wait --for=condition=Ready namespace/kaptn --timeout=30s

echo ""
echo "⏳ Waiting for deployment to be ready..."
kubectl rollout status deployment kaptn -n kaptn --timeout=300s

echo ""
echo "✅ Deployment complete!"
echo ""
echo "🔍 Current status:"
kubectl get all -n kaptn
echo ""
echo "📋 ServiceAccount permissions:"
kubectl describe clusterrolebinding kaptn-backend-impersonator-binding
echo ""
echo "👤 User bindings:"
kubectl get configmap kaptn-user-bindings -n kaptn -o jsonpath='{.data}' | head -3
echo ""
echo "🌐 Access Kaptn at: https://dev.kaptn.dev"
echo ""
echo "🔑 Expected behavior after login:"
echo "  ✓ User: aaron.mathis@gmail.com"
echo "  ✓ Groups: kaptn-admins-group, cluster-admins-group"
echo "  ✓ Permissions: Full cluster-admin access via impersonation"
echo ""
echo "🐛 Debug commands:"
echo "  kubectl logs -n kaptn deployment/kaptn -f"
echo "  kubectl describe pod -n kaptn -l app=kaptn"
echo ""

# Show pod logs briefly
echo "📝 Recent pod logs:"
kubectl logs -n kaptn deployment/kaptn --tail=10 || echo "No logs yet (pod may still be starting)"

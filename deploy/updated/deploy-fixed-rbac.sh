#!/bin/bash

# KAPTN RBAC Fix Deployment Script
# Applies all the corrected RBAC configurations

echo "🚀 Deploying Kaptn with fixed RBAC configuration..."

# 1. Apply the backend ServiceAccount with impersonation permissions
echo "📋 Applying ServiceAccount with impersonation permissions..."
kubectl apply -f deploy/updated/kaptn-backend-sa.yml

# 2. Apply user bindings (now in correct kaptn namespace)
echo "👤 Applying user bindings ConfigMap..."
kubectl apply -f deploy/updated/aaron-user-bindings.yaml

# 3. Apply the full deployment (now uses kaptn-backend SA and has OIDC enabled)
echo "🔧 Applying main deployment..."
kubectl apply -f deploy/updated/kaptn-full-deploy.yml

# 4. Wait for deployment to be ready
echo "⏳ Waiting for deployment to be ready..."
kubectl rollout status deployment kaptn -n kaptn --timeout=120s

echo ""
echo "✅ Deployment complete!"
echo ""
echo "🔍 Verification commands:"
echo "  kubectl get pods -n kaptn"
echo "  kubectl logs -n kaptn deployment/kaptn -f"
echo ""
echo "🌐 Access Kaptn at: https://dev.kaptn.dev"
echo ""
echo "🔑 Expected behavior:"
echo "  - Login with Google OAuth"
echo "  - User gets 'kaptn-admins-group' and 'cluster-admins-group'"
echo "  - Full admin access to all Kubernetes resources"
echo ""

# Optional: Show current status
echo "📊 Current status:"
kubectl get pods -n kaptn

# 1. Remove existing Kaptn resources
kubectl -n monitoring delete -f kaptn-deploy.yml

# 2. Deploy updated Kaptn manifest (with Service type: LoadBalancer)
kubectl apply -f kaptn-deploy.yml

# 3. Expose the LoadBalancer in Minikube
minikube tunnel

# 4. Verify the LoadBalancer service has an external IP
kubectl -n monitoring get svc kaptn

# 5. Check that the Kaptn pod is running
kubectl -n monitoring get pods
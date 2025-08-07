# Proposed Split for handlers_resources.go

## Overview
The `handlers_resources.go` file contains 1000+ lines and handles many different Kubernetes resource types. This proposal splits it into logical, focused files based on resource categories.

## Proposed File Structure

### 1. `handlers_workloads.go`
**Purpose**: Handle all workload-related resources (Pods, Deployments, etc.)

**Functions**:
- `handleListPods`
- `handleGetPod`
- `handleListDeployments`
- `handleGetDeployment`
- `handleListStatefulSets`
- `handleGetStatefulSet`
- `handleListReplicaSets`
- `handleGetReplicaSet`
- `handleListDaemonSets`
- `handleGetDaemonSet`
- `handleListJobs`
- `handleGetJob`
- `handleListCronJobs`
- `handleGetCronJob`

### 2. `handlers_services.go`
**Purpose**: Handle all service and networking-related resources

**Functions**:
- `handleListServices`
- `handleGetService`
- `handleListServicesInNamespace`
- `handleListEndpoints`
- `handleGetEndpoints`
- `handleListEndpointSlices`
- `handleGetEndpointSlice`
- `handleListNetworkPolicies`
- `handleGetNetworkPolicy`
- `handleListAllIngresses`
- `handleListIngresses`
- `handleGetIngress`

### 3. `handlers_storage.go`
**Purpose**: Handle all storage-related resources

**Functions**:
- `handleListConfigMaps`
- `handleGetConfigMap`
- `handleListPersistentVolumes`
- `handleGetPersistentVolume`
- `handleListPersistentVolumeClaims`
- `handleGetPersistentVolumeClaim`
- `handleListStorageClasses`
- `handleGetStorageClass`
- `handleListVolumeSnapshots`
- `handleGetVolumeSnapshot`
- `handleListVolumeSnapshotClasses`
- `handleGetVolumeSnapshotClass`
- `handleListCSIDrivers`
- `handleGetCSIDriver`

### 4. `handlers_cluster.go`
**Purpose**: Handle cluster-level resources and operations

**Functions**:
- `handleListNodes`
- `handleGetNode`
- `handleListNamespaces`
- `handleGetNamespace`
- `handleListResourceQuotas`
- `handleGetResourceQuota`
- `handleDeleteResourceQuota`
- `handleListAPIResources`
- `handleGetAPIResource`
- `handleGetOverview`

### 5. `handlers_common.go`
**Purpose**: Handle common operations that work across multiple resource types

**Functions**:
- `handleExportResource`
- `handleExportClusterScopedResource`
- `handleGetPodLogs`

## Benefits of This Split

1. **Logical Grouping**: Resources are grouped by their functional purpose in Kubernetes
2. **Reduced File Size**: Each file will be 200-400 lines instead of 1000+
3. **Easier Maintenance**: Developers can focus on specific resource types
4. **Better Navigation**: Finding handlers for specific resources becomes easier
5. **Consistent Patterns**: Each file follows similar patterns for list/get operations

## File Size Estimates

- `handlers_workloads.go`: ~350 lines
- `handlers_services.go`: ~300 lines  
- `handlers_storage.go`: ~400 lines
- `handlers_cluster.go`: ~250 lines
- `handlers_common.go`: ~100 lines

## Implementation Notes

- All files should import the same packages as the original
- Each file should maintain the same receiver `(s *Server)` for methods
- Error handling patterns should remain consistent across all files
- Consider adding file-level comments
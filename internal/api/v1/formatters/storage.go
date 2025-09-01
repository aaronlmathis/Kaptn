// Package formatters provides domain-specific response formatting functions
// for converting Kubernetes storage resources to API response formats.
package formatters

import (
	"fmt"
	"time"

	v1 "k8s.io/api/core/v1"
	storagev1 "k8s.io/api/storage/v1"
)

// StorageFormatter provides formatting functions for storage resources
type StorageFormatter struct{}

// NewStorageFormatter creates a new storage formatter
func NewStorageFormatter() *StorageFormatter {
	return &StorageFormatter{}
}

// PersistentVolumeToResponse formats a PersistentVolume response
func (f *StorageFormatter) PersistentVolumeToResponse(pv *v1.PersistentVolume) map[string]interface{} {
	// Calculate age
	age := time.Since(pv.CreationTimestamp.Time).Round(time.Second).String()
	if age == "0s" {
		age = "1s"
	}

	// Get capacity
	capacity := "Unknown"
	if pv.Spec.Capacity != nil {
		if storageQuantity, ok := pv.Spec.Capacity[v1.ResourceStorage]; ok {
			capacity = storageQuantity.String()
		}
	}

	// Get access modes
	accessModes := make([]string, len(pv.Spec.AccessModes))
	for i, mode := range pv.Spec.AccessModes {
		switch mode {
		case v1.ReadWriteOnce:
			accessModes[i] = "RWO"
		case v1.ReadOnlyMany:
			accessModes[i] = "ROX"
		case v1.ReadWriteMany:
			accessModes[i] = "RWX"
		case v1.ReadWriteOncePod:
			accessModes[i] = "RWOP"
		default:
			accessModes[i] = string(mode)
		}
	}

	// Get reclaim policy
	reclaimPolicy := "Unknown"
	if pv.Spec.PersistentVolumeReclaimPolicy != "" {
		reclaimPolicy = string(pv.Spec.PersistentVolumeReclaimPolicy)
	}

	// Get status/phase
	status := string(pv.Status.Phase)

	// Get claim reference
	claimRef := ""
	if pv.Spec.ClaimRef != nil {
		claimRef = fmt.Sprintf("%s/%s", pv.Spec.ClaimRef.Namespace, pv.Spec.ClaimRef.Name)
	}

	// Get storage class
	storageClass := pv.Spec.StorageClassName
	if storageClass == "" {
		storageClass = "<none>"
	}

	// Get volume source type
	volumeSource := "Unknown"
	if pv.Spec.HostPath != nil {
		volumeSource = "HostPath"
	} else if pv.Spec.NFS != nil {
		volumeSource = "NFS"
	} else if pv.Spec.GCEPersistentDisk != nil {
		volumeSource = "GCE"
	} else if pv.Spec.AWSElasticBlockStore != nil {
		volumeSource = "AWS EBS"
	} else if pv.Spec.CSI != nil {
		volumeSource = fmt.Sprintf("CSI (%s)", pv.Spec.CSI.Driver)
	} else if pv.Spec.Local != nil {
		volumeSource = "Local"
	}

	// Count labels and annotations
	labelsCount := len(pv.Labels)
	annotationsCount := len(pv.Annotations)

	return map[string]interface{}{
		"id":                 pv.Name, // For table sorting
		"name":               pv.Name,
		"capacity":           capacity,
		"accessModes":        accessModes,
		"accessModesDisplay": fmt.Sprintf("[%s]", fmt.Sprintf("%v", accessModes)),
		"reclaimPolicy":      reclaimPolicy,
		"status":             status,
		"claim":              claimRef,
		"storageClass":       storageClass,
		"volumeSource":       volumeSource,
		"age":                age,
		"labelsCount":        labelsCount,
		"annotationsCount":   annotationsCount,
		"creationTimestamp":  pv.CreationTimestamp.Time,
		"labels":             pv.Labels,
		"annotations":        pv.Annotations,
	}
}

// PersistentVolumeClaimToResponse formats a PersistentVolumeClaim response
func (f *StorageFormatter) PersistentVolumeClaimToResponse(pvc *v1.PersistentVolumeClaim) map[string]interface{} {
	// Calculate age
	age := time.Since(pvc.CreationTimestamp.Time).Round(time.Second).String()
	if age == "0s" {
		age = "1s"
	}

	// Get status/phase
	status := string(pvc.Status.Phase)

	// Get volume name (bound PV)
	volumeName := ""
	if pvc.Spec.VolumeName != "" {
		volumeName = pvc.Spec.VolumeName
	}

	// Get capacity - from status if available, otherwise from spec
	capacity := "Unknown"
	if pvc.Status.Capacity != nil {
		if storageQuantity, ok := pvc.Status.Capacity[v1.ResourceStorage]; ok {
			capacity = storageQuantity.String()
		}
	} else if pvc.Spec.Resources.Requests != nil {
		if storageQuantity, ok := pvc.Spec.Resources.Requests[v1.ResourceStorage]; ok {
			capacity = storageQuantity.String()
		}
	}

	// Get access modes
	accessModes := make([]string, len(pvc.Spec.AccessModes))
	for i, mode := range pvc.Spec.AccessModes {
		switch mode {
		case v1.ReadWriteOnce:
			accessModes[i] = "RWO"
		case v1.ReadOnlyMany:
			accessModes[i] = "ROX"
		case v1.ReadWriteMany:
			accessModes[i] = "RWX"
		case v1.ReadWriteOncePod:
			accessModes[i] = "RWOP"
		default:
			accessModes[i] = string(mode)
		}
	}

	// Get storage class
	storageClass := ""
	if pvc.Spec.StorageClassName != nil {
		storageClass = *pvc.Spec.StorageClassName
	}
	if storageClass == "" {
		storageClass = "<none>"
	}

	// Count labels and annotations
	labelsCount := len(pvc.Labels)
	annotationsCount := len(pvc.Annotations)

	return map[string]interface{}{
		"id":                 fmt.Sprintf("%s-%s", pvc.Namespace, pvc.Name), // For table sorting
		"name":               pvc.Name,
		"namespace":          pvc.Namespace,
		"status":             status,
		"volume":             volumeName,
		"capacity":           capacity,
		"accessModes":        accessModes,
		"accessModesDisplay": fmt.Sprintf("[%s]", fmt.Sprintf("%v", accessModes)),
		"storageClass":       storageClass,
		"age":                age,
		"labelsCount":        labelsCount,
		"annotationsCount":   annotationsCount,
		"creationTimestamp":  pvc.CreationTimestamp.Time,
		"labels":             pvc.Labels,
		"annotations":        pvc.Annotations,
	}
}

// StorageClassToResponse formats a StorageClass response
func (f *StorageFormatter) StorageClassToResponse(sc storagev1.StorageClass) map[string]interface{} {
	// Calculate age
	age := "unknown"
	if !sc.CreationTimestamp.IsZero() {
		age = time.Since(sc.CreationTimestamp.Time).String()
	}

	// Get provisioner
	provisioner := sc.Provisioner

	// Get reclaim policy
	reclaimPolicy := "Delete" // Default reclaim policy for StorageClass
	if sc.ReclaimPolicy != nil {
		reclaimPolicy = string(*sc.ReclaimPolicy)
	}

	// Get volume binding mode
	volumeBindingMode := "Immediate" // Default volume binding mode
	if sc.VolumeBindingMode != nil {
		volumeBindingMode = string(*sc.VolumeBindingMode)
	}

	// Get allow volume expansion
	allowVolumeExpansion := false
	if sc.AllowVolumeExpansion != nil {
		allowVolumeExpansion = *sc.AllowVolumeExpansion
	}

	// Count parameters
	parametersCount := len(sc.Parameters)

	// Count labels and annotations
	labelsCount := len(sc.Labels)
	annotationsCount := len(sc.Annotations)

	// Check if default storage class
	isDefault := false
	if sc.Annotations != nil {
		if value, exists := sc.Annotations["storageclass.kubernetes.io/is-default-class"]; exists {
			isDefault = value == "true"
		}
		// Also check the beta annotation for backward compatibility
		if !isDefault {
			if value, exists := sc.Annotations["storageclass.beta.kubernetes.io/is-default-class"]; exists {
				isDefault = value == "true"
			}
		}
	}

	return map[string]interface{}{
		"id":                   sc.Name, // For table sorting (StorageClass is cluster-scoped)
		"name":                 sc.Name,
		"provisioner":          provisioner,
		"reclaimPolicy":        reclaimPolicy,
		"volumeBindingMode":    volumeBindingMode,
		"allowVolumeExpansion": allowVolumeExpansion,
		"parametersCount":      parametersCount,
		"age":                  age,
		"labelsCount":          labelsCount,
		"annotationsCount":     annotationsCount,
		"isDefault":            isDefault,
		"creationTimestamp":    sc.CreationTimestamp.Time,
		"labels":               sc.Labels,
		"annotations":          sc.Annotations,
		"parameters":           sc.Parameters,
	}
}

// CSIDriverToResponse converts a CSIDriver object to a response format
func (f *StorageFormatter) CSIDriverToResponse(csi storagev1.CSIDriver) map[string]interface{} {
	// Calculate age
	age := "unknown"
	if !csi.CreationTimestamp.IsZero() {
		age = time.Since(csi.CreationTimestamp.Time).String()
	}

	// Get spec fields
	attachRequired := true // Default value
	if csi.Spec.AttachRequired != nil {
		attachRequired = *csi.Spec.AttachRequired
	}

	podInfoOnMount := false // Default value
	if csi.Spec.PodInfoOnMount != nil {
		podInfoOnMount = *csi.Spec.PodInfoOnMount
	}

	requiresRepublish := false // Default value
	if csi.Spec.RequiresRepublish != nil {
		requiresRepublish = *csi.Spec.RequiresRepublish
	}

	storageCapacity := false // Default value
	if csi.Spec.StorageCapacity != nil {
		storageCapacity = *csi.Spec.StorageCapacity
	}

	fsGroupPolicy := "None" // Default value
	if csi.Spec.FSGroupPolicy != nil {
		fsGroupPolicy = string(*csi.Spec.FSGroupPolicy)
	}

	// Count volume lifecycle modes
	volumeLifecycleModes := len(csi.Spec.VolumeLifecycleModes)

	// Count token requests
	tokenRequests := len(csi.Spec.TokenRequests)

	// Count labels and annotations
	labelsCount := len(csi.Labels)
	annotationsCount := len(csi.Annotations)

	return map[string]interface{}{
		"id":                   csi.Name, // For table sorting (CSIDriver is cluster-scoped)
		"name":                 csi.Name,
		"attachRequired":       attachRequired,
		"podInfoOnMount":       podInfoOnMount,
		"requiresRepublish":    requiresRepublish,
		"storageCapacity":      storageCapacity,
		"fsGroupPolicy":        fsGroupPolicy,
		"volumeLifecycleModes": volumeLifecycleModes,
		"tokenRequests":        tokenRequests,
		"age":                  age,
		"labelsCount":          labelsCount,
		"annotationsCount":     annotationsCount,
		"creationTimestamp":    csi.CreationTimestamp.Time,
		"labels":               csi.Labels,
		"annotations":          csi.Annotations,
	}
}

// VolumeSnapshotToResponse converts a VolumeSnapshot object to a response format
func (f *StorageFormatter) VolumeSnapshotToResponse(obj interface{}) map[string]interface{} {
	vsMap, ok := obj.(map[string]interface{})
	if !ok {
		return map[string]interface{}{
			"name":      "unknown",
			"namespace": "unknown",
			"error":     "invalid volume snapshot format",
		}
	}

	// Extract metadata
	metadata, _ := vsMap["metadata"].(map[string]interface{})
	name, _ := metadata["name"].(string)
	namespace, _ := metadata["namespace"].(string)
	creationTimestamp, _ := metadata["creationTimestamp"].(string)
	labels, _ := metadata["labels"].(map[string]interface{})
	annotations, _ := metadata["annotations"].(map[string]interface{})

	// Calculate age
	age := "unknown"
	if creationTimestamp != "" {
		if parsedTime, err := time.Parse(time.RFC3339, creationTimestamp); err == nil {
			age = calculateAge(parsedTime)
		}
	}

	// Extract spec
	spec, _ := vsMap["spec"].(map[string]interface{})
	sourcePVC := "unknown"
	volumeSnapshotClassName := "unknown"

	if source, ok := spec["source"].(map[string]interface{}); ok {
		if pvcSource, ok := source["persistentVolumeClaimName"].(string); ok {
			sourcePVC = pvcSource
		}
	}

	if className, ok := spec["volumeSnapshotClassName"].(string); ok {
		volumeSnapshotClassName = className
	}

	// Extract status
	status, _ := vsMap["status"].(map[string]interface{})
	readyToUse := false
	restoreSize := "unknown"
	creationTime := "unknown"
	snapshotHandle := "unknown"

	if readyValue, ok := status["readyToUse"].(bool); ok {
		readyToUse = readyValue
	}

	if size, ok := status["restoreSize"].(string); ok {
		restoreSize = size
	}

	if createdAt, ok := status["creationTime"].(string); ok {
		creationTime = createdAt
	}

	if handle, ok := status["snapshotHandle"].(string); ok {
		snapshotHandle = handle
	}

	// Count labels and annotations
	labelsCount := len(labels)
	annotationsCount := len(annotations)

	return map[string]interface{}{
		"id":                      fmt.Sprintf("%s-%s", namespace, name), // For table sorting
		"name":                    name,
		"namespace":               namespace,
		"sourcePVC":               sourcePVC,
		"volumeSnapshotClassName": volumeSnapshotClassName,
		"readyToUse":              readyToUse,
		"restoreSize":             restoreSize,
		"creationTime":            creationTime,
		"snapshotHandle":          snapshotHandle,
		"age":                     age,
		"labelsCount":             labelsCount,
		"annotationsCount":        annotationsCount,
		"creationTimestamp":       creationTimestamp,
		"labels":                  labels,
		"annotations":             annotations,
	}
}

// VolumeSnapshotClassToResponse converts a VolumeSnapshotClass object to a response format
func (f *StorageFormatter) VolumeSnapshotClassToResponse(obj interface{}) map[string]interface{} {
	vscMap, ok := obj.(map[string]interface{})
	if !ok {
		return map[string]interface{}{
			"id":               "unknown",
			"name":             "unknown",
			"driver":           "unknown",
			"deletionPolicy":   "unknown",
			"age":              "unknown",
			"labelsCount":      0,
			"annotationsCount": 0,
			"parametersCount":  0,
		}
	}

	// Get metadata
	metadata, _ := vscMap["metadata"].(map[string]interface{})
	name := "unknown"
	var creationTimestamp time.Time
	var labels map[string]interface{}
	var annotations map[string]interface{}

	if metadata != nil {
		if nameVal, ok := metadata["name"].(string); ok {
			name = nameVal
		}

		// Parse creation timestamp
		if creationTime, ok := metadata["creationTimestamp"].(string); ok {
			if parsed, err := time.Parse(time.RFC3339, creationTime); err == nil {
				creationTimestamp = parsed
			}
		}

		// Get labels and annotations
		if labelsVal, ok := metadata["labels"].(map[string]interface{}); ok {
			labels = labelsVal
		}
		if annotationsVal, ok := metadata["annotations"].(map[string]interface{}); ok {
			annotations = annotationsVal
		}
	}

	// Calculate age
	age := "unknown"
	if !creationTimestamp.IsZero() {
		age = time.Since(creationTimestamp).String()
	}

	// Get driver from spec
	driver := "unknown"
	deletionPolicy := "Delete" // Default deletion policy
	var parameters map[string]interface{}

	if specVal, ok := vscMap["spec"].(map[string]interface{}); ok {
		if driverVal, ok := specVal["driver"].(string); ok {
			driver = driverVal
		}
		if deletionPolicyVal, ok := specVal["deletionPolicy"].(string); ok {
			deletionPolicy = deletionPolicyVal
		}
		if parametersVal, ok := specVal["parameters"].(map[string]interface{}); ok {
			parameters = parametersVal
		}
	}

	// Count labels, annotations, and parameters
	labelsCount := len(labels)
	annotationsCount := len(annotations)
	parametersCount := len(parameters)

	return map[string]interface{}{
		"id":                name, // For table sorting (VolumeSnapshotClass is cluster-scoped)
		"name":              name,
		"driver":            driver,
		"deletionPolicy":    deletionPolicy,
		"age":               age,
		"labelsCount":       labelsCount,
		"annotationsCount":  annotationsCount,
		"parametersCount":   parametersCount,
		"creationTimestamp": creationTimestamp,
		"labels":            labels,
		"annotations":       annotations,
		"parameters":        parameters,
	}
}

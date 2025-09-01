package dto

import "time"

// PersistentVolumeSummary represents a summary view of a persistent volume for list views
type PersistentVolumeSummary struct {
	ID                string            `json:"id"`
	Name              string            `json:"name"`
	Capacity          string            `json:"capacity"`
	AccessModes       []string          `json:"accessModes"`
	ReclaimPolicy     string            `json:"reclaimPolicy"`
	Status            string            `json:"status"`
	Claim             string            `json:"claim"`
	StorageClass      string            `json:"storageClass"`
	Reason            string            `json:"reason"`
	Age               string            `json:"age"`
	VolumeMode        string            `json:"volumeMode"`
	CreationTimestamp time.Time         `json:"creationTimestamp"`
	Labels            map[string]string `json:"labels"`
	Annotations       map[string]string `json:"annotations"`
}

// PersistentVolumeClaimSummary represents a summary view of a PVC for list views
type PersistentVolumeClaimSummary struct {
	ID                string            `json:"id"`
	Name              string            `json:"name"`
	Namespace         string            `json:"namespace"`
	Status            string            `json:"status"`
	Volume            string            `json:"volume"`
	Capacity          string            `json:"capacity"`
	AccessModes       []string          `json:"accessModes"`
	StorageClass      string            `json:"storageClass"`
	Age               string            `json:"age"`
	VolumeMode        string            `json:"volumeMode"`
	CreationTimestamp time.Time         `json:"creationTimestamp"`
	Labels            map[string]string `json:"labels"`
	Annotations       map[string]string `json:"annotations"`
}

// StorageClassSummary represents a summary view of a storage class for list views
type StorageClassSummary struct {
	ID                   string                 `json:"id"`
	Name                 string                 `json:"name"`
	Provisioner          string                 `json:"provisioner"`
	ReclaimPolicy        string                 `json:"reclaimPolicy"`
	VolumeBindingMode    string                 `json:"volumeBindingMode"`
	AllowVolumeExpansion bool                   `json:"allowVolumeExpansion"`
	Parameters           map[string]string      `json:"parameters"`
	MountOptions         []string               `json:"mountOptions"`
	Age                  string                 `json:"age"`
	CreationTimestamp    time.Time              `json:"creationTimestamp"`
	Labels               map[string]string      `json:"labels"`
	Annotations          map[string]string      `json:"annotations"`
}

// CSIDriverSummary represents a summary view of a CSI driver for list views
type CSIDriverSummary struct {
	ID                string            `json:"id"`
	Name              string            `json:"name"`
	AttachRequired    bool              `json:"attachRequired"`
	PodInfoOnMount    bool              `json:"podInfoOnMount"`
	VolumeLifecycleModes []string       `json:"volumeLifecycleModes"`
	StorageCapacity   bool              `json:"storageCapacity"`
	FSGroupPolicy     string            `json:"fsGroupPolicy"`
	Age               string            `json:"age"`
	CreationTimestamp time.Time         `json:"creationTimestamp"`
	Labels            map[string]string `json:"labels"`
	Annotations       map[string]string `json:"annotations"`
}

// VolumeSnapshotSummary represents a summary view of a volume snapshot for list views
type VolumeSnapshotSummary struct {
	ID                string            `json:"id"`
	Name              string            `json:"name"`
	Namespace         string            `json:"namespace"`
	SourcePVC         string            `json:"sourcePVC"`
	VolumeSnapshotClass string          `json:"volumeSnapshotClass"`
	ReadyToUse        bool              `json:"readyToUse"`
	RestoreSize       string            `json:"restoreSize"`
	Age               string            `json:"age"`
	CreationTimestamp time.Time         `json:"creationTimestamp"`
	Labels            map[string]string `json:"labels"`
	Annotations       map[string]string `json:"annotations"`
}

// VolumeSnapshotClassSummary represents a summary view of a volume snapshot class for list views
type VolumeSnapshotClassSummary struct {
	ID                string                 `json:"id"`
	Name              string                 `json:"name"`
	Driver            string                 `json:"driver"`
	DeletionPolicy    string                 `json:"deletionPolicy"`
	Parameters        map[string]interface{} `json:"parameters"`
	ParametersCount   int                    `json:"parametersCount"`
	Age               string                 `json:"age"`
	LabelsCount       int                    `json:"labelsCount"`
	AnnotationsCount  int                    `json:"annotationsCount"`
	CreationTimestamp time.Time              `json:"creationTimestamp"`
	Labels            map[string]string      `json:"labels"`
	Annotations       map[string]string      `json:"annotations"`
}

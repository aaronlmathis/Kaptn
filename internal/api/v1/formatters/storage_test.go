package formatters

import (
	"testing"
	"time"

	corev1 "k8s.io/api/core/v1"
	storagev1 "k8s.io/api/storage/v1"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

func TestStorageFormatter_PersistentVolumeToResponse(t *testing.T) {
	formatter := &StorageFormatter{}

	pv := &corev1.PersistentVolume{
		ObjectMeta: metav1.ObjectMeta{
			Name: "test-pv",
			Labels: map[string]string{
				"type": "local",
			},
			CreationTimestamp: metav1.Time{Time: time.Now().Add(-24 * time.Hour)},
		},
		Spec: corev1.PersistentVolumeSpec{
			Capacity: corev1.ResourceList{
				corev1.ResourceStorage: resource.MustParse("10Gi"),
			},
			AccessModes: []corev1.PersistentVolumeAccessMode{
				corev1.ReadWriteOnce,
			},
			StorageClassName: "local-storage",
			PersistentVolumeSource: corev1.PersistentVolumeSource{
				HostPath: &corev1.HostPathVolumeSource{
					Path: "/tmp/data",
				},
			},
		},
		Status: corev1.PersistentVolumeStatus{
			Phase: corev1.VolumeAvailable,
		},
	}

	result := formatter.PersistentVolumeToResponse(pv)

	if result["name"] != "test-pv" {
		t.Errorf("Expected name 'test-pv', got %v", result["name"])
	}

	if result["storageClass"] != "local-storage" {
		t.Errorf("Expected storageClass 'local-storage', got %v", result["storageClass"])
	}

	if result["status"] != "Available" {
		t.Errorf("Expected status 'Available', got %v", result["status"])
	}

	// Check capacity
	if result["capacity"] != "10Gi" {
		t.Errorf("Expected capacity '10Gi', got %v", result["capacity"])
	}
}

func TestStorageFormatter_PersistentVolumeClaimToResponse(t *testing.T) {
	formatter := &StorageFormatter{}

	pvc := &corev1.PersistentVolumeClaim{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "test-pvc",
			Namespace: "default",
			Labels: map[string]string{
				"app": "test",
			},
			CreationTimestamp: metav1.Time{Time: time.Now().Add(-12 * time.Hour)},
		},
		Spec: corev1.PersistentVolumeClaimSpec{
			AccessModes: []corev1.PersistentVolumeAccessMode{
				corev1.ReadWriteOnce,
			},
			Resources: corev1.VolumeResourceRequirements{
				Requests: corev1.ResourceList{
					corev1.ResourceStorage: resource.MustParse("5Gi"),
				},
			},
			StorageClassName: func() *string { s := "fast-ssd"; return &s }(),
		},
		Status: corev1.PersistentVolumeClaimStatus{
			Phase: corev1.ClaimBound,
		},
	}

	result := formatter.PersistentVolumeClaimToResponse(pvc)

	if result["name"] != "test-pvc" {
		t.Errorf("Expected name 'test-pvc', got %v", result["name"])
	}

	if result["namespace"] != "default" {
		t.Errorf("Expected namespace 'default', got %v", result["namespace"])
	}

	if result["status"] != "Bound" {
		t.Errorf("Expected status 'Bound', got %v", result["status"])
	}

	if result["storageClass"] != "fast-ssd" {
		t.Errorf("Expected storageClass 'fast-ssd', got %v", result["storageClass"])
	}
}

func TestStorageFormatter_StorageClassToResponse(t *testing.T) {
	formatter := &StorageFormatter{}

	allowVolumeExpansion := true
	reclaimPolicy := corev1.PersistentVolumeReclaimDelete
	volumeBindingMode := storagev1.VolumeBindingImmediate

	sc := &storagev1.StorageClass{
		ObjectMeta: metav1.ObjectMeta{
			Name: "fast-ssd",
			Labels: map[string]string{
				"tier": "fast",
			},
			CreationTimestamp: metav1.Time{Time: time.Now().Add(-48 * time.Hour)},
		},
		Provisioner: "kubernetes.io/aws-ebs",
		Parameters: map[string]string{
			"type": "gp3",
			"iops": "3000",
		},
		AllowVolumeExpansion: &allowVolumeExpansion,
		ReclaimPolicy:        &reclaimPolicy,
		VolumeBindingMode:    &volumeBindingMode,
	}

	result := formatter.StorageClassToResponse(*sc)

	if result["name"] != "fast-ssd" {
		t.Errorf("Expected name 'fast-ssd', got %v", result["name"])
	}

	if result["provisioner"] != "kubernetes.io/aws-ebs" {
		t.Errorf("Expected provisioner 'kubernetes.io/aws-ebs', got %v", result["provisioner"])
	}

	if result["reclaimPolicy"] != "Delete" {
		t.Errorf("Expected reclaimPolicy 'Delete', got %v", result["reclaimPolicy"])
	}

	if result["volumeBindingMode"] != "Immediate" {
		t.Errorf("Expected volumeBindingMode 'Immediate', got %v", result["volumeBindingMode"])
	}

	// Check parameters
	params, ok := result["parameters"].(map[string]string)
	if !ok {
		t.Errorf("Expected parameters to be map[string]string, got %T", result["parameters"])
	} else {
		if params["type"] != "gp3" {
			t.Errorf("Expected parameter type 'gp3', got %v", params["type"])
		}
	}
}

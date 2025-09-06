package actions

import (
    "context"
    "testing"

    "go.uber.org/zap"
)

func TestSafetyGuard_DeniedNamespace(t *testing.T) {
    logger, _ := zap.NewDevelopment()
    sg := NewSafetyGuard(logger, true)
    res, err := sg.ValidateAction(context.Background(), nil, "delete-pods", "delete", "pods", "kube-system", "foo", nil)
    if err != nil {
        t.Fatalf("unexpected error: %v", err)
    }
    if res.Allowed {
        t.Fatalf("expected denied for kube-system namespace")
    }
}

func TestSafetyGuard_ProtectedLabel(t *testing.T) {
    logger, _ := zap.NewDevelopment()
    sg := NewSafetyGuard(logger, true)
    labels := map[string]string{"kaptn.io/protected": "true"}
    res, err := sg.ValidateAction(context.Background(), nil, "delete-pods", "delete", "pods", "default", "foo", labels)
    if err != nil {
        t.Fatalf("unexpected error: %v", err)
    }
    if res.Allowed {
        t.Fatalf("expected denied due to protected label")
    }
}


package server

import (
    "encoding/json"
    "net/http"
    "sort"
    "strconv"
    "strings"
    "time"

    "github.com/aaronlmathis/kaptn/internal/api/v1/dto"
    "github.com/go-chi/chi/v5"
    "go.uber.org/zap"
    autoscalingv2 "k8s.io/api/autoscaling/v2"
    corev1 "k8s.io/api/core/v1"
    metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// HandleListHPAs lists HorizontalPodAutoscalers with optional filters and pagination
func (s *Server) HandleListHPAs(w http.ResponseWriter, r *http.Request) {
    // Query params (align with repo conventions; accept both namespace and ns)
    namespace := r.URL.Query().Get("namespace")
    if namespace == "" {
        namespace = r.URL.Query().Get("ns")
    }
    targetKind := r.URL.Query().Get("targetKind")
    targetName := r.URL.Query().Get("targetName")
    statusFilter := r.URL.Query().Get("status") // atMax|limited|active|none
    sortField := r.URL.Query().Get("sort")
    sortOrder := strings.ToLower(r.URL.Query().Get("order"))
    search := r.URL.Query().Get("search")

    page, _ := strconv.Atoi(r.URL.Query().Get("page"))
    pageSize, _ := strconv.Atoi(r.URL.Query().Get("pageSize"))
    if page <= 0 {
        page = 1
    }
    if pageSize <= 0 {
        pageSize = 25
    }

    // Permission checks when auth enabled
    if s.config.Security.AuthMode != "none" {
        secCtx, err := s.getSecurityContext(r)
        if err != nil {
            if secErr, ok := err.(*SecurityError); ok {
                s.writeSecurityError(w, secErr, nil)
            } else {
                http.Error(w, "Security context error", http.StatusInternalServerError)
            }
            return
        }
        // list permission on HPAs
        if namespace != "" {
            if err := s.checkResourcePermission(r.Context(), secCtx, "list", "horizontalpodautoscalers", namespace, "autoscaling"); err != nil {
                if secErr, ok := err.(*SecurityError); ok {
                    s.writeSecurityError(w, secErr, secCtx.User)
                } else {
                    http.Error(w, "Permission check failed", http.StatusInternalServerError)
                }
                return
            }
        } else {
            if err := s.checkResourcePermission(r.Context(), secCtx, "list", "horizontalpodautoscalers", "", "autoscaling"); err != nil {
                if secErr, ok := err.(*SecurityError); ok {
                    s.writeSecurityError(w, secErr, secCtx.User)
                } else {
                    http.Error(w, "Permission check failed", http.StatusInternalServerError)
                }
                return
            }
        }
    }

    // Fetch HPAs via typed client
    var items []autoscalingv2.HorizontalPodAutoscaler
    if namespace != "" {
        list, err := s.kubeClient.AutoscalingV2().HorizontalPodAutoscalers(namespace).List(r.Context(), metav1.ListOptions{})
        if err != nil {
            s.logger.Error("Failed to list HPAs", zap.Error(err))
            http.Error(w, "Failed to list HPAs", http.StatusInternalServerError)
            return
        }
        items = list.Items
    } else {
        list, err := s.kubeClient.AutoscalingV2().HorizontalPodAutoscalers("").List(r.Context(), metav1.ListOptions{})
        if err != nil {
            s.logger.Error("Failed to list HPAs", zap.Error(err))
            http.Error(w, "Failed to list HPAs", http.StatusInternalServerError)
            return
        }
        items = list.Items
    }

    totalBeforeFilter := len(items)

    // Transform to DTO and filter
    views := make([]dto.HPAView, 0, len(items))
    for i := range items {
        hpa := &items[i]
        view := s.hpaToView(hpa)

        // Filter by target
        if targetKind != "" && !strings.EqualFold(view.TargetKind, targetKind) {
            continue
        }
        if targetName != "" && view.TargetName != targetName {
            continue
        }
        if search != "" {
            q := strings.ToLower(search)
            if !strings.Contains(strings.ToLower(view.Name), q) &&
                !strings.Contains(strings.ToLower(view.Namespace), q) &&
                !strings.Contains(strings.ToLower(view.TargetName), q) &&
                !strings.Contains(strings.ToLower(view.TargetKind), q) {
                continue
            }
        }

        // Derived status filter
        if statusFilter != "" {
            st := deriveHPAStatus(view)
            if st != statusFilter {
                continue
            }
        }

        views = append(views, view)
    }

    // Sort if requested
    if sortField != "" {
        sort.Slice(views, func(i, j int) bool {
            less := false
            switch sortField {
            case "name":
                less = views[i].Name < views[j].Name
            case "namespace":
                less = views[i].Namespace < views[j].Namespace
            case "desiredReplicas":
                less = views[i].DesiredReplicas < views[j].DesiredReplicas
            case "currentReplicas":
                less = views[i].CurrentReplicas < views[j].CurrentReplicas
            case "maxReplicas":
                less = views[i].MaxReplicas < views[j].MaxReplicas
            default:
                less = views[i].Name < views[j].Name
            }
            if sortOrder == "desc" {
                return !less
            }
            return less
        })
    }

    // Pagination
    start := (page - 1) * pageSize
    if start > len(views) {
        start = len(views)
    }
    end := start + pageSize
    if end > len(views) {
        end = len(views)
    }
    paged := views[start:end]

    // Build response consistent with other list handlers
    response := map[string]interface{}{
        "data": map[string]interface{}{
            "items":    paged,
            "page":     page,
            "pageSize": pageSize,
            "total":    totalBeforeFilter,
        },
        "status": "success",
    }

    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(http.StatusOK)
    json.NewEncoder(w).Encode(response)
}

func (s *Server) hpaToView(hpa *autoscalingv2.HorizontalPodAutoscaler) dto.HPAView {
    view := dto.HPAView{
        Namespace:       hpa.Namespace,
        Name:            hpa.Name,
        TargetKind:      hpa.Spec.ScaleTargetRef.Kind,
        TargetName:      hpa.Spec.ScaleTargetRef.Name,
        MinReplicas:     hpa.Spec.MinReplicas,
        MaxReplicas:     hpa.Spec.MaxReplicas,
        DesiredReplicas: hpa.Status.DesiredReplicas,
        CurrentReplicas: hpa.Status.CurrentReplicas,
        LastScaleTime:   nil,
        Signals:         dto.HPASignals{},
    }
    if hpa.Status.LastScaleTime != nil {
        t := hpa.Status.LastScaleTime.Time
        view.LastScaleTime = &t
    }
    // Primary metric (first metric in spec if present)
    if len(hpa.Spec.Metrics) > 0 {
        pm := primaryMetricFromSpec(hpa.Spec.Metrics[0])
        view.PrimaryMetric = pm
    }
    // Conditions
    conds := make([]dto.HPACondition, 0, len(hpa.Status.Conditions))
    limited := false
    for _, c := range hpa.Status.Conditions {
        conds = append(conds, dto.HPACondition{
            Type:               string(c.Type),
            Status:             string(c.Status),
            Reason:             c.Reason,
            Message:            c.Message,
            LastTransitionTime: c.LastTransitionTime.Format(time.RFC3339),
        })
        if c.Type == autoscalingv2.ScalingLimited && c.Status == corev1.ConditionTrue {
            limited = true
        }
    }
    view.Conditions = conds
    // Signals
    atMax := view.DesiredReplicas == view.MaxReplicas
    view.Signals = dto.HPASignals{
        AtMax:       atMax,
        Limited:     limited,
        ThrashScore: 0, // TODO: derive from timeseries scale events
    }
    return view
}

func primaryMetricFromSpec(metric autoscalingv2.MetricSpec) *dto.PrimaryMetric {
    pm := dto.PrimaryMetric{Type: string(metric.Type)}
    switch metric.Type {
    case autoscalingv2.ResourceMetricSourceType:
        if metric.Resource != nil {
            rn := string(metric.Resource.Name)
            pm.ResourceName = &rn
            if metric.Resource.Target.AverageUtilization != nil {
                pm.TargetDesc = "avg " + strconv.Itoa(int(*metric.Resource.Target.AverageUtilization)) + "%"
            } else if metric.Resource.Target.Value != nil {
                pm.TargetDesc = metric.Resource.Target.Value.String()
            } else if metric.Resource.Target.AverageValue != nil {
                pm.TargetDesc = "avg " + metric.Resource.Target.AverageValue.String()
            }
        }
    case autoscalingv2.PodsMetricSourceType:
        if metric.Pods != nil {
            if metric.Pods.Target.AverageValue != nil {
                pm.TargetDesc = "avg " + metric.Pods.Target.AverageValue.String()
            }
        }
    case autoscalingv2.ExternalMetricSourceType:
        if metric.External != nil {
            if metric.External.Target.Value != nil {
                pm.TargetDesc = metric.External.Target.Value.String()
            } else if metric.External.Target.AverageValue != nil {
                pm.TargetDesc = "avg " + metric.External.Target.AverageValue.String()
            }
        }
    case autoscalingv2.ContainerResourceMetricSourceType:
        if metric.ContainerResource != nil {
            rn := string(metric.ContainerResource.Name)
            pm.ResourceName = &rn
            if metric.ContainerResource.Target.AverageUtilization != nil {
                pm.TargetDesc = "avg " + strconv.Itoa(int(*metric.ContainerResource.Target.AverageUtilization)) + "%"
            } else if metric.ContainerResource.Target.AverageValue != nil {
                pm.TargetDesc = "avg " + metric.ContainerResource.Target.AverageValue.String()
            }
        }
    }
    return &pm
}

func deriveHPAStatus(v dto.HPAView) string {
    if v.Signals.AtMax {
        return "atMax"
    }
    if v.Signals.Limited {
        return "limited"
    }
    if v.DesiredReplicas != v.CurrentReplicas {
        return "active"
    }
    return "none"
}

// HandleHPAsWebSocket upgrades to a WebSocket subscribed to the "hpas" room
func (s *Server) HandleHPAsWebSocket(w http.ResponseWriter, r *http.Request) {
    s.wsHub.ServeWS(w, r, "hpas")
}

// HandleGetHPA returns a single HPA by namespace/name, similar to other Get handlers
func (s *Server) HandleGetHPA(w http.ResponseWriter, r *http.Request) {
    namespace := chi.URLParam(r, "namespace")
    name := chi.URLParam(r, "name")

    if namespace == "" || name == "" {
        w.Header().Set("Content-Type", "application/json")
        w.WriteHeader(http.StatusBadRequest)
        json.NewEncoder(w).Encode(map[string]interface{}{
            "error":  "namespace and name are required",
            "status": "error",
        })
        return
    }

    // Permission checks when auth enabled
    if s.config.Security.AuthMode != "none" {
        secCtx, err := s.getSecurityContext(r)
        if err != nil {
            if secErr, ok := err.(*SecurityError); ok {
                s.writeSecurityError(w, secErr, nil)
            } else {
                http.Error(w, "Security context error", http.StatusInternalServerError)
            }
            return
        }
        if err := s.checkResourcePermission(r.Context(), secCtx, "get", "horizontalpodautoscalers", namespace, "autoscaling"); err != nil {
            if secErr, ok := err.(*SecurityError); ok {
                s.writeSecurityError(w, secErr, secCtx.User)
            } else {
                http.Error(w, "Permission check failed", http.StatusInternalServerError)
            }
            return
        }
    }

    client := s.GetClientWithFallback(r)
    hpa, err := client.AutoscalingV2().HorizontalPodAutoscalers(namespace).Get(r.Context(), name, metav1.GetOptions{})
    if err != nil {
        s.logger.Error("Failed to get HPA",
            zap.String("namespace", namespace),
            zap.String("name", name),
            zap.Error(err))
        w.Header().Set("Content-Type", "application/json")
        w.WriteHeader(http.StatusInternalServerError)
        json.NewEncoder(w).Encode(map[string]interface{}{
            "error":  err.Error(),
            "status": "error",
        })
        return
    }

    view := s.hpaToView(hpa)

    // Include spec/status/metadata for detail view, consistent with workloads get handlers
    fullDetails := map[string]interface{}{
        "summary":    view,
        "spec":       hpa.Spec,
        "status":     hpa.Status,
        "metadata":   hpa.ObjectMeta,
        "kind":       "HorizontalPodAutoscaler",
        "apiVersion": "autoscaling/v2",
    }

    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(http.StatusOK)
    json.NewEncoder(w).Encode(map[string]interface{}{
        "data":   fullDetails,
        "status": "success",
    })
}

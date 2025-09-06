package informers

import (
    "time"

    "github.com/aaronlmathis/kaptn/internal/k8s/ws"
    "github.com/aaronlmathis/kaptn/internal/metrics"
    "github.com/aaronlmathis/kaptn/internal/timeseries"
    "go.uber.org/zap"
    autoscalingv2 "k8s.io/api/autoscaling/v2"
)

// HPAEventHandler handles HPA events and broadcasts them via WebSocket and appends timeseries
type HPAEventHandler struct {
    logger *zap.Logger
    hub    *ws.Hub
    store  timeseries.Store
}

func NewHPAEventHandler(logger *zap.Logger, hub *ws.Hub, store timeseries.Store) *HPAEventHandler {
    return &HPAEventHandler{ logger: logger, hub: hub, store: store }
}

func (h *HPAEventHandler) OnAdd(obj interface{}, isInInitialList bool) {
    hpa, ok := obj.(*autoscalingv2.HorizontalPodAutoscaler)
    if !ok { return }
    payload := h.hpaToSummary(hpa)
    h.hub.BroadcastToRoom("overview", "hpa_added", payload)
    h.hub.BroadcastToRoom("hpas", "hpa_added", payload)
    h.appendHPATimeseries(nil, hpa)
    metrics.RecordHPAEvent("add")
    metrics.IncHPACached()
}

func (h *HPAEventHandler) OnUpdate(oldObj, newObj interface{}) {
    oldHPA, _ := oldObj.(*autoscalingv2.HorizontalPodAutoscaler)
    newHPA, ok := newObj.(*autoscalingv2.HorizontalPodAutoscaler)
    if !ok { return }
    payload := h.hpaToSummary(newHPA)
    h.hub.BroadcastToRoom("overview", "hpa_updated", payload)
    h.hub.BroadcastToRoom("hpas", "hpa_updated", payload)
    h.appendHPATimeseries(oldHPA, newHPA)
    metrics.RecordHPAEvent("update")
}

func (h *HPAEventHandler) OnDelete(obj interface{}) {
    hpa, ok := obj.(*autoscalingv2.HorizontalPodAutoscaler)
    if !ok { return }
    deletion := map[string]string{ "name": hpa.Name, "namespace": hpa.Namespace }
    h.hub.BroadcastToRoom("overview", "hpa_deleted", deletion)
    h.hub.BroadcastToRoom("hpas", "hpa_deleted", deletion)
    metrics.RecordHPAEvent("delete")
    metrics.DecHPACached()
}

func (h *HPAEventHandler) hpaToSummary(hpa *autoscalingv2.HorizontalPodAutoscaler) map[string]interface{} {
    atMax := hpa.Status.DesiredReplicas == hpa.Spec.MaxReplicas
    limited := false
    for _, c := range hpa.Status.Conditions {
        if c.Type == autoscalingv2.ScalingLimited && string(c.Status) == "True" {
            limited = true
            break
        }
    }
    var lastScale *time.Time
    if hpa.Status.LastScaleTime != nil { t := hpa.Status.LastScaleTime.Time; lastScale = &t }
    return map[string]interface{}{
        "name":            hpa.Name,
        "namespace":       hpa.Namespace,
        "targetKind":      hpa.Spec.ScaleTargetRef.Kind,
        "targetName":      hpa.Spec.ScaleTargetRef.Name,
        "minReplicas":     hpa.Spec.MinReplicas,
        "maxReplicas":     hpa.Spec.MaxReplicas,
        "desiredReplicas": hpa.Status.DesiredReplicas,
        "currentReplicas": hpa.Status.CurrentReplicas,
        "lastScaleTime":   lastScale,
        "signals": map[string]interface{}{
            "atMax": atMax,
            "limited": limited,
        },
    }
}

func (h *HPAEventHandler) appendHPATimeseries(oldHPA, newHPA *autoscalingv2.HorizontalPodAutoscaler) {
    if h.store == nil || newHPA == nil { return }
    ns, name := newHPA.Namespace, newHPA.Name
    now := time.Now()

    // Replicas series
    desiredKey := timeseries.GeneratePodSeriesKey(timeseries.HPADesiredReplicasBase, ns, name)
    if s := h.store.Upsert(desiredKey); s != nil { s.Add(timeseries.NewPointWithEntity(now, float64(newHPA.Status.DesiredReplicas), map[string]string{"namespace": ns, "hpa": name})) }
    currentKey := timeseries.GeneratePodSeriesKey(timeseries.HPACurrentReplicasBase, ns, name)
    if s := h.store.Upsert(currentKey); s != nil { s.Add(timeseries.NewPointWithEntity(now, float64(newHPA.Status.CurrentReplicas), map[string]string{"namespace": ns, "hpa": name})) }

    // Scale event
    var prevDesired int32
    if oldHPA != nil { prevDesired = oldHPA.Status.DesiredReplicas }
    delta := int(newHPA.Status.DesiredReplicas) - int(prevDesired)
    if delta != 0 {
        if delta > 0 {
            upKey := timeseries.GeneratePodSeriesKey(timeseries.HPAScaleEventsUpBase, ns, name)
            if s := h.store.Upsert(upKey); s != nil { s.Add(timeseries.NewPointWithEntity(now, float64(delta), map[string]string{"namespace": ns, "hpa": name})) }
        } else {
            downKey := timeseries.GeneratePodSeriesKey(timeseries.HPAScaleEventsDownBase, ns, name)
            if s := h.store.Upsert(downKey); s != nil { s.Add(timeseries.NewPointWithEntity(now, float64(-delta), map[string]string{"namespace": ns, "hpa": name})) }
        }
    }
}

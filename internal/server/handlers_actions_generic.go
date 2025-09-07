package server

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	dto "github.com/aaronlmathis/kaptn/internal/api/v1/dto"
	"github.com/aaronlmathis/kaptn/internal/k8s"
	"github.com/aaronlmathis/kaptn/internal/k8s/actions"
	"github.com/go-chi/chi/v5/middleware"
	yaml "gopkg.in/yaml.v3"
	policyv1 "k8s.io/api/policy/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/discovery/cached/memory"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/restmapper"
)

// HandleExecuteActions implements POST /api/v1/actions (generic endpoint)
func (s *Server) HandleExecuteActions(w http.ResponseWriter, r *http.Request) {
	reqID := middleware.GetReqID(r.Context())
	user, ok := getUserFromContext(r.Context())
	if !ok || user == nil {
		http.Error(w, "Authentication required", http.StatusUnauthorized)
		return
	}
	clients, err := s.GetImpersonatedClients(r)
	if err != nil {
		http.Error(w, "Failed to get user permissions", http.StatusInternalServerError)
		return
	}

	var req dto.GenericActionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	if req.RequestID == "" {
		req.RequestID = reqID
	}

	// Validate
	if strings.TrimSpace(req.Action) == "" {
		http.Error(w, "action is required", http.StatusBadRequest)
		return
	}
	if len(req.Resources) == 0 && req.Selector == nil {
		http.Error(w, "either resources or selector is required", http.StatusBadRequest)
		return
	}

	// Expand selector into resources
	targets, err := s.resolveTargets(r.Context(), clients, req.Resources, req.Selector)
	if err != nil {
		http.Error(w, fmt.Sprintf("failed to resolve targets: %v", err), http.StatusBadRequest)
		return
	}
	// Empty after resolution
	if len(targets) == 0 {
		writeJSON(w, http.StatusOK, dto.GenericActionResponse{RequestID: req.RequestID, Action: req.Action, DryRun: req.DryRun, Results: []dto.ItemResult{}})
		return
	}

	// Concurrency clamp
	conc := req.Concurrency
	if conc <= 0 {
		conc = s.config.Actions.DefaultConcurrency
	}
	if conc > s.config.Actions.MaxConcurrency {
		conc = s.config.Actions.MaxConcurrency
	}

	// Build worker pool
	type job struct{ ref dto.ObjectRef }
	jobs := make(chan job)
	results := make(chan dto.ItemResult, len(targets))

	worker := func() {
		for j := range jobs {
			res := s.executeOneAction(r.Context(), clients, user.Email, user.Groups, req, j.ref, false)
			results <- res
		}
	}
	for i := 0; i < conc; i++ {
		go worker()
	}
	go func() {
		for _, t := range targets {
			jobs <- job{ref: t}
		}
		close(jobs)
	}()

	out := make([]dto.ItemResult, 0, len(targets))
	for range targets {
		out = append(out, <-results)
	}

	resp := dto.GenericActionResponse{
		RequestID: req.RequestID,
		Action:    req.Action,
		DryRun:    req.DryRun,
		Results:   out,
		Summary:   summarize(out),
	}
	writeJSON(w, http.StatusOK, resp)
}

// HandleValidateGenericActions performs validation of an action request using dry-run and safety checks
func (s *Server) HandleValidateGenericActions(w http.ResponseWriter, r *http.Request) {
	reqID := middleware.GetReqID(r.Context())
	user, ok := getUserFromContext(r.Context())
	if !ok || user == nil {
		http.Error(w, "Authentication required", http.StatusUnauthorized)
		return
	}
	clients, err := s.GetImpersonatedClients(r)
	if err != nil {
		http.Error(w, "Failed to get user permissions", http.StatusInternalServerError)
		return
	}

	var req dto.GenericActionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	if req.RequestID == "" {
		req.RequestID = reqID
	}
	req.DryRun = true

	if strings.TrimSpace(req.Action) == "" {
		http.Error(w, "action is required", http.StatusBadRequest)
		return
	}
	if len(req.Resources) == 0 && req.Selector == nil {
		http.Error(w, "either resources or selector is required", http.StatusBadRequest)
		return
	}

	targets, err := s.resolveTargets(r.Context(), clients, req.Resources, req.Selector)
	if err != nil {
		http.Error(w, fmt.Sprintf("failed to resolve targets: %v", err), http.StatusBadRequest)
		return
	}

	conc := req.Concurrency
	if conc <= 0 {
		conc = s.config.Actions.DefaultConcurrency
	}
	if conc > s.config.Actions.MaxConcurrency {
		conc = s.config.Actions.MaxConcurrency
	}

	type job struct{ ref dto.ObjectRef }
	jobs := make(chan job)
	results := make(chan dto.ItemResult, len(targets))
	worker := func() {
		for j := range jobs {
			res := s.executeOneAction(r.Context(), clients, user.Email, user.Groups, req, j.ref, true)
			results <- res
		}
	}
	for i := 0; i < conc; i++ {
		go worker()
	}
	go func() {
		for _, t := range targets {
			jobs <- job{ref: t}
		}
		close(jobs)
	}()

	out := make([]dto.ItemResult, 0, len(targets))
	for range targets {
		out = append(out, <-results)
	}

	// Param validation
	paramErrs := validateParams(req)
	resp := dto.GenericActionResponse{RequestID: req.RequestID, Action: req.Action, DryRun: true, Results: out, Summary: summarize(out), ParamErrors: paramErrs}
	writeJSON(w, http.StatusOK, resp)
}

func ternary[T any](cond bool, a, b T) T {
	if cond {
		return a
	}
	return b
}

func summarize(results []dto.ItemResult) *dto.Summary {
	s := &dto.Summary{Total: len(results)}
	for _, r := range results {
		switch strings.ToLower(r.Status) {
		case "ok":
			s.OK++
		case "skipped":
			s.Skipped++
		default:
			s.Error++
		}
	}
	return s
}

func validateParams(req dto.GenericActionRequest) []dto.ParamError {
	errs := []dto.ParamError{}
	a := strings.ToLower(req.Action)
	switch a {
	case "patch":
		if _, ok := req.Params["patch"]; !ok {
			errs = append(errs, dto.ParamError{Field: "params.patch", Message: "required"})
		}
		if pt, ok := req.Params["patchType"].(string); ok {
			switch strings.ToLower(pt) {
			case "merge", "strategic", "json":
			default:
				errs = append(errs, dto.ParamError{Field: "params.patchType", Message: "must be merge|strategic|json"})
			}
		}
	case "scale":
		if _, ok := req.Params["replicas"]; !ok {
			errs = append(errs, dto.ParamError{Field: "params.replicas", Message: "required"})
		}
	case "delete":
		// optional: propagationPolicy, gracePeriodSeconds; no strict errors
	case "evict":
		// no params
	case "export-yaml":
		// no params
	}
	return errs
}

// resolveTargets combines explicit refs and selector results; returns de-duplicated refs.
func (s *Server) resolveTargets(ctx context.Context, clients *k8s.ImpersonatedClients, refs []dto.ObjectRef, sel *dto.Selector) ([]dto.ObjectRef, error) {
	dedup := map[string]dto.ObjectRef{}
	key := func(r dto.ObjectRef) string {
		return r.APIVersion + "|" + strings.ToLower(r.Kind) + "|" + r.Namespace + "|" + r.Name
	}
	for _, r := range refs {
		dedup[key(r)] = r
	}
	if sel != nil {
		// Map GVK -> GVR
		mapper := restmapper.NewDeferredDiscoveryRESTMapper(memory.NewMemCacheClient(clients.Discovery))
		gvk := schema.FromAPIVersionAndKind(sel.APIVersion, sel.Kind)
		m, err := mapper.RESTMapping(gvk.GroupKind(), gvk.Version)
		if err != nil {
			return nil, err
		}
		var nri dynamic.NamespaceableResourceInterface = clients.Dynamic.Resource(m.Resource)
		var ri dynamic.ResourceInterface
		if m.Scope.Name() == "namespace" {
			ns := sel.Namespace
			if ns == "" {
				ns = "default"
			}
			ri = nri.Namespace(ns)
		} else {
			ri = nri
		}
		list, err := ri.List(ctx, metav1.ListOptions{LabelSelector: sel.LabelSelector, FieldSelector: sel.FieldSelector})
		if err != nil {
			return nil, err
		}
		for _, u := range list.Items {
			r := dto.ObjectRef{APIVersion: u.GetAPIVersion(), Kind: u.GetKind(), Namespace: u.GetNamespace(), Name: u.GetName()}
			dedup[key(r)] = r
		}
	}
	out := make([]dto.ObjectRef, 0, len(dedup))
	for _, r := range dedup {
		out = append(out, r)
	}
	return out, nil
}

// executeOneAction maps a generic action to the coordinator or typed executors and returns per-item result
func (s *Server) executeOneAction(ctx context.Context, clients *k8s.ImpersonatedClients, user string, groups []string, req dto.GenericActionRequest, ref dto.ObjectRef, validateOnly bool) dto.ItemResult {
	// Prefetch UID/RV (best effort)
	uid, rv := s.tryGetMeta(ctx, clients, ref)

	res := dto.ItemResult{Ref: ref, UID: uid, ResourceVersion: rv, Warnings: []string{}}

	// Convenience: annotate/label -> synthesize merge patch
	if strings.ToLower(req.Action) == "annotate" {
		ann, _ := req.Params["annotations"].(map[string]interface{})
		if ann == nil {
			return dto.ItemResult{Ref: ref, Status: "error", HTTPStatus: http.StatusBadRequest, Message: "params.annotations must be object"}
		}
		req.Action = "patch"
		req.Params["patchType"] = "merge"
		req.Params["patch"] = map[string]interface{}{"metadata": map[string]interface{}{"annotations": ann}}
	}
	if strings.ToLower(req.Action) == "label" {
		lab, _ := req.Params["labels"].(map[string]interface{})
		if lab == nil {
			return dto.ItemResult{Ref: ref, Status: "error", HTTPStatus: http.StatusBadRequest, Message: "params.labels must be object"}
		}
		req.Action = "patch"
		req.Params["patchType"] = "merge"
		req.Params["patch"] = map[string]interface{}{"metadata": map[string]interface{}{"labels": lab}}
	}

	// Handle generic patch here (dynamic) rather than coordinator
	if strings.ToLower(req.Action) == "patch" {
		// Resolve mapping to get group/resource
		mapper := restmapper.NewDeferredDiscoveryRESTMapper(memory.NewMemCacheClient(clients.Discovery))
		gvk := schema.FromAPIVersionAndKind(ref.APIVersion, ref.Kind)
		m, err := mapper.RESTMapping(gvk.GroupKind(), gvk.Version)
		if err != nil {
			return dto.ItemResult{Ref: ref, Status: "error", HTTPStatus: http.StatusBadRequest, Message: err.Error()}
		}
		// RBAC: patch permission on resource
		if ok, _ := s.impersonationMgr.SSARHelper().CanPerformAction(ctx, clients.Client(), "patch", m.Resource.Group, m.Resource.Resource, ref.Namespace, ref.Name); !ok {
			return dto.ItemResult{Ref: ref, Status: "error", HTTPStatus: http.StatusForbidden, Message: "RBAC: patch denied"}
		}
		// Determine patch type
		ptStr, _ := req.Params["patchType"].(string)
		var pt types.PatchType
		switch strings.ToLower(ptStr) {
		case "strategic":
			pt = types.StrategicMergePatchType
		case "json":
			pt = types.JSONPatchType
		default:
			pt = types.MergePatchType
		}
		// Marshal patch body
		patchBody := req.Params["patch"]
		patchBytes, err := json.Marshal(patchBody)
		if err != nil {
			return dto.ItemResult{Ref: ref, Status: "error", HTTPStatus: http.StatusBadRequest, Message: fmt.Sprintf("invalid patch body: %v", err)}
		}
		// Map GVK -> GVR and patch
		var nri dynamic.NamespaceableResourceInterface = clients.Dynamic.Resource(m.Resource)
		var ri dynamic.ResourceInterface
		if m.Scope.Name() == "namespace" {
			ns := ref.Namespace
			if ns == "" {
				ns = "default"
			}
			ri = nri.Namespace(ns)
		} else {
			ri = nri
		}
		po := metav1.PatchOptions{}
		if req.DryRun {
			po.DryRun = []string{"All"}
		}
		_, err = ri.Patch(ctx, ref.Name, pt, patchBytes, po)
		if err != nil {
			return dto.ItemResult{Ref: ref, Status: "error", HTTPStatus: statusFromError(err), Message: err.Error()}
		}
		return dto.ItemResult{Ref: ref, Status: "ok", HTTPStatus: http.StatusOK, Message: "Patched"}
	}

	// Handle generic delete via dynamic client
	if strings.ToLower(req.Action) == "delete" {
		// Safety pre-validation
		mapper := restmapper.NewDeferredDiscoveryRESTMapper(memory.NewMemCacheClient(clients.Discovery))
		gvk := schema.FromAPIVersionAndKind(ref.APIVersion, ref.Kind)
		m, err := mapper.RESTMapping(gvk.GroupKind(), gvk.Version)
		if err != nil {
			return dto.ItemResult{Ref: ref, Status: "error", HTTPStatus: http.StatusBadRequest, Message: err.Error()}
		}
		if s.actionCoordinator != nil {
			if sr, err := s.actionCoordinator.ValidateSafetyForAction(ctx, clients.Client(), "delete", "delete", m.Resource.Resource, ref.Namespace, ref.Name); err == nil && sr != nil {
				if !sr.Allowed {
					return dto.ItemResult{Ref: ref, Status: "skipped", HTTPStatus: 428, Message: "Safety validation failed for delete", Warnings: sr.Warnings}
				}
			}
		}
		// RBAC: delete permission
		if ok, _ := s.impersonationMgr.SSARHelper().CanPerformAction(ctx, clients.Client(), "delete", m.Resource.Group, m.Resource.Resource, ref.Namespace, ref.Name); !ok {
			return dto.ItemResult{Ref: ref, Status: "error", HTTPStatus: http.StatusForbidden, Message: "RBAC: delete denied"}
		}
		var nri dynamic.NamespaceableResourceInterface = clients.Dynamic.Resource(m.Resource)
		var ri dynamic.ResourceInterface
		if m.Scope.Name() == "namespace" {
			ns := ref.Namespace
			if ns == "" {
				ns = "default"
			}
			ri = nri.Namespace(ns)
		} else {
			ri = nri
		}
		// options
		do := metav1.DeleteOptions{}
		if v, ok := req.Params["propagationPolicy"].(string); ok {
			switch strings.ToLower(v) {
			case "foreground":
				p := metav1.DeletePropagationForeground
				do.PropagationPolicy = &p
			case "background":
				p := metav1.DeletePropagationBackground
				do.PropagationPolicy = &p
			case "orphan":
				p := metav1.DeletePropagationOrphan
				do.PropagationPolicy = &p
			}
		}
		if v, ok := req.Params["gracePeriodSeconds"]; ok {
			switch t := v.(type) {
			case float64:
				x := int64(t)
				do.GracePeriodSeconds = &x
			case int:
				x := int64(t)
				do.GracePeriodSeconds = &x
			case int64:
				x := t
				do.GracePeriodSeconds = &x
			}
		}
		if req.DryRun || validateOnly {
			do.DryRun = []string{"All"}
		}
		if err := ri.Delete(ctx, ref.Name, do); err != nil {
			return dto.ItemResult{Ref: ref, Status: "error", HTTPStatus: statusFromError(err), Message: err.Error()}
		}
		if validateOnly {
			return dto.ItemResult{Ref: ref, Status: "ok", HTTPStatus: http.StatusOK, Message: "Delete validated"}
		}
		return dto.ItemResult{Ref: ref, Status: "ok", HTTPStatus: http.StatusOK, Message: "Deleted"}
	}

	// Handle generic scale via /scale subresource
	if strings.ToLower(req.Action) == "scale" {
		// RBAC: update on subresource scale
		resPlural := toPluralResource(strings.ToLower(ref.Kind))
		if ok, _ := s.impersonationMgr.SSARHelper().CanPerformActionWithSubresource(ctx, clients.Client(), "update", "", resPlural, "scale", ref.Namespace, ref.Name); !ok {
			return dto.ItemResult{Ref: ref, Status: "error", HTTPStatus: http.StatusForbidden, Message: "RBAC: scale denied"}
		}
		replicasRaw, ok := req.Params["replicas"]
		if !ok {
			return dto.ItemResult{Ref: ref, Status: "error", HTTPStatus: http.StatusBadRequest, Message: "missing params.replicas"}
		}
		var replicas int64
		switch v := replicasRaw.(type) {
		case float64:
			replicas = int64(v)
		case int:
			replicas = int64(v)
		case int32:
			replicas = int64(v)
		case int64:
			replicas = v
		default:
			return dto.ItemResult{Ref: ref, Status: "error", HTTPStatus: http.StatusBadRequest, Message: "invalid replicas type"}
		}
		mapper := restmapper.NewDeferredDiscoveryRESTMapper(memory.NewMemCacheClient(clients.Discovery))
		gvk := schema.FromAPIVersionAndKind(ref.APIVersion, ref.Kind)
		m, err := mapper.RESTMapping(gvk.GroupKind(), gvk.Version)
		if err != nil {
			return dto.ItemResult{Ref: ref, Status: "error", HTTPStatus: http.StatusBadRequest, Message: err.Error()}
		}
		var nri dynamic.NamespaceableResourceInterface = clients.Dynamic.Resource(m.Resource)
		var ri dynamic.ResourceInterface
		ns := ref.Namespace
		if m.Scope.Name() == "namespace" {
			if ns == "" {
				ns = "default"
			}
			ri = nri.Namespace(ns)
		} else {
			ri = nri
		}
		// Optionally verify subresource exists by Get("scale")
		if _, err := ri.Get(ctx, ref.Name, metav1.GetOptions{}, "scale"); err != nil {
			return dto.ItemResult{Ref: ref, Status: "error", HTTPStatus: statusFromError(err), Message: fmt.Sprintf("scale subresource: %v", err)}
		}
		scaleObj := map[string]interface{}{
			"apiVersion": "autoscaling/v1",
			"kind":       "Scale",
			"metadata":   map[string]interface{}{"name": ref.Name, "namespace": ns},
			"spec":       map[string]interface{}{"replicas": replicas},
		}
		if !validateOnly {
			u := &unstructured.Unstructured{Object: scaleObj}
			uo := metav1.UpdateOptions{}
			if req.DryRun {
				uo.DryRun = []string{"All"}
			}
			if _, err := ri.Update(ctx, u, uo, "scale"); err != nil {
				return dto.ItemResult{Ref: ref, Status: "error", HTTPStatus: statusFromError(err), Message: err.Error()}
			}
		}
		return dto.ItemResult{Ref: ref, Status: "ok", HTTPStatus: http.StatusOK, Message: fmt.Sprintf("Scale validated and %s to %d", ternary(validateOnly, "ready", "applied"), replicas)}
	}

	// Export YAML per item
	if strings.ToLower(req.Action) == "export-yaml" {
		// RBAC: get permission
		if ok, _ := s.impersonationMgr.SSARHelper().CanPerformAction(ctx, clients.Client(), "get", "", toPluralResource(strings.ToLower(ref.Kind)), ref.Namespace, ref.Name); !ok {
			return dto.ItemResult{Ref: ref, Status: "error", HTTPStatus: http.StatusForbidden, Message: "RBAC: get denied"}
		}
		mapper := restmapper.NewDeferredDiscoveryRESTMapper(memory.NewMemCacheClient(clients.Discovery))
		gvk := schema.FromAPIVersionAndKind(ref.APIVersion, ref.Kind)
		m, err := mapper.RESTMapping(gvk.GroupKind(), gvk.Version)
		if err != nil {
			return dto.ItemResult{Ref: ref, Status: "error", HTTPStatus: http.StatusBadRequest, Message: err.Error()}
		}
		var nri dynamic.NamespaceableResourceInterface = clients.Dynamic.Resource(m.Resource)
		var ri dynamic.ResourceInterface
		ns := ref.Namespace
		if m.Scope.Name() == "namespace" {
			if ns == "" {
				ns = "default"
			}
			ri = nri.Namespace(ns)
		} else {
			ri = nri
		}
		u, err := ri.Get(ctx, ref.Name, metav1.GetOptions{})
		if err != nil {
			return dto.ItemResult{Ref: ref, Status: "error", HTTPStatus: statusFromError(err), Message: err.Error()}
		}
		item := dto.ItemResult{Ref: ref, Status: "ok", HTTPStatus: http.StatusOK, Message: "Exported"}
		if !validateOnly {
			if yb, err := yaml.Marshal(u.Object); err == nil {
				item.YAML = string(yb)
			}
		} else {
			item.Message = "Validated"
		}
		return item
	}

	// Map generic action to coordinator action/resource/verb
	coordAction, resourcePlural, verb, ok := mapGenericToCoordinator(req.Action, ref.Kind)
	if !ok {
		res.Status = "skipped"
		res.HTTPStatus = http.StatusNotImplemented
		res.Message = fmt.Sprintf("action %q unsupported for kind %s", req.Action, ref.Kind)
		return res
	}

	// Evict pod is special (use Eviction subresource)
	if strings.ToLower(req.Action) == "evict" && strings.EqualFold(ref.Kind, "Pod") {
		// Safety pre-validation
		if s.actionCoordinator != nil {
			if sr, err := s.actionCoordinator.ValidateSafetyForAction(ctx, clients.Client(), "evict", "delete", "pods", ref.Namespace, ref.Name); err == nil && sr != nil {
				if !sr.Allowed {
					return dto.ItemResult{Ref: ref, Status: "skipped", HTTPStatus: 428, Message: "Safety validation failed for eviction", Warnings: sr.Warnings}
				}
			}
		}
		if validateOnly {
			// Attempt dry-run eviction to check feasibility
			if err := s.evictPod(ctx, clients, ref, true); err != nil {
				return dto.ItemResult{Ref: ref, Status: "error", HTTPStatus: statusFromError(err), Message: err.Error()}
			}
			return dto.ItemResult{Ref: ref, Status: "ok", HTTPStatus: http.StatusOK, Message: "Eviction validated"}
		}
		err := s.evictPod(ctx, clients, ref, req.DryRun)
		if err != nil {
			res.Status = "error"
			res.HTTPStatus = statusFromError(err)
			res.Message = err.Error()
			return res
		}
		res.Status = "ok"
		res.HTTPStatus = http.StatusOK
		res.Message = "Evicted"
		return res
	}

	// Build single-target ActionRequest for coordinator
	ar := &actions.ActionRequest{
		ID:           fmt.Sprintf("%s:%s/%s", req.RequestID, ref.Namespace, ref.Name),
		Action:       coordAction,
		Verb:         verb,
		Resource:     resourcePlural,
		Targets:      []actions.TargetResource{{Namespace: ref.Namespace, Name: ref.Name}},
		Params:       req.Params,
		DryRun:       req.DryRun,
		Timeout:      30 * time.Second,
		User:         user,
		UserGroups:   groups,
		ForceConfirm: false,
		Metadata:     map[string]string{"request_id": req.RequestID, "source": "generic_actions"},
		Concurrency:  1,
	}

	// Check if action coordinator is available
	if s.actionCoordinator == nil {
		res.Status = "error"
		res.HTTPStatus = http.StatusServiceUnavailable
		res.Message = "Action coordinator not available"
		return res
	}

	result, err := s.actionCoordinator.ExecuteAction(ctx, ar, clients.Client())
	if err != nil {
		res.Status = "error"
		res.HTTPStatus = statusFromError(err)
		res.Message = err.Error()
		if result != nil && result.SafetyResult != nil {
			res.Warnings = append(res.Warnings, result.SafetyResult.Warnings...)
		}
		return res
	}
	res.Status = "ok"
	res.HTTPStatus = http.StatusOK
	res.Message = result.Message
	if result != nil && result.SafetyResult != nil {
		res.Warnings = append(res.Warnings, result.SafetyResult.Warnings...)
	}
	return res
}

func (s *Server) tryGetMeta(ctx context.Context, clients *k8s.ImpersonatedClients, ref dto.ObjectRef) (string, string) {
	mapper := restmapper.NewDeferredDiscoveryRESTMapper(memory.NewMemCacheClient(clients.Discovery))
	gvk := schema.FromAPIVersionAndKind(ref.APIVersion, ref.Kind)
	m, err := mapper.RESTMapping(gvk.GroupKind(), gvk.Version)
	if err != nil {
		return "", ""
	}
	var nri dynamic.NamespaceableResourceInterface = clients.Dynamic.Resource(m.Resource)
	var ri dynamic.ResourceInterface
	if m.Scope.Name() == "namespace" {
		ns := ref.Namespace
		if ns == "" {
			ns = "default"
		}
		ri = nri.Namespace(ns)
	} else {
		ri = nri
	}
	u, err := ri.Get(ctx, ref.Name, metav1.GetOptions{})
	if err != nil {
		return "", ""
	}
	return string(u.GetUID()), u.GetResourceVersion()
}

// evictPod uses policy/v1 Eviction subresource.
func (s *Server) evictPod(ctx context.Context, clients *k8s.ImpersonatedClients, ref dto.ObjectRef, dryRun bool) error {
	ev := &policyv1.Eviction{ObjectMeta: metav1.ObjectMeta{Name: ref.Name, Namespace: ref.Namespace}}
	if dryRun {
		ev.DeleteOptions = &metav1.DeleteOptions{DryRun: []string{"All"}}
	}
	return clients.Clientset.PolicyV1().Evictions(ref.Namespace).Evict(ctx, ev)
}

// mapGenericToCoordinator maps a generic action + Kind to coordinator action, resource (plural), and verb
func mapGenericToCoordinator(action, kind string) (string, string, string, bool) {
	k := strings.ToLower(kind)
	a := strings.ToLower(action)
	plural := toPluralResource(k)
	switch a {
	case "delete":
		return "delete-" + plural, plural, "delete", true
	case "restart":
		switch k {
		case "pod", "pods":
			return "restart-pods", "pods", "delete", true
		case "deployment", "deployments":
			return "restart-deployments", "deployments", "update", true
		case "daemonset", "daemonsets":
			return "restart-daemonsets", "daemonsets", "update", true
		case "statefulset", "statefulsets":
			return "restart-statefulsets", "statefulsets", "update", true
		}
		return "", "", "", false
	case "scale":
		switch k {
		case "deployment", "deployments":
			return "scale-deployments", "deployments", "update", true
		case "statefulset", "statefulsets":
			return "scale-statefulsets", "statefulsets", "update", true
		}
		return "", "", "", false
	case "suspend":
		if k == "cronjob" || k == "cronjobs" {
			return "suspend-cronjobs", "cronjobs", "update", true
		}
		return "", "", "", false
	case "resume":
		if k == "cronjob" || k == "cronjobs" {
			return "resume-cronjobs", "cronjobs", "update", true
		}
		return "", "", "", false
	case "cordon":
		if k == "node" || k == "nodes" {
			return "cordon-nodes", "nodes", "patch", true
		}
		return "", "", "", false
	case "uncordon":
		if k == "node" || k == "nodes" {
			return "uncordon-nodes", "nodes", "patch", true
		}
		return "", "", "", false
	case "drain":
		if k == "node" || k == "nodes" {
			return "drain-nodes", "nodes", "patch", true
		}
		return "", "", "", false
	case "export-yaml":
		return "export-yaml", plural, "get", true
	case "evict":
		if k == "pod" || k == "pods" {
			return "evict-pods", "pods", "delete", true
		}
		return "", "", "", false
	default:
		return "", "", "", false
	}
}

func toPluralResource(kindLower string) string {
	switch kindLower {
	case "pod":
		return "pods"
	case "pods":
		return "pods"
	case "deployment":
		return "deployments"
	case "deployments":
		return "deployments"
	case "daemonset":
		return "daemonsets"
	case "daemonsets":
		return "daemonsets"
	case "statefulset":
		return "statefulsets"
	case "statefulsets":
		return "statefulsets"
	case "service":
		return "services"
	case "services":
		return "services"
	case "configmap":
		return "configmaps"
	case "configmaps":
		return "configmaps"
	case "secret":
		return "secrets"
	case "secrets":
		return "secrets"
	case "cronjob":
		return "cronjobs"
	case "cronjobs":
		return "cronjobs"
	default:
		// Fallback naive pluralization
		if strings.HasSuffix(kindLower, "s") {
			return kindLower
		}
		return kindLower + "s"
	}
}

func statusFromError(err error) int {
	if err == nil {
		return http.StatusOK
	}
	s := err.Error()
	switch {
	case strings.Contains(s, "forbidden"), strings.Contains(s, "RBAC permission denied"):
		return http.StatusForbidden
	case strings.Contains(s, "not found"):
		return http.StatusNotFound
	default:
		return http.StatusBadRequest
	}
}

func writeJSON(w http.ResponseWriter, code int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

# Backend API Refactoring Plan

## Overview

This document provides a step-by-step plan to refactor the `internal/api` package from its current state (66+ handler files in a single package) to a clean, domain-driven architecture. Each step is designed to be small enough for a coding agent's context window and maintains backward compatibility.

**Critical Constraint**: Frontend must continue working unchanged throughout the refactoring.

## Pre-Refactoring Assessment

- **Current State**: 66+ handler files, 29 dependencies in Server struct, 200+ routes in single function
- **Key Problems**: parseAction in wrong location, scattered DTOs, duplicated security code, god object Server
- **Target**: Domain-driven architecture with clear boundaries, testable code, reduced duplication

## Phase 1: Foundation - Extract Utilities and Common Code

### Step 1: Create Utilities Package Structure
**Goal**: Eliminate duplicated pagination, validation, and security code across 50+ handlers

1. Create directory structure:
   ```
   internal/api/utils/
   ```

2. Create `internal/api/utils/pagination.go`:
   ```go
   package utils
   
   import "strconv"
   
   type PaginationParams struct {
       Page     int
       PageSize int
       Offset   int
   }
   
   func ParsePaginationParams(pageStr, pageSizeStr string) PaginationParams {
       page, _ := strconv.Atoi(pageStr)
       pageSize, _ := strconv.Atoi(pageSizeStr)
       
       if pageSize <= 0 {
           pageSize = 25
       }
       if page <= 0 {
           page = 1
       }
       
       offset := (page - 1) * pageSize
       
       return PaginationParams{
           Page:     page,
           PageSize: pageSize,
           Offset:   offset,
       }
   }
   ```

### Step 2: Create Common Request Parsing Utilities
**Goal**: Extract repeated query parameter parsing logic

1. Create `internal/api/utils/request.go`:
   ```go
   package utils
   
   import "net/http"
   
   type ListRequestParams struct {
       Namespace string
       Search    string
       Pagination PaginationParams
   }
   
   func ParseListRequestParams(r *http.Request) ListRequestParams {
       namespace := r.URL.Query().Get("namespace")
       search := r.URL.Query().Get("search")
       pageStr := r.URL.Query().Get("page")
       pageSizeStr := r.URL.Query().Get("pageSize")
       
       return ListRequestParams{
           Namespace:  namespace,
           Search:     search,
           Pagination: ParsePaginationParams(pageStr, pageSizeStr),
       }
   }
   ```

### Step 3: Extract Security Utilities
**Goal**: Centralize security helpers from `handlers_common.go`

1. Create `internal/api/utils/security.go`:
   ```go
   package utils
   
   import (
       "context"
       "net/http"
       
       "github.com/aaronlmathis/kaptn/internal/auth"
       "github.com/aaronlmathis/kaptn/internal/k8s"
       "go.uber.org/zap"
       "k8s.io/client-go/kubernetes"
   )
   
   type SecurityContext struct {
       User           *auth.User
       Client         kubernetes.Interface
       SSARHelper     *k8s.SSARHelper
       Logger         *zap.Logger
       RequestContext string
   }
   
   type SecurityError struct {
       Code    string
       Message string
       Status  int
   }
   
   func (e *SecurityError) Error() string {
       return e.Message
   }
   ```

2. Move `getSecurityContext`, `checkResourcePermission`, and `writeSecurityError` functions from `handlers_common.go` to `utils/security.go`

### Step 4: Update First Handler to Use New Utilities
**Goal**: Prove the utilities work before mass migration

1. Update `handlers_workloads.go` function `handleListPods` to use new utilities:
   - Replace manual pagination parsing with `utils.ParseListRequestParams(r)`
   - Replace manual security context extraction with utility functions
   - Test that pods listing still works

### Step 5: Create Error Handling Utilities
**Goal**: Standardize error responses across all handlers

1. Create `internal/api/utils/errors.go`:
   ```go
   package utils
   
   import (
       "encoding/json"
       "net/http"
       
       "go.uber.org/zap"
   )
   
   func WriteErrorResponse(w http.ResponseWriter, logger *zap.Logger, status int, message string, err error) {
       if err != nil {
           logger.Error(message, zap.Error(err))
       }
       
       w.Header().Set("Content-Type", "application/json")
       w.WriteHeader(status)
       json.NewEncoder(w).Encode(map[string]interface{}{
           "error":  message,
           "status": "error",
       })
   }
   
   func WriteSuccessResponse(w http.ResponseWriter, data interface{}) {
       w.Header().Set("Content-Type", "application/json")
       w.WriteHeader(http.StatusOK)
       json.NewEncoder(w).Encode(map[string]interface{}{
           "data":   data,
           "status": "success",
       })
   }
   ```

## Phase 2: Extract DTOs and Centralize Type Definitions

### Step 6: Create DTO Package Structure
**Goal**: Address scattered type definitions across handler files

1. Create directory structure:
   ```
   internal/api/v1/dto/
   ```

### Step 7: Extract Common DTOs
**Goal**: Create shared request/response types

1. Create `internal/api/v1/dto/common.go`:
   ```go
   package dto
   
   type PaginationRequest struct {
       Page     int `json:"page"`
       PageSize int `json:"pageSize"`
   }
   
   type PaginationResponse struct {
       Page       int `json:"page"`
       PageSize   int `json:"pageSize"`
       Total      int `json:"total"`
       TotalPages int `json:"totalPages"`
   }
   
   type ListResponse struct {
       Data       interface{}        `json:"data"`
       Pagination PaginationResponse `json:"pagination"`
       Status     string            `json:"status"`
   }
   ```

### Step 8: Extract Bulk Action DTOs from handlers_actions_pods.go
**Goal**: Fix the scattered BulkActionRequest definition issue

1. Create `internal/api/v1/dto/actions.go`:
   ```go
   package dto
   
   type BulkActionRequest struct {
       Action     string   `json:"action"`
       Targets    []Target `json:"targets"`
       Options    map[string]interface{} `json:"options,omitempty"`
       DryRun     bool     `json:"dryRun,omitempty"`
       Force      bool     `json:"force,omitempty"`
   }
   
   type Target struct {
       Namespace string `json:"namespace"`
       Name      string `json:"name"`
   }
   
   type BulkActionResponse struct {
       Success bool                    `json:"success"`
       Results []ActionResult          `json:"results"`
       Errors  []string               `json:"errors,omitempty"`
       Summary ActionSummary          `json:"summary"`
   }
   
   type ActionResult struct {
       Target    Target `json:"target"`
       Success   bool   `json:"success"`
       Message   string `json:"message,omitempty"`
       Error     string `json:"error,omitempty"`
   }
   
   type ActionSummary struct {
       Total     int `json:"total"`
       Succeeded int `json:"succeeded"`
       Failed    int `json:"failed"`
   }
   ```

2. Update `handlers_actions_pods.go`:
   - Remove `BulkActionRequest` type definition
   - Add import: `"github.com/aaronlmathis/kaptn/internal/api/v1/dto"`
   - Replace `BulkActionRequest` with `dto.BulkActionRequest`

### Step 9: Extract Secret DTOs from handlers_secrets.go
**Goal**: Centralize secret-related type definitions

1. Create `internal/api/v1/dto/secrets.go`:
   ```go
   package dto
   
   type SecretCreateRequest struct {
       Name        string            `json:"name"`
       Namespace   string            `json:"namespace"`
       Type        string            `json:"type"`
       Data        map[string]string `json:"data"`
       Labels      map[string]string `json:"labels,omitempty"`
       Annotations map[string]string `json:"annotations,omitempty"`
   }
   
   type SecretUpdateRequest struct {
       Data        map[string]string `json:"data"`
       Labels      map[string]string `json:"labels,omitempty"`
       Annotations map[string]string `json:"annotations,omitempty"`
   }
   ```

2. Update `handlers_secrets.go`:
   - Remove `SecretCreateRequest` and `SecretUpdateRequest` type definitions
   - Add import for dto package
   - Replace with `dto.SecretCreateRequest` and `dto.SecretUpdateRequest`

### Step 10: Extract Apply Configuration DTOs from handlers_actions.go
**Goal**: Move ApplyConfigRequest to shared location

1. Add to `internal/api/v1/dto/actions.go`:
   ```go
   type ApplyConfigRequest struct {
       YAMLContent  string       `json:"yamlContent"`
       Files        []FileUpload `json:"files,omitempty"`
       Namespace    string       `json:"namespace,omitempty"`
       DryRun       bool         `json:"dryRun,omitempty"`
       Force        bool         `json:"force,omitempty"`
       Validate     bool         `json:"validate"`
       ShowDiff     bool         `json:"showDiff"`
       ServerSide   bool         `json:"serverSide"`
   }
   
   type FileUpload struct {
       Name    string `json:"name"`
       Content string `json:"content"`
   }
   ```

2. Update `handlers_actions.go`:
   - Remove `ApplyConfigRequest` and `FileUpload` type definitions
   - Replace with dto package imports

## Phase 3: Fix parseAction Misplacement Issue

### Step 11: Create Actions Package Structure
**Goal**: Address the critical parseAction function misplacement

1. Create directory structure:
   ```
   internal/api/v1/actions/
   ```

### Step 12: Create Action Parser in Correct Location
**Goal**: Move parseAction from handlers_actions_pods.go to proper location

1. Create `internal/api/v1/actions/parser.go`:
   ```go
   package actions
   
   type ActionParser interface {
       ParseAction(action string) (resource, verb string)
   }
   
   type DefaultActionParser struct{}
   
   func NewActionParser() ActionParser {
       return &DefaultActionParser{}
   }
   
   func (p *DefaultActionParser) ParseAction(action string) (resource, verb string) {
       switch action {
       case "restart-pods", "delete-pods", "get-logs", "describe-pods", "export-yaml":
           return parsePodsAction(action)
       case "restart-deployments", "scale-deployments", "delete-deployments":
           return parseDeploymentsAction(action)
       case "delete-services", "export-services":
           return parseServicesAction(action)
       case "delete-configmaps", "export-configmaps":
           return parseConfigMapsAction(action)
       case "view-secrets", "delete-secrets", "export-secrets":
           return parseSecretsAction(action)
       default:
           return "unknown", "unknown"
       }
   }
   
   func parsePodsAction(action string) (string, string) {
       switch action {
       case "restart-pods":
           return "pods", "update"
       case "delete-pods":
           return "pods", "delete"
       case "get-logs", "describe-pods", "export-yaml":
           return "pods", "get"
       default:
           return "unknown", "unknown"
       }
   }
   
   func parseDeploymentsAction(action string) (string, string) {
       switch action {
       case "restart-deployments":
           return "deployments", "update"
       case "scale-deployments":
           return "deployments", "update"
       case "delete-deployments":
           return "deployments", "delete"
       default:
           return "unknown", "unknown"
       }
   }
   
   func parseServicesAction(action string) (string, string) {
       switch action {
       case "delete-services":
           return "services", "delete"
       case "export-services":
           return "services", "get"
       default:
           return "unknown", "unknown"
       }
   }
   
   func parseConfigMapsAction(action string) (string, string) {
       switch action {
       case "delete-configmaps":
           return "configmaps", "delete"
       case "export-configmaps":
           return "configmaps", "get"
       default:
           return "unknown", "unknown"
       }
   }
   
   func parseSecretsAction(action string) (string, string) {
       switch action {
       case "view-secrets":
           return "secrets", "get"
       case "delete-secrets":
           return "secrets", "delete"
       case "export-secrets":
           return "secrets", "get"
       default:
           return "unknown", "unknown"
       }
   }
   ```

### Step 13: Update handlers_actions_pods.go to Use New Parser
**Goal**: Remove parseAction from pods file and use centralized parser

1. Update `handlers_actions_pods.go`:
   - Remove the `parseAction` function entirely
   - Add import: `"github.com/aaronlmathis/kaptn/internal/api/v1/actions"`
   - In `handlePodsBulkAction` function, replace:
     ```go
     resource, verb := parseAction(req.Action)
     ```
     with:
     ```go
     parser := actions.NewActionParser()
     resource, verb := parser.ParseAction(req.Action)
     ```

2. Test that pod bulk actions still work correctly

### Step 14: Update Other Action Handlers to Use New Parser
**Goal**: Ensure all action handlers use the centralized parser

1. Update `handlers_actions_common.go`, `handlers_actions_stubs.go`:
   - Replace any calls to `parseAction` with the new parser
   - Add necessary imports

## Phase 4: Extract Middleware and Security Logic

### Step 15: Create Middleware Package Structure
**Goal**: Centralize repeated security and request processing logic

1. Create directory structure:
   ```
   internal/api/middleware/
   ```

### Step 16: Extract Permission Checking Middleware
**Goal**: Eliminate duplicated SSAR checks across 100+ handlers

1. Create `internal/api/middleware/permissions.go`:
   ```go
   package middleware
   
   import (
       "context"
       "net/http"
       
       "github.com/aaronlmathis/kaptn/internal/api/utils"
       "github.com/aaronlmathis/kaptn/internal/auth"
       "github.com/aaronlmathis/kaptn/internal/config"
       "github.com/aaronlmathis/kaptn/internal/k8s"
       "go.uber.org/zap"
   )
   
   type PermissionMiddleware struct {
       logger           *zap.Logger
       config           *config.Config
       impersonationMgr *k8s.ImpersonationManager
   }
   
   func NewPermissionMiddleware(logger *zap.Logger, config *config.Config, impMgr *k8s.ImpersonationManager) *PermissionMiddleware {
       return &PermissionMiddleware{
           logger:           logger,
           config:           config,
           impersonationMgr: impMgr,
       }
   }
   
   type ResourcePermission struct {
       Verb      string
       Resource  string
       Namespace string
       Name      string
   }
   
   func (m *PermissionMiddleware) RequirePermission(perm ResourcePermission) func(http.Handler) http.Handler {
       return func(next http.Handler) http.Handler {
           return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
               if m.config.Security.AuthMode == "none" {
                   next.ServeHTTP(w, r)
                   return
               }
               
               // Extract security context using utilities
               secCtx, err := utils.GetSecurityContext(r, m.impersonationMgr, m.logger)
               if err != nil {
                   if secErr, ok := err.(*utils.SecurityError); ok {
                       utils.WriteSecurityError(w, secErr, nil)
                   } else {
                       utils.WriteErrorResponse(w, m.logger, http.StatusInternalServerError, "Security context error", err)
                   }
                   return
               }
               
               // Check permissions
               if err := utils.CheckResourcePermission(r.Context(), secCtx, perm.Verb, perm.Resource, perm.Namespace, perm.Name); err != nil {
                   if secErr, ok := err.(*utils.SecurityError); ok {
                       utils.WriteSecurityError(w, secErr, secCtx.User)
                   } else {
                       utils.WriteErrorResponse(w, m.logger, http.StatusInternalServerError, "Permission check failed", err)
                   }
                   return
               }
               
               // Add security context to request context
               ctx := context.WithValue(r.Context(), "security_context", secCtx)
               next.ServeHTTP(w, r.WithContext(ctx))
           })
       }
   }
   ```

2. Move `getSecurityContext`, `checkResourcePermission` functions from `handlers_common.go` to `utils/security.go` if not done already

### Step 17: Create Request Processing Middleware
**Goal**: Centralize common request parsing and validation

1. Create `internal/api/middleware/request.go`:
   ```go
   package middleware
   
   import (
       "context"
       "net/http"
       
       "github.com/aaronlmathis/kaptn/internal/api/utils"
   )
   
   func ParseListParams(next http.Handler) http.Handler {
       return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
           params := utils.ParseListRequestParams(r)
           ctx := context.WithValue(r.Context(), "list_params", params)
           next.ServeHTTP(w, r.WithContext(ctx))
       })
   }
   ```

### Step 18: Update One Handler to Use New Middleware
**Goal**: Test middleware integration before mass adoption

1. Update Server struct in `server.go` to include middleware:
   ```go
   type Server struct {
       // ...existing fields...
       permissionMiddleware *middleware.PermissionMiddleware
   }
   ```

2. Initialize middleware in `NewServer`:
   ```go
   s.permissionMiddleware = middleware.NewPermissionMiddleware(logger, cfg, s.impersonationMgr)
   ```

3. Update one route (e.g., pods listing) to use the new middleware instead of inline security checks

## Phase 5: Create Service Layer to Break Up God Object

### Step 19: Create Service Package Structure
**Goal**: Extract business logic from handlers and reduce Server struct dependencies

1. Create directory structure:
   ```
   internal/services/
   internal/services/workloads/
   internal/services/actions/
   internal/services/auth/
   ```

### Step 20: Extract Workloads Service
**Goal**: Reduce Server struct dependencies by extracting workload logic

1. Create `internal/services/workloads/interface.go`:
   ```go
   package workloads
   
   import (
       "context"
       
       "github.com/aaronlmathis/kaptn/internal/api/utils"
       corev1 "k8s.io/api/core/v1"
       "k8s.io/client-go/kubernetes"
   )
   
   type Service interface {
       ListPods(ctx context.Context, client kubernetes.Interface, params utils.ListRequestParams) (*corev1.PodList, error)
       GetPod(ctx context.Context, client kubernetes.Interface, namespace, name string) (*corev1.Pod, error)
   }
   ```

2. Create `internal/services/workloads/pods.go`:
   ```go
   package workloads
   
   import (
       "context"
       "strings"
       
       "github.com/aaronlmathis/kaptn/internal/api/utils"
       "go.uber.org/zap"
       corev1 "k8s.io/api/core/v1"
       metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
       "k8s.io/client-go/kubernetes"
   )
   
   type service struct {
       logger *zap.Logger
   }
   
   func NewService(logger *zap.Logger) Service {
       return &service{
           logger: logger,
       }
   }
   
   func (s *service) ListPods(ctx context.Context, client kubernetes.Interface, params utils.ListRequestParams) (*corev1.PodList, error) {
       listOptions := metav1.ListOptions{}
       
       if params.Namespace == "" || params.Namespace == "all" {
           pods, err := client.CoreV1().Pods("").List(ctx, listOptions)
           if err != nil {
               return nil, err
           }
           
           // Apply search filtering
           if params.Search != "" {
               filteredPods := &corev1.PodList{
                   Items: make([]corev1.Pod, 0),
               }
               for _, pod := range pods.Items {
                   if s.matchesSearch(pod, params.Search) {
                       filteredPods.Items = append(filteredPods.Items, pod)
                   }
               }
               return filteredPods, nil
           }
           
           return pods, nil
       }
       
       return client.CoreV1().Pods(params.Namespace).List(ctx, listOptions)
   }
   
   func (s *service) GetPod(ctx context.Context, client kubernetes.Interface, namespace, name string) (*corev1.Pod, error) {
       return client.CoreV1().Pods(namespace).Get(ctx, name, metav1.GetOptions{})
   }
   
   func (s *service) matchesSearch(pod corev1.Pod, search string) bool {
       search = strings.ToLower(search)
       return strings.Contains(strings.ToLower(pod.Name), search) ||
              strings.Contains(strings.ToLower(pod.Namespace), search) ||
              strings.Contains(strings.ToLower(string(pod.Status.Phase)), search)
   }
   ```

### Step 21: Update Handler to Use Workloads Service
**Goal**: Demonstrate service layer integration and reduce handler complexity

1. Update Server struct in `server.go`:
   ```go
   type Server struct {
       // ...existing fields...
       workloadsService workloads.Service
   }
   ```

2. Initialize service in `NewServer`:
   ```go
   s.workloadsService = workloads.NewService(logger)
   ```

3. Update `handleListPods` in `handlers_workloads.go`:
   - Extract business logic into service calls
   - Reduce function size from ~200 lines to ~50 lines
   - Keep only HTTP-specific concerns in handler

### Step 22: Extract Actions Service
**Goal**: Centralize action coordination logic

1. Create `internal/services/actions/interface.go`:
   ```go
   package actions
   
   import (
       "context"
       
       "github.com/aaronlmathis/kaptn/internal/api/v1/dto"
       "k8s.io/client-go/kubernetes"
   )
   
   type Service interface {
       ExecuteBulkAction(ctx context.Context, client kubernetes.Interface, req dto.BulkActionRequest) (*dto.BulkActionResponse, error)
       ValidateAction(ctx context.Context, action string, targets []dto.Target) error
   }
   ```

2. Create `internal/services/actions/coordinator.go`:
   ```go
   package actions
   
   import (
       "context"
       
       "github.com/aaronlmathis/kaptn/internal/api/v1/actions"
       "github.com/aaronlmathis/kaptn/internal/api/v1/dto"
       "go.uber.org/zap"
       "k8s.io/client-go/kubernetes"
   )
   
   type service struct {
       logger *zap.Logger
       parser actions.ActionParser
   }
   
   func NewService(logger *zap.Logger) Service {
       return &service{
           logger: logger,
           parser: actions.NewActionParser(),
       }
   }
   
   func (s *service) ExecuteBulkAction(ctx context.Context, client kubernetes.Interface, req dto.BulkActionRequest) (*dto.BulkActionResponse, error) {
       resource, verb := s.parser.ParseAction(req.Action)
       
       // Implementation extracted from handlers
       results := make([]dto.ActionResult, 0, len(req.Targets))
       
       // Execute action logic here
       
       return &dto.BulkActionResponse{
           Success: true,
           Results: results,
           Summary: dto.ActionSummary{
               Total:     len(req.Targets),
               Succeeded: len(results),
               Failed:    0,
           },
       }, nil
   }
   
   func (s *service) ValidateAction(ctx context.Context, action string, targets []dto.Target) error {
       resource, verb := s.parser.ParseAction(action)
       if resource == "unknown" || verb == "unknown" {
           return fmt.Errorf("unknown action: %s", action)
       }
       return nil
   }
   ```

## Phase 6: Split Response Formatters

### Step 23: Create Formatters Package Structure
**Goal**: Address the 1000+ line response_formatters.go file

1. Create directory structure:
   ```
   internal/api/v1/formatters/
   ```

### Step 24: Extract Pod Formatters
**Goal**: Split pod formatting logic from mixed file

1. Create `internal/api/v1/formatters/workloads.go`:
   ```go
   package formatters
   
   import (
       corev1 "k8s.io/api/core/v1"
   )
   
   type PodSummary struct {
       Name      string `json:"name"`
       Namespace string `json:"namespace"`
       Phase     string `json:"phase"`
       Ready     string `json:"ready"`
       Restarts  int32  `json:"restarts"`
       Age       string `json:"age"`
       Node      string `json:"node,omitempty"`
   }
   
   func PodToSummary(pod *corev1.Pod) PodSummary {
       // Extract logic from response_formatters.go
       return PodSummary{
           Name:      pod.Name,
           Namespace: pod.Namespace,
           Phase:     string(pod.Status.Phase),
           // ... other fields
       }
   }
   ```

2. Move relevant functions from `response_formatters.go`:
   - `podToSummary` → `formatters.PodToSummary`
   - `enhancedPodToSummary` → `formatters.EnhancedPodToSummary`
   - Related helper functions

### Step 25: Extract Service Formatters
**Goal**: Continue splitting response_formatters.go

1. Create `internal/api/v1/formatters/networking.go`:
   - Move service-related formatting functions
   - Move ingress-related formatting functions

2. Update handlers to use new formatters instead of Server methods

### Step 26: Extract Storage Formatters
**Goal**: Split storage-related formatting

1. Create `internal/api/v1/formatters/storage.go`:
   - Move PV, PVC, StorageClass formatting functions

2. Create `internal/api/v1/formatters/config.go`:
   - Move ConfigMap, Secret formatting functions

## Phase 7: Reorganize Handlers by Domain

### Step 27: Create Handler Domain Structure
**Goal**: Split handlers into logical domains

1. Create directory structure:
   ```
   internal/api/v1/handlers/
   internal/api/v1/handlers/workloads/
   internal/api/v1/handlers/actions/
   internal/api/v1/handlers/auth/
   internal/api/v1/handlers/storage/
   internal/api/v1/handlers/networking/
   ```

### Step 28: Extract Pod Handlers
**Goal**: Split pod-related handlers from handlers_workloads.go

1. Create `internal/api/v1/handlers/workloads/pods.go`:
   ```go
   package workloads
   
   import (
       "net/http"
       
       "github.com/aaronlmathis/kaptn/internal/api/utils"
       "github.com/aaronlmathis/kaptn/internal/api/v1/formatters"
       "github.com/aaronlmathis/kaptn/internal/services/workloads"
       "github.com/go-chi/chi/v5"
       "go.uber.org/zap"
   )
   
   type PodsHandler struct {
       logger  *zap.Logger
       service workloads.Service
   }
   
   func NewPodsHandler(logger *zap.Logger, service workloads.Service) *PodsHandler {
       return &PodsHandler{
           logger:  logger,
           service: service,
       }
   }
   
   func (h *PodsHandler) HandleListPods(w http.ResponseWriter, r *http.Request) {
       // Extract handleListPods logic from handlers_workloads.go
       // Use service layer and formatters
   }
   
   func (h *PodsHandler) HandleGetPod(w http.ResponseWriter, r *http.Request) {
       // Extract handleGetPod logic from handlers_workloads.go
   }
   ```

2. Move functions from `handlers_workloads.go`:
   - `handleListPods` → `PodsHandler.HandleListPods`
   - `handleGetPod` → `PodsHandler.HandleGetPod`

### Step 29: Extract Actions Handlers
**Goal**: Consolidate action handlers in proper domain

1. Create `internal/api/v1/handlers/actions/bulk.go`:
   ```go
   package actions
   
   import (
       "encoding/json"
       "net/http"
       
       "github.com/aaronlmathis/kaptn/internal/api/v1/dto"
       "github.com/aaronlmathis/kaptn/internal/services/actions"
       "go.uber.org/zap"
   )
   
   type BulkHandler struct {
       logger  *zap.Logger
       service actions.Service
   }
   
   func NewBulkHandler(logger *zap.Logger, service actions.Service) *BulkHandler {
       return &BulkHandler{
           logger:  logger,
           service: service,
       }
   }
   
   func (h *BulkHandler) HandlePodsBulkAction(w http.ResponseWriter, r *http.Request) {
       var req dto.BulkActionRequest
       if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
           utils.WriteErrorResponse(w, h.logger, http.StatusBadRequest, "Invalid request body", err)
           return
       }
       
       // Get security context from middleware
       secCtx := r.Context().Value("security_context").(*utils.SecurityContext)
       
       result, err := h.service.ExecuteBulkAction(r.Context(), secCtx.Client, req)
       if err != nil {
           utils.WriteErrorResponse(w, h.logger, http.StatusInternalServerError, "Action failed", err)
           return
       }
       
       utils.WriteSuccessResponse(w, result)
   }
   ```

2. Move action handlers from scattered files:
   - `handlePodsBulkAction` from `handlers_actions_pods.go`
   - `handleValidateAction` from `handlers_actions_common.go`
   - Stub handlers from `handlers_actions_stubs.go`

### Step 30: Create Domain Route Configuration
**Goal**: Split the massive route configuration function

1. Create `internal/api/routes/workloads.go`:
   ```go
   package routes
   
   import (
       "github.com/aaronlmathis/kaptn/internal/api/middleware"
       "github.com/aaronlmathis/kaptn/internal/api/v1/handlers/workloads"
       "github.com/go-chi/chi/v5"
   )
   
   func RegisterWorkloadsRoutes(r chi.Router, handlers *workloads.Handlers, permMW *middleware.PermissionMiddleware) {
       r.Route("/pods", func(r chi.Router) {
           r.Use(permMW.RequirePermission(middleware.ResourcePermission{
               Verb:     "list",
               Resource: "pods",
           }))
           r.Get("/", handlers.Pods.HandleListPods)
           
           r.Route("/{namespace}/{name}", func(r chi.Router) {
               r.Use(permMW.RequirePermission(middleware.ResourcePermission{
                   Verb:     "get",
                   Resource: "pods",
               }))
               r.Get("/", handlers.Pods.HandleGetPod)
           })
       })
       
       // Other workload routes...
   }
   ```

2. Create similar route files for other domains:
   - `routes/actions.go`
   - `routes/auth.go`
   - `routes/storage.go`

### Step 31: Update Main Router Configuration
**Goal**: Clean up the massive setupRoutes function

1. Update `server.go` to use domain route modules:
   ```go
   func (s *Server) setupRoutes() {
       // ... middleware setup ...
       
       s.router.Route("/api/v1", func(r chi.Router) {
           // Auth routes
           routes.RegisterAuthRoutes(r, s.authHandlers, s.permissionMiddleware)
           
           // Workloads routes
           routes.RegisterWorkloadsRoutes(r, s.workloadsHandlers, s.permissionMiddleware)
           
           // Actions routes
           routes.RegisterActionsRoutes(r, s.actionsHandlers, s.permissionMiddleware)
           
           // Storage routes
           routes.RegisterStorageRoutes(r, s.storageHandlers, s.permissionMiddleware)
       })
   }
   ```

## Phase 8: Final Cleanup and Optimization

### Step 32: Remove Unused Code
**Goal**: Clean up after migration

1. Delete empty or mostly empty original handler files:
   - Remove functions that have been moved to domain handlers
   - Keep only functions that haven't been migrated yet

2. Update imports across the codebase:
   - Remove imports to old locations
   - Add imports to new domain packages

### Step 33: Update Server Struct Dependencies
**Goal**: Finalize the god object reduction

1. Replace individual service dependencies in Server struct:
   ```go
   type Server struct {
       logger               *zap.Logger
       config               *config.Config
       router               chi.Router
       
       // Kubernetes clients
       kubeClient           kubernetes.Interface
       dynamicClient        dynamic.Interface
       
       // Core services (reduced from 29 to ~8)
       workloadsService     workloads.Service
       actionsService       actions.Service
       authService          auth.Service
       storageService       storage.Service
       
       // Infrastructure
       informerManager      *informers.Manager
       wsHub                *ws.Hub
       middleware           *Middleware
   }
   ```

### Step 34: Comprehensive Testing
**Goal**: Ensure everything still works

1. Test all endpoints that were modified:
   - Pod listing: `GET /api/v1/pods`
   - Pod details: `GET /api/v1/pods/{namespace}/{name}`
   - Bulk actions: `POST /api/v1/actions/pods`
   - Secret operations: `GET /api/v1/secrets`

2. Verify frontend functionality:
   - All pages load correctly
   - Bulk actions work from UI
   - Authentication flows work
   - No broken API calls

### Step 35: Documentation Update
**Goal**: Document the new architecture

1. Update API documentation to reflect new package structure
2. Create developer guide for the new domain-driven architecture
3. Document migration patterns for future development

## Success Criteria

After completing all steps:

✅ **parseAction is in correct location**: `internal/api/v1/actions/parser.go`  
✅ **Server struct reduced**: From 29 dependencies to ~8 domain services  
✅ **Code duplication eliminated**: 1000+ lines of repeated code centralized in utilities  
✅ **DTOs centralized**: All request/response types in `internal/api/v1/dto/`  
✅ **Response formatters organized**: Split by domain instead of 1000+ line file  
✅ **Handlers organized**: Logical domain grouping instead of mixed files  
✅ **Routes organized**: Domain-specific route configuration  
✅ **Frontend unchanged**: All API endpoints work exactly as before  
✅ **Security centralized**: Permission checks handled by middleware  
✅ **Testing enabled**: Service layer can be unit tested with mocks  

## Rollback Plan

If any step breaks functionality:

1. **Immediate rollback**: Revert the specific commit for that step
2. **Identify issue**: Test the specific functionality that broke
3. **Fix forward**: Make minimal fixes to restore functionality
4. **Continue**: Proceed with remaining steps

Each step is designed to be small and reversible, minimizing risk of breaking changes.

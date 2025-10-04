# API Utils Package Documentation

## Overview

The `internal/api/utils` package provides essential utility functions for Kaptn's API layer, implementing common patterns for pagination, filtering, error handling, and request processing. This package ensures consistency across all API endpoints and provides reusable components for handling HTTP requests, parsing parameters, and managing user context.

## Package Architecture

```
internal/api/utils/
├── doc.go           # Package documentation
├── pagination.go    # Pagination utilities and constants
├── filters.go       # Search and filtering utilities
├── errors.go        # Standardized error handling
└── utils.go         # General API utilities (user context, parsing)
```

## Core Components

### 1. Pagination Utilities (`pagination.go`)

Provides standardized pagination handling with configurable limits and defaults.

#### Constants and Configuration
```go
const (
    DefaultPageSize = 25
    MaxPageSize     = 100
    MinPageSize     = 1
    DefaultPage     = 1
)
```

#### PaginationParams Structure
```go
type PaginationParams struct {
    Page     int `json:"page"`
    PageSize int `json:"pageSize"`
    Offset   int `json:"offset"`
    Limit    int `json:"limit"`
}
```

#### Core Pagination Functions

**ParsePaginationParams:**
```go
func ParsePaginationParams(r *http.Request) PaginationParams {
    params := PaginationParams{
        Page:     DefaultPage,
        PageSize: DefaultPageSize,
    }
    
    // Parse page parameter
    if pageStr := r.URL.Query().Get("page"); pageStr != "" {
        if page, err := strconv.Atoi(pageStr); err == nil && page > 0 {
            params.Page = page
        }
    }
    
    // Parse pageSize parameter with bounds checking
    if pageSizeStr := r.URL.Query().Get("pageSize"); pageSizeStr != "" {
        if pageSize, err := strconv.Atoi(pageSizeStr); err == nil {
            if pageSize < MinPageSize {
                params.PageSize = MinPageSize
            } else if pageSize > MaxPageSize {
                params.PageSize = MaxPageSize
            } else {
                params.PageSize = pageSize
            }
        }
    }
    
    // Calculate offset and limit
    params.Offset = (params.Page - 1) * params.PageSize
    params.Limit = params.PageSize
    
    return params
}
```

**ValidatePaginationParams:**
```go
func ValidatePaginationParams(params *PaginationParams) error {
    if params.Page < 1 {
        return fmt.Errorf("page must be greater than 0")
    }
    
    if params.PageSize < MinPageSize || params.PageSize > MaxPageSize {
        return fmt.Errorf("pageSize must be between %d and %d", MinPageSize, MaxPageSize)
    }
    
    return nil
}
```

**CalculatePaginationInfo:**
```go
func CalculatePaginationInfo(totalItems int, params PaginationParams) PaginationInfo {
    totalPages := int(math.Ceil(float64(totalItems) / float64(params.PageSize)))
    
    return PaginationInfo{
        Page:       params.Page,
        PageSize:   params.PageSize,
        Total:      totalItems,
        TotalPages: totalPages,
        HasNext:    params.Page < totalPages,
        HasPrev:    params.Page > 1,
    }
}

type PaginationInfo struct {
    Page       int  `json:"page"`
    PageSize   int  `json:"pageSize"`
    Total      int  `json:"total"`
    TotalPages int  `json:"totalPages"`
    HasNext    bool `json:"hasNext"`
    HasPrev    bool `json:"hasPrev"`
}
```

**ApplyPagination (Generic):**
```go
func ApplyPagination[T any](items []T, params PaginationParams) ([]T, PaginationInfo) {
    total := len(items)
    
    // Calculate pagination info
    info := CalculatePaginationInfo(total, params)
    
    // Apply offset and limit
    start := params.Offset
    end := start + params.PageSize
    
    if start >= total {
        return []T{}, info
    }
    
    if end > total {
        end = total
    }
    
    return items[start:end], info
}
```

### 2. Search and Filtering (`filters.go`)

Implements flexible search and filtering capabilities for API responses.

#### Search Parameters
```go
type SearchParams struct {
    Query      string            `json:"query"`
    Fields     []string          `json:"fields"`
    Filters    map[string]string `json:"filters"`
    CaseSensitive bool           `json:"caseSensitive"`
}
```

#### Core Filtering Functions

**ParseSearchParams:**
```go
func ParseSearchParams(r *http.Request) SearchParams {
    params := SearchParams{
        Filters:       make(map[string]string),
        CaseSensitive: false, // Default to case-insensitive
    }
    
    // Parse query parameter
    params.Query = r.URL.Query().Get("q")
    if params.Query == "" {
        params.Query = r.URL.Query().Get("search")
    }
    
    // Parse fields parameter (comma-separated)
    if fieldsStr := r.URL.Query().Get("fields"); fieldsStr != "" {
        params.Fields = strings.Split(fieldsStr, ",")
    }
    
    // Parse case sensitivity
    if caseSensitiveStr := r.URL.Query().Get("caseSensitive"); caseSensitiveStr != "" {
        params.CaseSensitive = caseSensitiveStr == "true"
    }
    
    // Parse additional filters (prefix: "filter.")
    for key, values := range r.URL.Query() {
        if strings.HasPrefix(key, "filter.") && len(values) > 0 {
            filterKey := strings.TrimPrefix(key, "filter.")
            params.Filters[filterKey] = values[0]
        }
    }
    
    return params
}
```

**ApplyTextSearch:**
```go
func ApplyTextSearch[T any](items []T, searchParams SearchParams, getSearchableText func(T) string) []T {
    if searchParams.Query == "" {
        return items
    }
    
    var filtered []T
    query := searchParams.Query
    if !searchParams.CaseSensitive {
        query = strings.ToLower(query)
    }
    
    for _, item := range items {
        text := getSearchableText(item)
        if !searchParams.CaseSensitive {
            text = strings.ToLower(text)
        }
        
        if strings.Contains(text, query) {
            filtered = append(filtered, item)
        }
    }
    
    return filtered
}
```

**ApplyFieldSearch:**
```go
func ApplyFieldSearch[T any](items []T, searchParams SearchParams, getFieldValue func(T, string) string) []T {
    if searchParams.Query == "" || len(searchParams.Fields) == 0 {
        return items
    }
    
    var filtered []T
    query := searchParams.Query
    if !searchParams.CaseSensitive {
        query = strings.ToLower(query)
    }
    
    for _, item := range items {
        found := false
        for _, field := range searchParams.Fields {
            value := getFieldValue(item, field)
            if !searchParams.CaseSensitive {
                value = strings.ToLower(value)
            }
            
            if strings.Contains(value, query) {
                found = true
                break
            }
        }
        
        if found {
            filtered = append(filtered, item)
        }
    }
    
    return filtered
}
```

**ApplyFilters:**
```go
func ApplyFilters[T any](items []T, searchParams SearchParams, getFieldValue func(T, string) string) []T {
    if len(searchParams.Filters) == 0 {
        return items
    }
    
    var filtered []T
    
    for _, item := range items {
        matches := true
        
        for filterKey, filterValue := range searchParams.Filters {
            itemValue := getFieldValue(item, filterKey)
            
            if !searchParams.CaseSensitive {
                itemValue = strings.ToLower(itemValue)
                filterValue = strings.ToLower(filterValue)
            }
            
            if itemValue != filterValue {
                matches = false
                break
            }
        }
        
        if matches {
            filtered = append(filtered, item)
        }
    }
    
    return filtered
}
```

**Combined Search and Filter:**
```go
func ApplySearchAndFilters[T any](
    items []T,
    searchParams SearchParams,
    getSearchableText func(T) string,
    getFieldValue func(T, string) string,
) []T {
    // Apply text search first
    if searchParams.Query != "" {
        if len(searchParams.Fields) > 0 {
            items = ApplyFieldSearch(items, searchParams, getFieldValue)
        } else {
            items = ApplyTextSearch(items, searchParams, getSearchableText)
        }
    }
    
    // Apply filters
    items = ApplyFilters(items, searchParams, getFieldValue)
    
    return items
}
```

### 3. Error Handling (`errors.go`)

Provides standardized error responses and handling utilities.

#### Error Response Structure
```go
type ErrorResponse struct {
    Status  string `json:"status"`
    Error   string `json:"error"`
    Code    int    `json:"code,omitempty"`
    Details string `json:"details,omitempty"`
}
```

#### Error Types
```go
var (
    ErrInvalidRequest   = errors.New("invalid request")
    ErrUnauthorized     = errors.New("unauthorized")
    ErrForbidden        = errors.New("forbidden")
    ErrNotFound         = errors.New("not found")
    ErrConflict         = errors.New("conflict")
    ErrInternalError    = errors.New("internal server error")
    ErrServiceUnavailable = errors.New("service unavailable")
)
```

#### Error Handling Functions

**WriteErrorResponse:**
```go
func WriteErrorResponse(w http.ResponseWriter, err error, statusCode int, details ...string) {
    errorResponse := ErrorResponse{
        Status: "error",
        Error:  err.Error(),
        Code:   statusCode,
    }
    
    if len(details) > 0 {
        errorResponse.Details = details[0]
    }
    
    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(statusCode)
    json.NewEncoder(w).Encode(errorResponse)
}
```

**WriteValidationError:**
```go
func WriteValidationError(w http.ResponseWriter, message string, field string) {
    details := fmt.Sprintf("Field: %s", field)
    WriteErrorResponse(w, fmt.Errorf("validation error: %s", message), http.StatusBadRequest, details)
}
```

**WriteUnauthorizedError:**
```go
func WriteUnauthorizedError(w http.ResponseWriter, message string) {
    if message == "" {
        message = "Authentication required"
    }
    WriteErrorResponse(w, fmt.Errorf(message), http.StatusUnauthorized)
}
```

**WriteForbiddenError:**
```go
func WriteForbiddenError(w http.ResponseWriter, message string) {
    if message == "" {
        message = "Access denied"
    }
    WriteErrorResponse(w, fmt.Errorf(message), http.StatusForbidden)
}
```

**WriteNotFoundError:**
```go
func WriteNotFoundError(w http.ResponseWriter, resource string) {
    message := "Resource not found"
    if resource != "" {
        message = fmt.Sprintf("%s not found", resource)
    }
    WriteErrorResponse(w, fmt.Errorf(message), http.StatusNotFound)
}
```

**WriteInternalError:**
```go
func WriteInternalError(w http.ResponseWriter, err error) {
    WriteErrorResponse(w, ErrInternalError, http.StatusInternalServerError, err.Error())
}
```

**WriteConflictError:**
```go
func WriteConflictError(w http.ResponseWriter, message string) {
    if message == "" {
        message = "Resource conflict"
    }
    WriteErrorResponse(w, fmt.Errorf(message), http.StatusConflict)
}
```

**HandleError (Generic Error Router):**
```go
func HandleError(w http.ResponseWriter, err error) {
    switch {
    case errors.Is(err, ErrInvalidRequest):
        WriteErrorResponse(w, err, http.StatusBadRequest)
    case errors.Is(err, ErrUnauthorized):
        WriteErrorResponse(w, err, http.StatusUnauthorized)
    case errors.Is(err, ErrForbidden):
        WriteErrorResponse(w, err, http.StatusForbidden)
    case errors.Is(err, ErrNotFound):
        WriteErrorResponse(w, err, http.StatusNotFound)
    case errors.Is(err, ErrConflict):
        WriteErrorResponse(w, err, http.StatusConflict)
    case errors.Is(err, ErrServiceUnavailable):
        WriteErrorResponse(w, err, http.StatusServiceUnavailable)
    default:
        WriteInternalError(w, err)
    }
}
```

### 4. General API Utilities (`utils.go`)

Provides common utilities for request processing and user context handling.

#### User Context Functions

**GetUserFromContext:**
```go
func GetUserFromContext(r *http.Request) (*auth.UserInfo, error) {
    ctx := r.Context()
    user, ok := ctx.Value("user").(*auth.UserInfo)
    if !ok {
        return nil, fmt.Errorf("user not found in context")
    }
    return user, nil
}
```

**GetNamespaceFromContext:**
```go
func GetNamespaceFromContext(r *http.Request) string {
    ctx := r.Context()
    if namespace, ok := ctx.Value("namespace").(string); ok {
        return namespace
    }
    return ""
}
```

**GetRoleFromContext:**
```go
func GetRoleFromContext(r *http.Request) string {
    ctx := r.Context()
    if role, ok := ctx.Value("role").(string); ok {
        return role
    }
    return ""
}
```

#### Parameter Parsing Functions

**ParseStringParam:**
```go
func ParseStringParam(r *http.Request, key string, defaultValue string) string {
    if value := r.URL.Query().Get(key); value != "" {
        return value
    }
    return defaultValue
}
```

**ParseIntParam:**
```go
func ParseIntParam(r *http.Request, key string, defaultValue int) (int, error) {
    if valueStr := r.URL.Query().Get(key); valueStr != "" {
        value, err := strconv.Atoi(valueStr)
        if err != nil {
            return defaultValue, fmt.Errorf("invalid integer parameter %s: %w", key, err)
        }
        return value, nil
    }
    return defaultValue, nil
}
```

**ParseBoolParam:**
```go
func ParseBoolParam(r *http.Request, key string, defaultValue bool) (bool, error) {
    if valueStr := r.URL.Query().Get(key); valueStr != "" {
        value, err := strconv.ParseBool(valueStr)
        if err != nil {
            return defaultValue, fmt.Errorf("invalid boolean parameter %s: %w", key, err)
        }
        return value, nil
    }
    return defaultValue, nil
}
```

**ParseArrayParam:**
```go
func ParseArrayParam(r *http.Request, key string, separator string) []string {
    if value := r.URL.Query().Get(key); value != "" {
        if separator == "" {
            separator = ","
        }
        return strings.Split(value, separator)
    }
    return []string{}
}
```

#### Response Utilities

**WriteJSONResponse:**
```go
func WriteJSONResponse(w http.ResponseWriter, data interface{}) error {
    w.Header().Set("Content-Type", "application/json")
    return json.NewEncoder(w).Encode(data)
}
```

**WriteSuccessResponse:**
```go
func WriteSuccessResponse(w http.ResponseWriter, data interface{}) error {
    response := map[string]interface{}{
        "status": "success",
        "data":   data,
    }
    return WriteJSONResponse(w, response)
}
```

**WritePaginatedResponse:**
```go
func WritePaginatedResponse(w http.ResponseWriter, items interface{}, pagination PaginationInfo) error {
    response := map[string]interface{}{
        "status":     "success",
        "items":      items,
        "page":       pagination.Page,
        "pageSize":   pagination.PageSize,
        "total":      pagination.Total,
        "totalPages": pagination.TotalPages,
        "hasNext":    pagination.HasNext,
        "hasPrev":    pagination.HasPrev,
    }
    return WriteJSONResponse(w, response)
}
```

#### Validation Utilities

**ValidateRequired:**
```go
func ValidateRequired(value interface{}, fieldName string) error {
    switch v := value.(type) {
    case string:
        if strings.TrimSpace(v) == "" {
            return fmt.Errorf("%s is required", fieldName)
        }
    case nil:
        return fmt.Errorf("%s is required", fieldName)
    }
    return nil
}
```

**ValidateEnum:**
```go
func ValidateEnum(value string, validValues []string, fieldName string) error {
    for _, valid := range validValues {
        if value == valid {
            return nil
        }
    }
    return fmt.Errorf("%s must be one of: %s", fieldName, strings.Join(validValues, ", "))
}
```

**ValidateLength:**
```go
func ValidateLength(value string, minLength, maxLength int, fieldName string) error {
    length := len(value)
    if length < minLength {
        return fmt.Errorf("%s must be at least %d characters", fieldName, minLength)
    }
    if maxLength > 0 && length > maxLength {
        return fmt.Errorf("%s must be no more than %d characters", fieldName, maxLength)
    }
    return nil
}
```

#### Request Body Utilities

**ParseJSONBody:**
```go
func ParseJSONBody(r *http.Request, target interface{}) error {
    if r.Body == nil {
        return fmt.Errorf("request body is empty")
    }
    
    decoder := json.NewDecoder(r.Body)
    decoder.DisallowUnknownFields() // Strict parsing
    
    if err := decoder.Decode(target); err != nil {
        return fmt.Errorf("invalid JSON: %w", err)
    }
    
    return nil
}
```

**ParseFormData:**
```go
func ParseFormData(r *http.Request) (map[string]string, error) {
    if err := r.ParseForm(); err != nil {
        return nil, fmt.Errorf("failed to parse form data: %w", err)
    }
    
    data := make(map[string]string)
    for key, values := range r.Form {
        if len(values) > 0 {
            data[key] = values[0] // Take first value
        }
    }
    
    return data, nil
}
```

## Usage Examples

### Complete Handler Example

```go
package handlers

import (
    "net/http"
    "github.com/example/kaptn/internal/api/utils"
)

func ListPodsHandler(w http.ResponseWriter, r *http.Request) {
    // Get user context
    user, err := utils.GetUserFromContext(r)
    if err != nil {
        utils.WriteUnauthorizedError(w, "")
        return
    }
    
    // Parse pagination parameters
    pagination := utils.ParsePaginationParams(r)
    if err := utils.ValidatePaginationParams(&pagination); err != nil {
        utils.WriteValidationError(w, err.Error(), "pagination")
        return
    }
    
    // Parse search parameters
    search := utils.ParseSearchParams(r)
    
    // Parse additional parameters
    namespace := utils.ParseStringParam(r, "namespace", "")
    includeMetrics, err := utils.ParseBoolParam(r, "includeMetrics", false)
    if err != nil {
        utils.WriteValidationError(w, err.Error(), "includeMetrics")
        return
    }
    
    // Get pods from Kubernetes
    pods, err := kubeClient.ListPods(namespace, user.Groups)
    if err != nil {
        utils.WriteInternalError(w, err)
        return
    }
    
    // Apply search and filtering
    filteredPods := utils.ApplySearchAndFilters(
        pods,
        search,
        func(pod Pod) string {
            return pod.Name + " " + pod.Namespace + " " + pod.Status
        },
        func(pod Pod, field string) string {
            switch field {
            case "name":
                return pod.Name
            case "namespace":
                return pod.Namespace
            case "status":
                return pod.Status
            case "node":
                return pod.Node
            default:
                return ""
            }
        },
    )
    
    // Apply pagination
    paginatedPods, paginationInfo := utils.ApplyPagination(filteredPods, pagination)
    
    // Return paginated response
    utils.WritePaginatedResponse(w, paginatedPods, paginationInfo)
}
```

### Error Handling Example

```go
func GetPodHandler(w http.ResponseWriter, r *http.Request) {
    podName := mux.Vars(r)["name"]
    namespace := mux.Vars(r)["namespace"]
    
    // Validate required parameters
    if err := utils.ValidateRequired(podName, "pod name"); err != nil {
        utils.WriteValidationError(w, err.Error(), "name")
        return
    }
    
    if err := utils.ValidateRequired(namespace, "namespace"); err != nil {
        utils.WriteValidationError(w, err.Error(), "namespace")
        return
    }
    
    // Get user context
    user, err := utils.GetUserFromContext(r)
    if err != nil {
        utils.WriteUnauthorizedError(w, "")
        return
    }
    
    // Check permissions
    if !hasPermission(user, "pods", "get", namespace) {
        utils.WriteForbiddenError(w, "Insufficient permissions for pod access")
        return
    }
    
    // Get pod
    pod, err := kubeClient.GetPod(namespace, podName)
    if err != nil {
        if isNotFoundError(err) {
            utils.WriteNotFoundError(w, fmt.Sprintf("Pod %s/%s", namespace, podName))
        } else {
            utils.WriteInternalError(w, err)
        }
        return
    }
    
    // Return success response
    utils.WriteSuccessResponse(w, pod)
}
```

### Search and Filter Example

```go
func SearchResourcesHandler(w http.ResponseWriter, r *http.Request) {
    // Parse search parameters
    search := utils.ParseSearchParams(r)
    
    // Validate search fields
    validFields := []string{"name", "namespace", "type", "status"}
    for _, field := range search.Fields {
        if err := utils.ValidateEnum(field, validFields, "search field"); err != nil {
            utils.WriteValidationError(w, err.Error(), "fields")
            return
        }
    }
    
    // Get all resources
    resources, err := getAllResources()
    if err != nil {
        utils.WriteInternalError(w, err)
        return
    }
    
    // Apply search and filters
    filteredResources := utils.ApplySearchAndFilters(
        resources,
        search,
        func(resource Resource) string {
            return resource.Name + " " + resource.Namespace + " " + resource.Type
        },
        func(resource Resource, field string) string {
            switch field {
            case "name":
                return resource.Name
            case "namespace":
                return resource.Namespace
            case "type":
                return resource.Type
            case "status":
                return resource.Status
            default:
                return ""
            }
        },
    )
    
    // Return results
    utils.WriteSuccessResponse(w, filteredResources)
}
```

## Configuration

### Environment Variables
```go
// Pagination configuration
const (
    EnvDefaultPageSize = "KAPTN_DEFAULT_PAGE_SIZE"
    EnvMaxPageSize     = "KAPTN_MAX_PAGE_SIZE"
)

// Search configuration  
const (
    EnvMaxSearchResults = "KAPTN_MAX_SEARCH_RESULTS"
    EnvSearchTimeout    = "KAPTN_SEARCH_TIMEOUT"
)
```

### Runtime Configuration
```go
type UtilsConfig struct {
    Pagination PaginationConfig `json:"pagination"`
    Search     SearchConfig     `json:"search"`
    Errors     ErrorConfig      `json:"errors"`
}

type PaginationConfig struct {
    DefaultPageSize int `json:"defaultPageSize"`
    MaxPageSize     int `json:"maxPageSize"`
    MinPageSize     int `json:"minPageSize"`
}

type SearchConfig struct {
    CaseSensitive    bool          `json:"caseSensitive"`
    MaxResults       int           `json:"maxResults"`
    Timeout          time.Duration `json:"timeout"`
    EnableHighlight  bool          `json:"enableHighlight"`
}

type ErrorConfig struct {
    IncludeDetails   bool `json:"includeDetails"`
    IncludeStackTrace bool `json:"includeStackTrace"`
    SanitizeMessages bool `json:"sanitizeMessages"`
}
```

## Testing

### Unit Tests

**Pagination Tests:**
```go
func TestParsePaginationParams(t *testing.T) {
    tests := []struct {
        name     string
        url      string
        expected utils.PaginationParams
    }{
        {
            name: "default values",
            url:  "/api/v1/pods",
            expected: utils.PaginationParams{
                Page:     1,
                PageSize: 25,
                Offset:   0,
                Limit:    25,
            },
        },
        {
            name: "custom values",
            url:  "/api/v1/pods?page=2&pageSize=50",
            expected: utils.PaginationParams{
                Page:     2,
                PageSize: 50,
                Offset:   50,
                Limit:    50,
            },
        },
        {
            name: "exceed max page size",
            url:  "/api/v1/pods?pageSize=200",
            expected: utils.PaginationParams{
                Page:     1,
                PageSize: 100, // Capped at MaxPageSize
                Offset:   0,
                Limit:    100,
            },
        },
    }
    
    for _, test := range tests {
        t.Run(test.name, func(t *testing.T) {
            req := httptest.NewRequest("GET", test.url, nil)
            params := utils.ParsePaginationParams(req)
            assert.Equal(t, test.expected, params)
        })
    }
}
```

**Search Tests:**
```go
func TestApplyTextSearch(t *testing.T) {
    items := []string{"apple", "banana", "cherry", "apricot"}
    
    searchParams := utils.SearchParams{
        Query:         "ap",
        CaseSensitive: false,
    }
    
    result := utils.ApplyTextSearch(items, searchParams, func(item string) string {
        return item
    })
    
    expected := []string{"apple", "apricot"}
    assert.Equal(t, expected, result)
}
```

**Error Handling Tests:**
```go
func TestWriteErrorResponse(t *testing.T) {
    recorder := httptest.NewRecorder()
    err := errors.New("test error")
    
    utils.WriteErrorResponse(recorder, err, http.StatusBadRequest, "additional details")
    
    assert.Equal(t, http.StatusBadRequest, recorder.Code)
    assert.Equal(t, "application/json", recorder.Header().Get("Content-Type"))
    
    var response utils.ErrorResponse
    err = json.Unmarshal(recorder.Body.Bytes(), &response)
    assert.NoError(t, err)
    assert.Equal(t, "error", response.Status)
    assert.Equal(t, "test error", response.Error)
    assert.Equal(t, http.StatusBadRequest, response.Code)
    assert.Equal(t, "additional details", response.Details)
}
```

### Integration Tests

**Complete Handler Test:**
```go
func TestListPodsHandlerIntegration(t *testing.T) {
    // Setup test server
    router := mux.NewRouter()
    router.HandleFunc("/api/v1/pods", ListPodsHandler).Methods("GET")
    server := httptest.NewServer(router)
    defer server.Close()
    
    // Test with pagination
    resp, err := http.Get(server.URL + "/api/v1/pods?page=1&pageSize=10")
    assert.NoError(t, err)
    assert.Equal(t, http.StatusOK, resp.StatusCode)
    
    // Test with search
    resp, err = http.Get(server.URL + "/api/v1/pods?q=nginx&fields=name,namespace")
    assert.NoError(t, err)
    assert.Equal(t, http.StatusOK, resp.StatusCode)
    
    // Test error handling
    resp, err = http.Get(server.URL + "/api/v1/pods?pageSize=500") // Exceeds max
    assert.NoError(t, err)
    assert.Equal(t, http.StatusOK, resp.StatusCode) // Should be capped, not error
}
```

## Security Considerations

### Input Validation
- All query parameters are validated and bounded
- JSON parsing uses strict decoding to prevent injection
- Search queries are sanitized to prevent script injection
- File paths and resource names are validated for security

### Error Information Exposure
- Error messages are sanitized in production
- Stack traces are excluded from client responses
- Internal error details are logged but not exposed
- User context is always validated before processing

### Rate Limiting Integration
```go
// Example rate limiting integration
func WithRateLimit(handler http.HandlerFunc) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        user, err := utils.GetUserFromContext(r)
        if err != nil {
            utils.WriteUnauthorizedError(w, "")
            return
        }
        
        if !rateLimiter.Allow(user.ID) {
            utils.WriteErrorResponse(w, 
                fmt.Errorf("rate limit exceeded"), 
                http.StatusTooManyRequests)
            return
        }
        
        handler(w, r)
    }
}
```

## Performance Optimization

### Memory Efficiency
- Generic functions reduce code duplication
- Slice operations use efficient algorithms
- Response structures are optimized for JSON marshaling
- Search operations use early termination where possible

### Caching Integration
```go
// Example caching for expensive search operations
func CachedSearch[T any](
    cacheKey string,
    searchFunc func() ([]T, error),
    ttl time.Duration,
) ([]T, error) {
    // Check cache first
    if cached, found := searchCache.Get(cacheKey); found {
        return cached.([]T), nil
    }
    
    // Execute search
    results, err := searchFunc()
    if err != nil {
        return nil, err
    }
    
    // Cache results
    searchCache.Set(cacheKey, results, ttl)
    return results, nil
}
```

## Best Practices

### API Consistency
- Always use standardized response formats
- Implement consistent error handling across all endpoints
- Use the same pagination parameters for all list operations
- Apply uniform search and filtering patterns

### Error Handling
- Use appropriate HTTP status codes
- Provide meaningful error messages
- Include context in error details when helpful
- Log errors for debugging but sanitize client responses

### Performance
- Implement pagination for all list operations
- Use efficient search algorithms for large datasets
- Cache expensive operations when appropriate
- Validate input parameters early to prevent unnecessary processing

### Security
- Always validate user context before processing
- Sanitize all user input
- Use strict JSON parsing
- Implement proper error information disclosure policies

## Dependencies

### External Dependencies
- Standard library (`net/http`, `encoding/json`, `strconv`, `strings`)
- `gorilla/mux` (for URL parameter extraction in examples)

### Internal Dependencies
- `internal/auth` - User context and authentication
- `internal/cache` - Caching integration (optional)

This documentation provides comprehensive coverage of the API utils package, serving as both a developer guide for implementing consistent API patterns and a reference for understanding the utility functions available throughout Kaptn's API layer.
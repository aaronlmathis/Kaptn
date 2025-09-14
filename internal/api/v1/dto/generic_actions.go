package dto

// Generic actions API (single endpoint) request/response types

type GenericActionRequest struct {
    RequestID       string                 `json:"requestId,omitempty"`
    Action          string                 `json:"action"`
    DryRun          bool                   `json:"dryRun"`
    // ForceConfirm indicates the user has explicitly confirmed a destructive action
    // (e.g., by typing the resource name). When true, safety validation failures
    // may be overridden according to server policy.
    ForceConfirm    bool                   `json:"forceConfirm,omitempty"`
    ContinueOnError bool                   `json:"continueOnError"`
    Concurrency     int                    `json:"concurrency,omitempty"`
    Resources       []ObjectRef            `json:"resources,omitempty"`
    Selector        *Selector              `json:"selector,omitempty"`
    Params          map[string]interface{} `json:"params,omitempty"`
}

type ObjectRef struct {
    APIVersion string `json:"apiVersion"`
    Kind       string `json:"kind"`
    Namespace  string `json:"namespace,omitempty"`
    Name       string `json:"name"`
}

type Selector struct {
    APIVersion    string `json:"apiVersion"`
    Kind          string `json:"kind"`
    Namespace     string `json:"namespace,omitempty"`
    LabelSelector string `json:"labelSelector,omitempty"`
    FieldSelector string `json:"fieldSelector,omitempty"`
}

type GenericActionResponse struct {
    RequestID string       `json:"requestId"`
    Action    string       `json:"action"`
    DryRun    bool         `json:"dryRun"`
    Results   []ItemResult `json:"results"`
    Summary   *Summary     `json:"summary,omitempty"`
    ParamErrors []ParamError `json:"paramErrors,omitempty"`
}

type ItemResult struct {
    Ref             ObjectRef `json:"ref"`
    Status          string    `json:"status"` // ok|error|skipped
    HTTPStatus      int       `json:"httpStatus"`
    UID             string    `json:"uid,omitempty"`
    ResourceVersion string    `json:"resourceVersion,omitempty"`
    Message         string    `json:"message,omitempty"`
    Warnings        []string  `json:"warnings,omitempty"`
    YAML            string    `json:"yaml,omitempty"`
}

type Summary struct {
    Total   int `json:"total"`
    OK      int `json:"ok"`
    Error   int `json:"error"`
    Skipped int `json:"skipped"`
}

type ParamError struct {
    Field   string `json:"field"`
    Message string `json:"message"`
}

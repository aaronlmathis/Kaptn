# Kubernetes Admin Dashboard - Backend API Documentation

This document provides comprehensive API documentation for frontend engineers working with the Kubernetes Admin Dashboard backend.

## Table of Contents

1. [Project Overview](#project-overview)
2. [Configuration](#configuration)
3. [Authentication](#authentication)
4. [API Reference](#api-reference)
5. [Usage Examples](#usage-examples)
6. [Edge Cases & Notes](#edge-cases--notes)

---

## Project Overview

The Kubernetes Admin Dashboard is a secure, production-ready application that provides cluster monitoring and administrative operations through a REST API with WebSocket support. The backend is built with Go using client-go for Kubernetes integration.

### High-Level Architecture

```
Frontend (Astro + Shadcn/Tailwind) ←→ REST API + WebSocket ←→ Kubernetes API Server
```

### Key Features

- **Real-time monitoring** via WebSocket streams
- **Secure operations** with RBAC integration
- **Server-side apply** for declarative deployments
- **Audit logging** for all operations
- **Rate limiting** to prevent abuse
- **Multiple authentication modes** (none, header, OIDC)

---

## Configuration

### Environment Variables

The backend reads configuration from environment variables or `config.yaml`:

#### Server Configuration
| Variable | Default | Description |
|----------|---------|-------------|
| `KAD_SERVER_ADDR` | `0.0.0.0:8080` | Server bind address |
| `KAD_BASE_PATH` | `/` | Base path for API routes |
| `PORT` | - | Override port (takes precedence over KAD_SERVER_ADDR) |

#### Security & Authentication
| Variable | Default | Description |
|----------|---------|-------------|
| `KAD_AUTH_MODE` | `none` | Authentication mode: `none`, `header`, `oidc` |
| `KAD_TLS_ENABLED` | `false` | Enable TLS/HTTPS |
| `KAD_TLS_CERT_FILE` | - | Path to TLS certificate file |
| `KAD_TLS_KEY_FILE` | - | Path to TLS private key file |

#### OIDC Configuration (when auth_mode=oidc)
| Variable | Default | Description |
|----------|---------|-------------|
| `KAD_OIDC_ISSUER` | - | OIDC provider issuer URL |
| `KAD_OIDC_CLIENT_ID` | - | OIDC client ID |
| `KAD_OIDC_CLIENT_SECRET` | - | OIDC client secret |
| `KAD_OIDC_REDIRECT_URL` | - | OIDC redirect URL |
| `KAD_OIDC_AUDIENCE` | - | Expected audience in tokens |
| `KAD_OIDC_SCOPES` | `openid,profile,email,groups` | Comma-separated scopes |

#### Kubernetes Configuration
| Variable | Default | Description |
|----------|---------|-------------|
| `KAD_KUBE_MODE` | `kubeconfig` | Kubernetes mode: `kubeconfig`, `incluster` |
| `KUBECONFIG` | - | Path to kubeconfig file |
| `KAD_NAMESPACE_DEFAULT` | `default` | Default namespace |

#### Features & Capabilities
| Variable | Default | Description |
|----------|---------|-------------|
| `KAD_ENABLE_APPLY` | `true` | Enable YAML apply operations |
| `KAD_ENABLE_NODE_ACTIONS` | `true` | Enable node cordon/drain operations |
| `KAD_ENABLE_OVERVIEW` | `true` | Enable cluster overview |
| `KAD_ENABLE_PROMETHEUS_ANALYTICS` | `true` | Enable Prometheus-based analytics |

#### Rate Limiting
| Variable | Default | Description |
|----------|---------|-------------|
| `KAD_APPLY_PER_MINUTE` | `10` | Apply operations per minute per user |
| `KAD_ACTIONS_PER_MINUTE` | `20` | Node actions per minute per user |

#### Logging
| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_LEVEL` | `info` | Log level: `debug`, `info`, `warn`, `error` |

#### Integrations
| Variable | Default | Description |
|----------|---------|-------------|
| `KAD_PROMETHEUS_URL` | `http://prometheus.monitoring.svc:9090` | Prometheus server URL |
| `KAD_PROMETHEUS_TIMEOUT` | `5s` | Prometheus query timeout |
| `KAD_PROMETHEUS_ENABLED` | `true` | Enable Prometheus integration |

#### Caching
| Variable | Default | Description |
|----------|---------|-------------|
| `KAD_OVERVIEW_TTL` | `2s` | Overview data cache TTL |
| `KAD_ANALYTICS_TTL` | `60s` | Analytics data cache TTL |

#### Job Management
| Variable | Default | Description |
|----------|---------|-------------|
| `KAD_JOBS_PERSISTENCE_ENABLED` | `true` | Enable job state persistence |
| `KAD_JOBS_STORE_PATH` | `./data/jobs` | Job persistence storage path |
| `KAD_JOBS_CLEANUP_INTERVAL` | `1h` | Job cleanup interval |
| `KAD_JOBS_MAX_AGE` | `24h` | Maximum job age before cleanup |

### Sample Configuration

```yaml
server:
  addr: "0.0.0.0:8080"
  base_path: "/"
  cors:
    allow_origins: ["*"]
    allow_methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"]

security:
  auth_mode: "none"  # or "header", "oidc"
  oidc:
    issuer: ""
    client_id: ""
    client_secret: ""
    redirect_url: ""
    audience: ""
    scopes: ["openid", "profile", "email", "groups"]
  tls:
    enabled: false
    cert_file: ""
    key_file: ""

kubernetes:
  mode: "kubeconfig"  # or "incluster"
  kubeconfig_path: ""
  namespace_default: "default"

features:
  enable_apply: true
  enable_nodes_actions: true
  enable_overview: true
  enable_prometheus_analytics: true

rate_limits:
  apply_per_minute: 10
  actions_per_minute: 20

logging:
  level: "info"

integrations:
  prometheus:
    url: "http://prometheus.monitoring.svc:9090"
    timeout: "5s"
    enabled: true

caching:
  overview_ttl: "2s"
  analytics_ttl: "60s"

jobs:
  persistence_enabled: true
  store_path: "./data/jobs"
  cleanup_interval: "1h"
  max_age: "24h"
```

---

## Authentication

### Authentication Modes

The API supports three authentication modes:

#### 1. None (Development)
- **Mode**: `auth_mode: "none"`
- **Use case**: Local development
- **Security**: No authentication required

#### 2. Header-based Authentication
- **Mode**: `auth_mode: "header"`
- **Headers**: `X-User-ID`, `X-User-Email`, `X-User-Groups`
- **Use case**: When behind a proxy that handles authentication

#### 3. OIDC Authentication
- **Mode**: `auth_mode: "oidc"`
- **Flow**: OAuth2/OIDC authorization code flow
- **Tokens**: JWT access tokens with Bearer authentication

### User Roles and Permissions

The API supports role-based access control through user groups:

#### Admin Roles
- `admin`, `cluster-admin`, `kad-admin`: Full access to all operations

#### Editor Roles  
- `editor`, `kad-editor`: Read and write access (excluding admin operations)

#### Viewer Roles
- `viewer`, `kad-viewer`: Read-only access

#### Permission Levels
- **Read Operations**: Available to all authenticated users (or public if auth disabled)
- **Write Operations**: Require editor role or higher
- **Admin Operations**: Require admin role

The system automatically checks user permissions based on groups/roles in the JWT token or header-based authentication.

### Authentication Endpoints

#### Login
```http
POST /api/v1/auth/login
Content-Type: application/json
```

**Response (auth_mode: "none")**:
```json
{
  "authMode": "none",
  "message": "Authentication disabled in development mode",
  "devMode": true
}
```

**Response (auth_mode: "oidc")**:
```json
{
  "authUrl": "https://provider.com/auth?client_id=...",
  "state": "kad_request-id-123"
}
```

#### OIDC Callback
```http
POST /api/v1/auth/callback
Content-Type: application/json

{
  "code": "authorization-code",
  "state": "kad_request-id-123"
}
```

**Response**:
```json
{
  "success": true,
  "user": {
    "id": "user123",
    "email": "user@example.com",
    "name": "John Doe",
    "groups": ["admin", "developers"]
  },
  "access_token": "eyJ...",
  "id_token": "eyJ...",
  "expires_at": "2025-08-02T12:00:00Z"
}
```

#### Current User
```http
GET /api/v1/auth/me
Authorization: Bearer <token>
```

**Response**:
```json
{
  "authenticated": true,
  "user": {
    "id": "user123",
    "email": "user@example.com",
    "name": "John Doe",
    "groups": ["admin", "developers"],
    "claims": {}
  }
}
```

#### Logout
```http
POST /api/v1/auth/logout
```

**Response**:
```json
{
  "success": "true",
  "message": "Logged out successfully"
}
```

---

## API Reference

### Base URL

All API endpoints use the base path: `/api/v1`

### Common Response Format

**Success Response**:
```json
{
  "data": {...},
  "status": "success"
}
```

**Error Response**:
```json
{
  "error": "Error message",
  "code": "ERR_CODE",
  "status": "error"
}
```

### Health & System Endpoints

#### Health Check
```http
GET /healthz
```

**Response**:
```json
{
  "status": "ok"
}
```

#### Readiness Check
```http
GET /readyz
```

**Response**:
```json
{
  "status": "ready"
}
```

#### Version Information
```http
GET /version
```

**Response**:
```json
{
  "version": "v1.0.0",
  "gitCommit": "abc123",
  "buildDate": "2025-08-02T10:00:00Z",
  "goVersion": "go1.22.0"
}
```

### Node Management

#### List Nodes
```http
GET /api/v1/nodes?search={search}&sortBy={sortBy}&page={page}&pageSize={pageSize}
Authorization: Bearer <token>  # if auth enabled
```

**Query Parameters**:
- `search` (optional): Search term for node names
- `sortBy` (optional): Sort field (default: `name`)
- `page` (optional): Page number (default: 1)
- `pageSize` (optional): Items per page, max 100 (default: 50)

**Response**:
```json
{
  "status": "success",
  "data": {
    "items": [
      {
        "name": "node-1",
        "roles": ["control-plane"],
        "kubeletVersion": "v1.28.0",
        "ready": true,
        "unschedulable": false,
        "taints": [
          {
            "key": "node-role.kubernetes.io/control-plane",
            "value": "",
            "effect": "NoSchedule"
          }
        ],
        "capacity": {
          "cpu": "4",
          "memory": "8Gi"
        },
        "allocatable": {
          "cpu": "3800m",
          "memory": "7.5Gi"
        },
        "creationTimestamp": "2025-08-01T10:00:00Z",
        "conditions": [...],
        "alerts": [...]
      }
    ],
    "total": 5,
    "page": 1,
    "pageSize": 50
  }
}
```

#### Cordon Node
```http
POST /api/v1/nodes/{nodeName}/cordon
Authorization: Bearer <token>
```

**Response**: HTTP 204 No Content on success

#### Uncordon Node
```http
POST /api/v1/nodes/{nodeName}/uncordon
Authorization: Bearer <token>
```

**Response**: HTTP 204 No Content on success

#### Drain Node
```http
POST /api/v1/nodes/{nodeName}/drain
Authorization: Bearer <token>
Content-Type: application/json

{
  "timeoutSeconds": 600,
  "force": false,
  "deleteLocalData": false,
  "ignoreDaemonSets": true
}
```

**Response**:
```json
{
  "jobId": "drain-job-abc123"
}
```

### Pod Management

#### List Pods
```http
GET /api/v1/pods?namespace={namespace}&node={nodeName}&phase={phase}&labelSelector={selector}&fieldSelector={selector}&search={search}&sort={sort}&order={order}&page={page}&pageSize={pageSize}
Authorization: Bearer <token>
```

**Query Parameters**:
- `namespace` (optional): Filter by namespace
- `node` (optional): Filter by node name
- `phase` (optional): Filter by pod phase (Running, Pending, Succeeded, Failed, Unknown)
- `labelSelector` (optional): Kubernetes label selector
- `fieldSelector` (optional): Kubernetes field selector
- `search` (optional): Search term for pod names
- `sort` (optional): Sort field
- `order` (optional): Sort order (asc/desc)
- `page` (optional): Page number for pagination
- `pageSize` (optional): Number of items per page

**Response**:
```json
{
  "data": {
    "items": [
      {
        "name": "nginx-deployment-abc123",
        "namespace": "default",
        "phase": "Running",
        "ready": true,
        "readyContainers": 1,
        "totalContainers": 1,
        "node": "node-1",
        "podIP": "10.244.1.5",
        "creationTimestamp": "2025-08-01T10:30:00Z",
        "labels": {
          "app": "nginx"
        },
        "conditions": [
          {
            "type": "Ready",
            "status": "True",
            "lastTransitionTime": "2025-08-01T10:30:30Z"
          }
        ]
      }
    ],
    "page": 1,
    "pageSize": 25,
    "total": 100
  },
  "status": "success"
}
```

#### Get Pod Details
```http
GET /api/v1/pods/{namespace}/{name}
Authorization: Bearer <token>
```

**Response**: Full Kubernetes Pod object with enhanced summary

#### Delete Pod
```http
DELETE /api/v1/resources
Authorization: Bearer <token>
Content-Type: application/json

{
  "namespace": "default",
  "kind": "Pod",
  "name": "nginx-abc123"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Resource deleted successfully"
}
```

### YAML Apply Operations

#### Apply YAML
```http
POST /api/v1/namespaces/{namespace}/apply?dryRun={true|false}&force={true|false}
Authorization: Bearer <token>
Content-Type: application/yaml

apiVersion: v1
kind: ConfigMap
metadata:
  name: my-config
  namespace: default
data:
  key: value
```

**Query Parameters**:
- `dryRun` (optional): Perform dry-run validation (default: false)
- `force` (optional): Force apply even if conflicts exist (default: false)

**Response**:
```json
{
  "success": true,
  "resources": [
    {
      "name": "my-config",
      "namespace": "default",
      "kind": "ConfigMap",
      "apiVersion": "v1",
      "action": "created",
      "diff": {
        "data": {
          "key": "value"
        }
      }
    }
  ],
  "message": "Applied 1 resource successfully"
}
```

**Error Response**:
```json
{
  "success": false,
  "errors": [
    "Invalid YAML format: line 5 column 2"
  ],
  "message": "Apply operation failed"
}
```

### Resource Management

#### List Namespaces
```http
GET /api/v1/namespaces
Authorization: Bearer <token>
```

**Response**: Array of Kubernetes Namespace objects with enhanced formatting

#### List Services (All Namespaces)
```http
GET /api/v1/services?namespace={namespace}&search={search}&sortBy={sortBy}&page={page}&pageSize={pageSize}
Authorization: Bearer <token>
```

**Response**: 
```json
{
  "status": "success",
  "data": {
    "items": [...],
    "total": 10,
    "page": 1,
    "pageSize": 50
  }
}
```

#### List Services in Namespace
```http
GET /api/v1/services/{namespace}
Authorization: Bearer <token>
```

**Response**: Array of Kubernetes Service objects in specified namespace

#### Get Service Details
```http
GET /api/v1/services/{namespace}/{name}
Authorization: Bearer <token>
```

**Response**:
```json
{
  "data": {
    "summary": { /* Enhanced service summary */ },
    "spec": { /* Full service spec */ },
    "status": { /* Service status */ },
    "metadata": { /* Service metadata */ },
    "kind": "Service",
    "apiVersion": "v1"
  },
  "status": "success"
}
```

#### List Deployments
```http
GET /api/v1/deployments?namespace={namespace}&labelSelector={selector}&fieldSelector={selector}&page={page}&pageSize={pageSize}&sort={sort}&order={order}&search={search}
Authorization: Bearer <token>
```

**Query Parameters**:
- `namespace` (optional): Filter by namespace
- `labelSelector` (optional): Kubernetes label selector
- `fieldSelector` (optional): Kubernetes field selector
- `page` (optional): Page number for pagination (default: 1)
- `pageSize` (optional): Number of items per page (default: 25)
- `sort` (optional): Sort field
- `order` (optional): Sort order (asc/desc)
- `search` (optional): Search term

**Response**:
```json
{
  "data": {
    "items": [...],
    "page": 1,
    "pageSize": 25,
    "total": 100
  },
  "status": "success"
}
```

#### Get Deployment Details
```http
GET /api/v1/deployments/{namespace}/{name}
Authorization: Bearer <token>
```

**Response**: Full Deployment object with enhanced summary

#### List StatefulSets
```http
GET /api/v1/statefulsets?namespace={namespace}&labelSelector={selector}&fieldSelector={selector}&page={page}&pageSize={pageSize}&sort={sort}&order={order}&search={search}
Authorization: Bearer <token>
```

**Response**: Paginated list of StatefulSets with same structure as deployments

#### Get StatefulSet Details
```http
GET /api/v1/statefulsets/{namespace}/{name}
Authorization: Bearer <token>
```

**Response**: Full StatefulSet object with enhanced summary

#### List ReplicaSets
```http
GET /api/v1/replicasets?namespace={namespace}&labelSelector={selector}&fieldSelector={selector}&page={page}&pageSize={pageSize}&sort={sort}&order={order}&search={search}
Authorization: Bearer <token>
```

**Response**: Paginated list of ReplicaSets

#### Get ReplicaSet Details
```http
GET /api/v1/replicasets/{namespace}/{name}
Authorization: Bearer <token>
```

**Response**: Full ReplicaSet object with enhanced summary

#### List DaemonSets
```http
GET /api/v1/daemonsets?namespace={namespace}&labelSelector={selector}&fieldSelector={selector}&page={page}&pageSize={pageSize}&sort={sort}&order={order}&search={search}
Authorization: Bearer <token>
```

**Response**: Paginated list of DaemonSets

#### Get DaemonSet Details
```http
GET /api/v1/daemonsets/{namespace}/{name}
Authorization: Bearer <token>
```

**Response**: Full DaemonSet object with enhanced summary

#### List Kubernetes Jobs
```http
GET /api/v1/k8s-jobs?namespace={namespace}&labelSelector={selector}&fieldSelector={selector}&page={page}&pageSize={pageSize}&sort={sort}&order={order}&search={search}
Authorization: Bearer <token>
```

**Response**: Paginated list of Kubernetes Jobs

#### Get Kubernetes Job Details
```http
GET /api/v1/k8s-jobs/{namespace}/{name}
Authorization: Bearer <token>
```

**Response**: Full Job object with enhanced summary

#### List CronJobs
```http
GET /api/v1/cronjobs?namespace={namespace}&labelSelector={selector}&fieldSelector={selector}&page={page}&pageSize={pageSize}&sort={sort}&order={order}&search={search}
Authorization: Bearer <token>
```

**Response**: Paginated list of CronJobs

#### Get CronJob Details
```http
GET /api/v1/cronjobs/{namespace}/{name}
Authorization: Bearer <token>
```

**Response**: Full CronJob object with enhanced summary

#### List All Ingresses
```http
GET /api/v1/ingresses
Authorization: Bearer <token>
```

**Response**: Array of all Ingresses across namespaces

#### List Ingresses in Namespace
```http
GET /api/v1/ingresses/{namespace}
Authorization: Bearer <token>
```

**Response**: Array of Ingresses in specified namespace

#### Get Ingress Details
```http
GET /api/v1/ingresses/{namespace}/{name}
Authorization: Bearer <token>
```

**Response**: Full Ingress object with enhanced summary

#### List Endpoints
```http
GET /api/v1/endpoints?namespace={namespace}&labelSelector={selector}&fieldSelector={selector}&page={page}&pageSize={pageSize}&sort={sort}&order={order}&search={search}
Authorization: Bearer <token>
```

**Response**: Paginated list of Endpoints

#### Get Endpoints Details
```http
GET /api/v1/endpoints/{namespace}/{name}
Authorization: Bearer <token>
```

**Response**: Full Endpoints object with enhanced summary

#### Cluster Overview
```http
GET /api/v1/overview
Authorization: Bearer <token>
```

**Response**: Comprehensive cluster overview including resource counts, health status, and alerts

#### Export Resource
```http
GET /api/v1/export/{namespace}/{kind}/{name}
Authorization: Bearer <token>
```

**Response**: Clean YAML export of the resource

#### Scale Resource
```http
POST /api/v1/scale
Authorization: Bearer <token>
Content-Type: application/json

{
  "namespace": "default",
  "kind": "Deployment",
  "name": "nginx",
  "replicas": 3
}
```

**Response**:
```json
{
  "success": true,
  "message": "Resource scaled successfully"
}
```

#### Delete Resource
```http
DELETE /api/v1/resources
Authorization: Bearer <token>
Content-Type: application/json

{
  "namespace": "default",
  "kind": "Pod",
  "name": "nginx-abc123"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Resource deleted successfully"
}
```

#### Create Namespace
```http
POST /api/v1/namespaces
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "new-namespace",
  "labels": {
    "team": "development"
  }
}
```

**Response**:
```json
{
  "success": true,
  "message": "Namespace created successfully"
}
```

#### Delete Namespace
```http
DELETE /api/v1/namespaces/{namespace}
Authorization: Bearer <token>
```

**Response**:
```json
{
  "success": true,
  "message": "Namespace deleted successfully"
}
```

### Metrics & Analytics

#### Get Cluster Metrics
```http
GET /api/v1/metrics
Authorization: Bearer <token>
```

**Response**: Cluster-wide resource utilization metrics including CPU, memory, and storage

#### Get Namespace Metrics
```http
GET /api/v1/metrics/namespace/{namespace}
Authorization: Bearer <token>
```

**Response**: Resource utilization metrics for a specific namespace

#### Get Analytics Data
```http
GET /api/v1/analytics/visitors?window={window}&step={step}
Authorization: Bearer <token>
```

**Query Parameters**:
- `window` (optional): Time window (`7d`, `30d`, `90d` - default: `90d`)
- `step` (optional): Data point interval (`1h`, `1d` - auto-selected based on window)

**Response**:
```json
{
  "data": {
    "visitors": [
      {
        "timestamp": "2025-08-01T00:00:00Z",
        "count": 42
      }
    ],
    "total": 1234,
    "window": "90d",
    "step": "1d"
  },
  "status": "success"
}
```

### Logs and Exec

#### Get Pod Logs
```http
GET /api/v1/pods/{namespace}/{podName}/logs?container={container}&follow={true|false}&tail={lines}
Authorization: Bearer <token>
```

**Query Parameters**:
- `container` (optional): Container name
- `follow` (optional): Follow log stream
- `tail` (optional): Number of lines to tail

**Response**: Log text or stream

#### Start Log Stream
```http
POST /api/v1/logs/stream
Authorization: Bearer <token>
Content-Type: application/json

{
  "namespace": "default",
  "pod": "nginx-abc123",
  "container": "nginx",
  "follow": true
}
```

**Response**:
```json
{
  "streamId": "stream-abc123",
  "message": "Log stream started"
}
```

#### Stop Log Stream
```http
DELETE /api/v1/logs/stream/{streamId}
Authorization: Bearer <token>
```

**Response**:
```json
{
  "success": true,
  "message": "Log stream stopped"
}
```

#### Container Exec (WebSocket)
```http
GET /api/v1/exec/{sessionId}?namespace={namespace}&pod={pod}&container={container}&command={cmd}&tty=true
Authorization: Bearer <token>
Upgrade: websocket
```

**Query Parameters**:
- `namespace`: Pod namespace
- `pod`: Pod name
- `container` (optional): Container name
- `command` (optional): Command to execute (default: `/bin/sh`)
- `tty` (optional): Allocate TTY (default: `true`)

**Message Format**: Binary WebSocket frames for terminal I/O

### Action Job Tracking

#### List Action Jobs
```http
GET /api/v1/jobs
Authorization: Bearer <token>
```

**Response**:
```json
{
  "status": "success",
  "data": {
    "items": [
      {
        "id": "drain-job-abc123",
        "type": "drain",
        "status": "completed",
        "progress": [
          "Starting drain operation",
          "Cordoning node",
          "Evicting pods",
          "Drain completed"
        ],
        "startTime": "2025-08-01T10:45:00Z",
        "endTime": "2025-08-01T10:47:00Z",
        "details": {
          "nodeName": "node-1",
          "podsEvicted": 5
        }
      }
    ],
    "total": 1
  }
}
```

#### Get Action Job Status
```http
GET /api/v1/jobs/{jobId}
Authorization: Bearer <token>
```

**Response**:
```json
{
  "id": "drain-job-abc123",
  "type": "drain",
  "status": "completed",
  "progress": [
    "Starting drain operation",
    "Cordoning node",
    "Evicting pods",
    "Drain completed"
  ],
  "startTime": "2025-08-01T10:45:00Z",
  "endTime": "2025-08-01T10:47:00Z",
  "details": {
    "nodeName": "node-1",
    "podsEvicted": 5
  }
}
```

### WebSocket Endpoints

#### Node Stream
```
WS /api/v1/stream/nodes
Authorization: Bearer <token>
```

**Message Format**:
```json
{
  "type": "nodeUpdate",
  "action": "added|modified|deleted",
  "data": { /* Node object */ }
}
```

#### Pod Stream
```
WS /api/v1/stream/pods?namespace={namespace}
Authorization: Bearer <token>
```

**Message Format**:
```json
{
  "type": "podUpdate",
  "action": "added|modified|deleted",
  "data": { /* Pod object */ }
}
```

#### Overview Stream
```
WS /api/v1/stream/overview
Authorization: Bearer <token>
```

**Message Format**:
```json
{
  "type": "overviewUpdate",
  "data": { /* Cluster overview object */ }
}
```

#### Job Progress Stream
```
WS /api/v1/stream/jobs/{jobId}
Authorization: Bearer <token>
```

**Message Format**:
```json
{
  "type": "jobProgress",
  "jobId": "drain-job-abc123",
  "status": "running",
  "progress": "Evicting pods from node",
  "data": { /* Job status object */ }
}
```

#### Log Stream
```
WS /api/v1/stream/logs/{streamId}
Authorization: Bearer <token>
```

**Message Format**:
```json
{
  "type": "logLine",
  "timestamp": "2025-08-01T10:45:00Z",
  "line": "2025/08/01 10:45:00 Starting server..."
}
```

#### Exec Session
```
WS /api/v1/exec/{sessionId}?namespace={namespace}&pod={pod}&container={container}&command={cmd}&tty=true
Authorization: Bearer <token>
```

**Message Format**: Binary WebSocket frames for terminal I/O

---

## Usage Examples

### JavaScript/TypeScript with Fetch

#### Setting Up Authentication

```typescript
// api-client.ts
class ApiClient {
  private baseURL = '/api/v1';
  private token: string | null = null;

  setToken(token: string) {
    this.token = token;
  }

  private async request<T>(
    endpoint: string, 
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseURL}${endpoint}`;
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  async get<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint);
  }

  async post<T>(endpoint: string, data?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }
}

export const apiClient = new ApiClient();
```

#### Authentication Flow

```typescript
// auth.ts
interface LoginResponse {
  authUrl?: string;
  state?: string;
  authMode?: string;
  devMode?: boolean;
}

interface CallbackData {
  code: string;
  state: string;
}

interface AuthUser {
  id: string;
  email: string;
  name: string;
  groups: string[];
}

export class AuthService {
  async login(): Promise<LoginResponse> {
    return apiClient.post<LoginResponse>('/auth/login');
  }

  async handleCallback(data: CallbackData): Promise<any> {
    const response = await apiClient.post('/auth/callback', data);
    if (response.access_token) {
      apiClient.setToken(response.access_token);
    }
    return response;
  }

  async getCurrentUser(): Promise<AuthUser> {
    const response = await apiClient.get<{authenticated: boolean, user: AuthUser}>('/auth/me');
    return response.user;
  }

  async logout(): Promise<void> {
    await apiClient.post('/auth/logout');
    apiClient.setToken('');
  }
}
```

#### Kubernetes Operations

```typescript
// k8s-api.ts
interface Node {
  name: string;
  roles: string[];
  ready: boolean;
  unschedulable: boolean;
  kubeletVersion: string;
}

interface Pod {
  name: string;
  namespace: string;
  phase: string;
  ready: boolean;
  node: string;
}

interface ApplyRequest {
  yaml: string;
  dryRun?: boolean;
  force?: boolean;
}

interface ApplyResult {
  success: boolean;
  resources: Array<{
    name: string;
    namespace: string;
    kind: string;
    action: string;
  }>;
  errors?: string[];
}

export class K8sService {
  async getNodes(): Promise<Node[]> {
    return apiClient.get<Node[]>('/nodes');
  }

  async getPods(namespace?: string): Promise<Pod[]> {
    const query = namespace ? `?namespace=${namespace}` : '';
    return apiClient.get<Pod[]>(`/pods${query}`);
  }

  async cordonNode(nodeName: string): Promise<void> {
    return apiClient.post(`/nodes/${nodeName}/cordon`);
  }

  async uncordonNode(nodeName: string): Promise<void> {
    return apiClient.post(`/nodes/${nodeName}/uncordon`);
  }

  async drainNode(
    nodeName: string, 
    options: { timeoutSeconds?: number; force?: boolean } = {}
  ): Promise<{ jobId: string }> {
    return apiClient.post(`/nodes/${nodeName}/drain`, options);
  }

  async applyYaml(
    namespace: string, 
    yaml: string, 
    options: { dryRun?: boolean; force?: boolean } = {}
  ): Promise<ApplyResult> {
    const query = new URLSearchParams();
    if (options.dryRun) query.append('dryRun', 'true');
    if (options.force) query.append('force', 'true');

    const response = await fetch(`/api/v1/namespaces/${namespace}/apply?${query}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/yaml',
        Authorization: `Bearer ${apiClient.token}`,
      },
      body: yaml,
    });

    if (!response.ok) {
      throw new Error(`Apply failed: ${response.statusText}`);
    }

    return response.json();
  }
}
```

#### WebSocket Integration

```typescript
// websocket.ts
interface WebSocketMessage {
  type: string;
  action?: string;
  data?: any;
}

export class WebSocketService {
  private ws: WebSocket | null = null;
  private handlers: Map<string, Function[]> = new Map();

  connect(endpoint: string, token?: string) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}/api/v1${endpoint}`;
    
    this.ws = new WebSocket(url);
    
    if (token) {
      // Send auth after connection opens
      this.ws.onopen = () => {
        this.ws?.send(JSON.stringify({ 
          type: 'auth', 
          token 
        }));
      };
    }

    this.ws.onmessage = (event) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data);
        this.handleMessage(message);
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    this.ws.onclose = () => {
      console.log('WebSocket connection closed');
      // Implement reconnection logic here
    };
  }

  private handleMessage(message: WebSocketMessage) {
    const handlers = this.handlers.get(message.type) || [];
    handlers.forEach(handler => handler(message));
  }

  on(type: string, handler: Function) {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, []);
    }
    this.handlers.get(type)!.push(handler);
  }

  off(type: string, handler: Function) {
    const handlers = this.handlers.get(type);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

// Usage example
const wsService = new WebSocketService();

// Connect to pod updates
wsService.connect('/stream/pods', token);
wsService.on('podUpdate', (message) => {
  console.log('Pod update:', message.action, message.data);
});
```

#### React Hook Example

```typescript
// hooks/useK8sData.ts
import { useState, useEffect } from 'react';
import { K8sService } from '../services/k8s-api';
import { WebSocketService } from '../services/websocket';

const k8sService = new K8sService();
const wsService = new WebSocketService();

export function useNodes() {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadNodes = async () => {
      try {
        const data = await k8sService.getNodes();
        setNodes(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load nodes');
      } finally {
        setLoading(false);
      }
    };

    loadNodes();

    // Set up real-time updates
    wsService.connect('/stream/nodes');
    wsService.on('nodeUpdate', (message) => {
      setNodes(prev => {
        const updated = [...prev];
        const index = updated.findIndex(node => node.name === message.data.name);
        
        if (message.action === 'deleted' && index > -1) {
          updated.splice(index, 1);
        } else if (message.action === 'added' && index === -1) {
          updated.push(message.data);
        } else if (message.action === 'modified' && index > -1) {
          updated[index] = message.data;
        }
        
        return updated;
      });
    });

    return () => {
      wsService.disconnect();
    };
  }, []);

  return { nodes, loading, error, refetch: loadNodes };
}
```

---

## Edge Cases & Notes

### CORS Configuration

The API includes CORS headers for cross-origin requests:

```http
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
Access-Control-Allow-Headers: Accept, Authorization, Content-Type, X-CSRF-Token
```

### Rate Limiting

Different endpoint groups have different rate limits:

- **General endpoints**: 20 requests/minute per user
- **Apply operations**: 10 requests/minute per user
- **Node actions**: 20 requests/minute per user

When rate limited, the API returns:

```http
HTTP/1.1 429 Too Many Requests
Content-Type: application/json

{
  "error": "Rate limit exceeded",
  "code": "RATE_LIMIT_EXCEEDED"
}
```

### Pagination

Some endpoints support pagination via query parameters:

- `page`: Page number (1-based)
- `pageSize`: Items per page (max 100)

### Error Handling

All endpoints return consistent error formats:

```json
{
  "error": "Human-readable error message",
  "code": "MACHINE_READABLE_CODE",
  "details": { /* Optional additional context */ }
}
```

Common HTTP status codes:

- `200`: Success
- `400`: Bad Request (validation errors)
- `401`: Unauthorized (missing/invalid auth)
- `403`: Forbidden (insufficient permissions)
- `404`: Not Found
- `429`: Too Many Requests (rate limited)
- `500`: Internal Server Error

### Job Persistence

Long-running operations like node drain are tracked as jobs:

```typescript
// Start operation (returns immediately with job ID)
const { jobId } = await k8sService.drainNode('node-1');

// Poll for completion using the jobs API
const pollJob = async (jobId: string): Promise<JobResult> => {
  const job = await apiClient.get(`/jobs/${jobId}`);
  
  if (job.status === 'running') {
    await new Promise(resolve => setTimeout(resolve, 1000));
    return pollJob(jobId);
  }
  
  return job;
};

const result = await pollJob(jobId);

// Or use WebSocket for real-time updates
const ws = new WebSocket(`/api/v1/stream/jobs/${jobId}`);
ws.onmessage = (event) => {
  const update = JSON.parse(event.data);
  console.log('Job progress:', update.progress);
};
```

### Enhanced Response Formats

All resource endpoints return enhanced response formats with:

- **Pagination**: `page`, `pageSize`, `total` fields
- **Enhanced Summaries**: Calculated fields like `age`, `ready`, `status`
- **Health Alerts**: Automatic detection of issues and maintenance needs
- **Detailed Metadata**: Full Kubernetes metadata preserved
- **Consistent Structure**: All responses follow the same `{data, status}` format

### Request ID Tracing

All requests include a unique `X-Request-ID` header for distributed tracing:

```http
X-Request-ID: req_1a2b3c4d5e6f
```

This ID is:
- Automatically generated if not provided
- Included in all log entries
- Returned in response headers
- Used for correlating WebSocket messages and job tracking

### Resource Export

Clean YAML export of resources without managed fields:

```http
GET /api/v1/export/{namespace}/{kind}/{name}
```

Returns sanitized YAML suitable for:
- Version control
- Migration between clusters  
- Backup and restore operations
- Infrastructure as Code workflows

### WebSocket Authentication

When auth is enabled, WebSocket connections require authentication:

```typescript
// Option 1: Pass token in query parameter
const ws = new WebSocket(`ws://localhost:8080/api/v1/stream/pods?token=${token}`);

// Option 2: Send auth message after connection
ws.onopen = () => {
  ws.send(JSON.stringify({ type: 'auth', token }));
};
```

### Middleware Behaviors

#### Request ID
All requests get a unique `X-Request-ID` header for tracing.

#### Logging
All requests are logged with:
- Path and method
- User (if authenticated)
- Response status
- Latency

#### Security Headers
The API sets security headers:
```http
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
```

### Versioning Strategy

The API uses URL-based versioning (`/api/v1`). Breaking changes will increment the version number, with both versions supported during migration periods.

### WebSocket Connection Management

- **Heartbeat**: Connections are kept alive with periodic ping/pong frames
- **Reconnection**: Clients should implement automatic reconnection with exponential backoff
- **Resource cleanup**: Connections are automatically cleaned up after 5 minutes of inactivity

### Production Considerations

1. **TLS**: Always use HTTPS/WSS in production
2. **Authentication**: Never use `auth_mode: "none"` in production
3. **RBAC**: Configure appropriate Kubernetes RBAC for the service account
4. **Rate limits**: Adjust rate limits based on expected load
5. **Monitoring**: Monitor the `/metrics` endpoint for operational insights
6. **Job Persistence**: Enable job persistence for reliable operation tracking
7. **Resource Limits**: Set appropriate resource limits in deployment manifests
8. **Network Policies**: Implement network policies to restrict access
9. **Image Security**: Use specific image tags and scan for vulnerabilities
10. **Backup**: Regularly backup job persistence data and configuration

### Performance & Caching

The API implements multiple caching strategies:

#### Informer Cache
- Uses Kubernetes informers for real-time resource caching
- Reduces API server load by serving from local cache
- Automatically syncs with cluster state changes
- Provides sub-second response times for resource listings

#### Analytics Cache  
- Analytics data cached with configurable TTL (default: 60s)
- Reduces load on Prometheus integration
- Supports cache invalidation for real-time updates

#### Overview Cache
- Cluster overview data cached with short TTL (default: 2s)
- Balances real-time updates with performance
- Includes resource counts, health status, and alerts

#### Connection Pooling
- Kubernetes client uses connection pooling
- Metrics client maintains persistent connections
- WebSocket connections are efficiently managed

### High Availability

For production deployments:

1. **Multiple Replicas**: Deploy multiple API server instances
2. **Load Balancing**: Use a load balancer with session affinity for WebSockets
3. **Health Checks**: Configure proper health and readiness probes
4. **Resource Monitoring**: Monitor memory and CPU usage
5. **Graceful Shutdown**: Server handles SIGTERM for clean shutdowns
6. **Circuit Breakers**: Built-in failure handling for external integrations

### Security Features

#### Headers
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY` 
- `X-XSS-Protection: 1; mode=block`
- Request ID tracking for audit trails

#### Input Validation
- YAML validation for apply operations
- Parameter sanitization for all endpoints
- Resource name validation
- Namespace isolation enforcement

#### RBAC Integration
- Kubernetes RBAC enforcement
- Custom role definitions supported
- Group-based permission mapping
- Audit logging for all operations

---

This documentation covers all aspects of the Kubernetes Admin Dashboard backend API. The backend is actively developed with regular feature additions and improvements.

## Additional Resources

- **Repository**: [Kaptn](https://github.com/aaronlmathis/Kaptn)
- **Configuration Guide**: See `config.example.yaml` for full configuration options
- **Deployment**: Check `deploy/` directory for Kubernetes manifests
- **Development**: See `docs/development.md` for development setup
- **Testing**: Review `docs/testing.md` for testing procedures

## Feature Roadmap

The API is continuously evolving with new features:

- **Current**: Full CRUD operations, real-time streaming, analytics integration
- **Planned**: Custom Resource Definitions (CRDs), extended RBAC, audit logging enhancements
- **Future**: Multi-cluster support, advanced alerting, plugin system

For questions, issues, or feature requests, please refer to the project repository or contact the development team.

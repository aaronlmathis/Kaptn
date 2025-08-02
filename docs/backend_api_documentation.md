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

### Required Environment Variables

The backend reads configuration from environment variables or `config.yaml`:

| Variable | Default | Description |
|----------|---------|-------------|
| `KAD_SERVER_ADDR` | `0.0.0.0:8080` | Server bind address |
| `KAD_AUTH_MODE` | `none` | Authentication mode: `none`, `header`, `oidc` |
| `KAD_KUBE_MODE` | `kubeconfig` | Kubernetes mode: `kubeconfig`, `incluster` |
| `KAD_LOG_LEVEL` | `info` | Log level: `debug`, `info`, `warn`, `error` |

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
    audience: ""
    jwks_url: ""

kubernetes:
  mode: "kubeconfig"  # or "incluster"
  kubeconfig_path: ""
  namespace_default: "default"

features:
  enable_apply: true
  enable_nodes_actions: true

rate_limits:
  apply_per_minute: 10
  actions_per_minute: 20

logging:
  level: "info"
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
  "id": "user123",
  "email": "user@example.com",
  "name": "John Doe",
  "groups": ["admin", "developers"],
  "claims": {}
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
GET /api/v1/nodes
Authorization: Bearer <token>  # if auth enabled
```

**Response**:
```json
[
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
    "creationTimestamp": "2025-08-01T10:00:00Z"
  }
]
```

#### Cordon Node
```http
POST /api/v1/nodes/{nodeName}/cordon
Authorization: Bearer <token>
```

**Response**:
```json
{
  "success": true,
  "message": "Node node-1 cordoned successfully"
}
```

#### Uncordon Node
```http
POST /api/v1/nodes/{nodeName}/uncordon
Authorization: Bearer <token>
```

**Response**:
```json
{
  "success": true,
  "message": "Node node-1 uncordoned successfully"
}
```

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
  "jobId": "drain-job-abc123",
  "message": "Drain operation started",
  "status": "running"
}
```

### Pod Management

#### List Pods
```http
GET /api/v1/pods?namespace={namespace}&node={nodeName}&labelSelector={selector}&fieldSelector={selector}&page={page}&pageSize={pageSize}
Authorization: Bearer <token>
```

**Query Parameters**:
- `namespace` (optional): Filter by namespace
- `node` (optional): Filter by node name
- `labelSelector` (optional): Kubernetes label selector
- `fieldSelector` (optional): Kubernetes field selector
- `page` (optional): Page number for pagination
- `pageSize` (optional): Number of items per page

**Response**:
```json
[
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
]
```

#### Get Pod Details
```http
GET /api/v1/pods/{namespace}/{name}
Authorization: Bearer <token>
```

**Response**: Full Kubernetes Pod object

#### Delete Pod
```http
DELETE /api/v1/pods/{namespace}/{name}
Authorization: Bearer <token>
```

**Response**:
```json
{
  "success": true,
  "message": "Pod deleted successfully"
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

**Response**: Array of Kubernetes Namespace objects

#### List Services
```http
GET /api/v1/services
GET /api/v1/services/{namespace}
Authorization: Bearer <token>
```

**Response**: Array of Kubernetes Service objects

#### List Ingresses
```http
GET /api/v1/ingresses/{namespace}
Authorization: Bearer <token>
```

**Response**: Array of Kubernetes Ingress objects

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

### Job Tracking

#### Get Job Status
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
    return apiClient.get<AuthUser>('/auth/me');
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

### Long-Running Operations

Operations like node drain return a job ID for tracking:

```typescript
// Start operation
const { jobId } = await k8sService.drainNode('node-1');

// Poll for completion
const pollJob = async (jobId: string): Promise<JobResult> => {
  const job = await apiClient.get(`/jobs/${jobId}`);
  
  if (job.status === 'running') {
    await new Promise(resolve => setTimeout(resolve, 1000));
    return pollJob(jobId);
  }
  
  return job;
};

const result = await pollJob(jobId);
```

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

---

This documentation covers all aspects of the Kubernetes Admin Dashboard backend API. For additional questions or issues, refer to the project repository or contact the development team.

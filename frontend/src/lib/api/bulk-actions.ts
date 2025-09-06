// API service for bulk actions
export interface BulkActionTarget {
  namespace?: string
  name: string
}

export interface BulkActionRequest {
  action: string
  targets: BulkActionTarget[]
  params?: Record<string, unknown>
  dry_run?: boolean
  force_confirm?: boolean
}

export interface BulkActionResponse {
  success: boolean
  request_id: string
  message: string
  resources_affected: number
  resources_total: number
  details?: Record<string, unknown>
  requires_confirmation?: boolean
  safety_violations?: Array<{
    rule: string
    description: string
    severity: "warning" | "error" | "critical"
    namespace?: string
    resource?: string
  }>
  warnings?: string[]
}

import { apiClient } from '../api-client'

class BulkActionsApi {
  private baseUrl = '/api/v1/actions'

  async executeBulkAction(resource: string, request: BulkActionRequest): Promise<BulkActionResponse> {
    const generic = this.toGenericRequest(resource, request)
    // Route through shared ApiClient for consistent cookies, CSRF, and 401 refresh
    const data = await apiClient.post<any>(`/actions`, generic)
    return this.fromGenericData(data)
  }

  async validateAction(resource: string, request: BulkActionRequest): Promise<BulkActionResponse> {
    const generic = this.toGenericRequest(resource, request)
    // Route through shared ApiClient for consistent cookies, CSRF, and 401 refresh
    const data = await apiClient.post<any>(`/actions/validate`, generic)
    return this.fromGenericData(data)
  }

  // Map legacy request to generic single-endpoint request
  private toGenericRequest(resource: string, req: BulkActionRequest): any {
    const { apiVersion, kind } = this.mapResource(resource)
    const action = this.mapAction(req.action)
    const resources = (req.targets || []).map(t => ({ apiVersion, kind, namespace: t.namespace, name: t.name }))
    const params = { ...(req.params || {}) }
    // Map known legacy params if needed
    return {
      action,
      dryRun: !!req.dry_run,
      resources,
      params,
    }
  }

  // Convert new generic response into legacy BulkActionResponse for minimal UI changes
  private fromGenericData(data: any): BulkActionResponse {
    const total = data?.summary?.total ?? (Array.isArray(data?.results) ? data.results.length : 0)
    const affected = data?.summary?.ok ?? 0
    const warnings: string[] = Array.isArray(data?.results)
      ? data.results.flatMap((r: any) => Array.isArray(r.warnings) ? r.warnings : [])
      : []
    return {
      success: (data?.summary?.error ?? 0) === 0,
      request_id: data?.requestId ?? '',
      message: `Action ${data?.action ?? ''} (${affected}/${total})`,
      resources_affected: affected,
      resources_total: total,
      details: data,
      requires_confirmation: false,
      warnings,
    }
  }

  private mapResource(resource: string): { apiVersion: string; kind: string } {
    switch (resource.toLowerCase()) {
      case 'pods': return { apiVersion: 'v1', kind: 'Pod' }
      case 'deployments': return { apiVersion: 'apps/v1', kind: 'Deployment' }
      case 'services': return { apiVersion: 'v1', kind: 'Service' }
      case 'configmaps': return { apiVersion: 'v1', kind: 'ConfigMap' }
      case 'secrets': return { apiVersion: 'v1', kind: 'Secret' }
      case 'daemonsets': return { apiVersion: 'apps/v1', kind: 'DaemonSet' }
      case 'statefulsets': return { apiVersion: 'apps/v1', kind: 'StatefulSet' }
      case 'cronjobs': return { apiVersion: 'batch/v1', kind: 'CronJob' }
      case 'nodes': return { apiVersion: 'v1', kind: 'Node' }
      default: return { apiVersion: 'v1', kind: resource }
    }
  }

  private mapAction(legacy: string): string {
    switch (legacy) {
      case 'restart-pods':
      case 'restart-deployments':
        return 'restart'
      case 'delete-pods':
      case 'delete-deployments':
      case 'delete-secrets':
        return 'delete'
      case 'scale-deployments':
        return 'scale'
      case 'export-yaml':
        return 'export-yaml'
      case 'view-secrets':
        return 'export-yaml'
      case 'edit-secrets':
        return 'patch'
      default:
        return legacy
    }
  }

  private getCSRFToken(): string | null {
    if (typeof document === 'undefined') return null
    const name = 'kaptn_csrf='
    const cookies = decodeURIComponent(document.cookie).split(';')
    for (let c of cookies) {
      c = c.trim()
      if (c.indexOf(name) === 0) return c.substring(name.length)
    }
    return null
  }

  // Resource-specific methods
  async restartPods(targets: BulkActionTarget[], forceConfirm = false): Promise<BulkActionResponse> {
    return this.executeBulkAction('pods', {
      action: 'restart-pods',
      targets,
      force_confirm: forceConfirm,
    })
  }

  async deletePods(targets: BulkActionTarget[], forceConfirm = false): Promise<BulkActionResponse> {
    return this.executeBulkAction('pods', {
      action: 'delete-pods',
      targets,
      force_confirm: forceConfirm,
    })
  }

  async getPodLogs(targets: BulkActionTarget[]): Promise<BulkActionResponse> {
    return this.executeBulkAction('pods', {
      action: 'get-logs',
      targets,
    })
  }

  async describePods(targets: BulkActionTarget[]): Promise<BulkActionResponse> {
    return this.executeBulkAction('pods', {
      action: 'describe-pods',
      targets,
    })
  }

  async exportPodsYaml(targets: BulkActionTarget[]): Promise<BulkActionResponse> {
    return this.executeBulkAction('pods', {
      action: 'export-yaml',
      targets,
    })
  }

  async restartDeployments(targets: BulkActionTarget[], forceConfirm = false): Promise<BulkActionResponse> {
    return this.executeBulkAction('deployments', {
      action: 'restart-deployments',
      targets,
      force_confirm: forceConfirm,
    })
  }

  async deleteDeployments(targets: BulkActionTarget[], forceConfirm = false): Promise<BulkActionResponse> {
    return this.executeBulkAction('deployments', {
      action: 'delete-deployments',
      targets,
      force_confirm: forceConfirm,
    })
  }

  async scaleDeployments(targets: BulkActionTarget[], replicas: number, forceConfirm = false): Promise<BulkActionResponse> {
    return this.executeBulkAction('deployments', {
      action: 'scale-deployments',
      targets,
      params: { replicas },
      force_confirm: forceConfirm,
    })
  }

  async deleteSecrets(targets: BulkActionTarget[], forceConfirm = false): Promise<BulkActionResponse> {
    return this.executeBulkAction('secrets', {
      action: 'delete-secrets',
      targets,
      force_confirm: forceConfirm,
    })
  }

  async viewSecrets(targets: BulkActionTarget[]): Promise<BulkActionResponse> {
    return this.executeBulkAction('secrets', {
      action: 'view-secrets',
      targets,
    })
  }

  async editSecrets(targets: BulkActionTarget[], forceConfirm = false): Promise<BulkActionResponse> {
    return this.executeBulkAction('secrets', {
      action: 'edit-secrets',
      targets,
      force_confirm: forceConfirm,
    })
  }
}

export const bulkActionsApi = new BulkActionsApi()

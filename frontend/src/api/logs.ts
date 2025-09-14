import { apiClient } from "@/lib/api-client"

export type LogEntry = {
  ts: string
  level: string
  cluster: string
  namespace: string
  workload: string
  pod: string
  container: string
  node: string
  msg: string
  trace_id?: string
  span_id?: string
}

export type GetLogsParams = {
  cluster?: string
  namespace?: string
  workload?: string
  pod?: string
  levels?: string[]
  q?: string
  since?: string // duration like "15m" or RFC3339
  until?: string // RFC3339
  limit?: number
  direction?: "forward" | "backward"
}

export type GetLogsResponse = {
  data: LogEntry[]
  count: number
}

export async function getLogs(params: GetLogsParams): Promise<GetLogsResponse> {
  const query = new URLSearchParams()
  if (params.cluster) query.set("cluster", params.cluster)
  if (params.namespace) query.set("namespace", params.namespace)
  if (params.workload) query.set("workload", params.workload)
  if (params.pod) query.set("pod", params.pod)
  if (params.levels && params.levels.length) query.set("levels", params.levels.join(","))
  if (params.q) query.set("q", params.q)
  if (params.since) query.set("since", params.since)
  if (params.until) query.set("until", params.until)
  if (params.limit) query.set("limit", String(params.limit))
  if (params.direction) query.set("direction", params.direction)

  const res = await apiClient.get<GetLogsResponse>(`/logs?${query.toString()}`)
  return res
}

export type StartLogStreamRequest = {
  selector: {
    namespace?: string
    namespaces?: string[]
    label_selector?: Record<string, string>
    field_selector?: Record<string, string>
  }
  container?: string
  sinceSeconds?: number
  tailLines?: number
  follow: boolean
  timestamps: boolean
  previous: boolean
}

export type StartLogStreamResponse = {
  streamId: string
  startedAt: string
  podCount: number
  websocketUrl: string
}

export async function startLogStream(body: StartLogStreamRequest): Promise<StartLogStreamResponse> {
  const resp = await apiClient.post<StartLogStreamResponse>(`/logs/stream`, body)
  try {
    const dbgOn = (import.meta as any)?.env?.DEV || (typeof window !== 'undefined' && (window as any).__KAPTN_DEBUG__)
    if (dbgOn) console.debug('[api/logs] startLogStream ->', resp)
  } catch { /* noop */ }
  return resp
}

export async function stopLogStream(streamId: string): Promise<{ success: boolean }>{
  return apiClient.delete<{ success: boolean }>(`/logs/stream/${encodeURIComponent(streamId)}`)
}

export function buildWebSocketUrl(rawUrl: string): string {
  // Ensure scheme matches current page protocol
  try {
    const url = new URL(rawUrl, window.location.href)
    // Normalize duplicate slashes in path
    url.pathname = url.pathname.replace(/\/{2,}/g, '/')
    if (window.location.protocol === 'https:' && url.protocol === 'ws:') {
      url.protocol = 'wss:'
    }
    if (window.location.protocol === 'http:' && url.protocol === 'wss:') {
      url.protocol = 'ws:'
    }
    try {
      const dbgOn = (import.meta as any)?.env?.DEV || (typeof window !== 'undefined' && (window as any).__KAPTN_DEBUG__)
      if (dbgOn) console.debug('[api/logs] buildWebSocketUrl ->', { rawUrl, out: url.toString() })
    } catch { /* noop */ }
    return url.toString()
  } catch {
    // Fallback: prefix with current host
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const normalized = rawUrl.startsWith('//') ? rawUrl.replace(/^\/+/, '/') : rawUrl
    const out = `${protocol}//${window.location.host}${normalized}`
    try {
      const dbgOn = (import.meta as any)?.env?.DEV || (typeof window !== 'undefined' && (window as any).__KAPTN_DEBUG__)
      if (dbgOn) console.debug('[api/logs] buildWebSocketUrl (fallback) ->', { rawUrl, out })
    } catch { /* noop */ }
    return out
  }
}

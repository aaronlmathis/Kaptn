import { toast } from 'sonner'

type ActionResult = {
  ref?: {
    apiVersion?: string
    kind?: string
    namespace?: string
    name?: string
  }
  status?: 'ok' | 'error' | 'skipped' | string
  httpStatus?: number
  message?: string
  warnings?: string[]
}

type ActionSummary = {
  ok?: number
  error?: number
  skipped?: number
  total?: number
}

export interface ActionNotifyOptions {
  showSummary?: boolean
  showPerItem?: boolean
  maxItemToasts?: number
}

/**
 * Show Sonner toasts for bulk action responses.
 * Accepts either the raw backend payload (with results/summary) or
 * a wrapper object having { details: { results, summary, action } }.
 */
export function notifyActionResults(data: any, opts?: ActionNotifyOptions) {
  const options: Required<ActionNotifyOptions> = {
    showSummary: true,
    showPerItem: true,
    maxItemToasts: 10,
    ...(opts || {}),
  }

  if (!data) return

  const payload = data?.details && (data.details.results || data.details.summary)
    ? data.details
    : data

  const action: string | undefined = payload?.action
  const results: ActionResult[] = Array.isArray(payload?.results) ? payload.results : []
  const summary: ActionSummary | undefined = payload?.summary

  // Show a compact summary first
  if (options.showSummary && (summary || results.length > 0)) {
    const ok = summary?.ok ?? results.filter(r => (r.status || '').toLowerCase() === 'ok').length
    const error = summary?.error ?? results.filter(r => (r.status || '').toLowerCase() === 'error').length
    const skipped = summary?.skipped ?? results.filter(r => (r.status || '').toLowerCase() === 'skipped').length
    const total = summary?.total ?? results.length

    const title = action ? `${action} results` : 'Action results'
    const desc = `${ok} ok, ${skipped} skipped, ${error} error${error !== 1 ? 's' : ''} (${total} total)`

    if (error > 0) {
      toast.error(title, { description: desc })
    } else if (skipped > 0) {
      toast.warning(title, { description: desc })
    } else {
      toast.success(title, { description: desc })
    }
  }

  // Then show per-item toasts (capped)
  if (options.showPerItem && results.length > 0) {
    const limit = Math.max(0, options.maxItemToasts)
    const showCount = limit === 0 ? 0 : Math.min(results.length, limit)

    for (let i = 0; i < showCount; i++) {
      const r = results[i]
      const ref = r.ref || {}
      const refStr = `${ref.kind ?? ''}/${ref.name ?? ''}${ref.namespace ? ` (${ref.namespace})` : ''}`.trim()
      const msg = r.message || (r.status ? r.status.toString() : 'Completed')
      const http = r.httpStatus ? ` [HTTP ${r.httpStatus}]` : ''
      const description = [msg + http, ...(Array.isArray(r.warnings) ? r.warnings : [])]
        .filter(Boolean)
        .join('\n• ')

      switch ((r.status || '').toLowerCase()) {
        case 'ok':
          toast.success(refStr || 'OK', { description })
          break
        case 'skipped':
          toast.warning(refStr || 'Skipped', { description })
          break
        case 'error':
        default:
          toast.error(refStr || 'Error', { description })
          break
      }
    }

    if (showCount < results.length) {
      const remaining = results.length - showCount
      toast.info('More results not shown', { description: `${remaining} additional item${remaining === 1 ? '' : 's'}...` })
    }
  }
}


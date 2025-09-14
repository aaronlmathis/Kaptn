"use client"

import * as React from "react"
import { buildWebSocketUrl, startLogStream, stopLogStream, type LogEntry, type StartLogStreamRequest } from "@/api/logs"

type StreamState = {
  status: "idle" | "starting" | "connected" | "degraded" | "error"
  error?: string
  streamId?: string
  podCount?: number
}

export function useLogStream() {
  const [entries, setEntries] = React.useState<LogEntry[]>([])
  const [state, setState] = React.useState<StreamState>({ status: "idle" })
  const wsRef = React.useRef<WebSocket | null>(null)

  // Debug helper (enabled in dev or when window.__KAPTN_DEBUG__ is truthy)
  const debugEnabled = (import.meta as any)?.env?.DEV || (typeof window !== 'undefined' && (window as any).__KAPTN_DEBUG__)
  const dbg = (...args: unknown[]) => { if (debugEnabled) console.debug('[useLogStream]', ...args) }

  const start = React.useCallback(async (req: StartLogStreamRequest, opts?: { since?: string; limit?: number }) => {
    try {
      dbg('start() called with request:', req)
      setState({ status: "starting" })
      const resp = await startLogStream(req)
      dbg('startLogStream response:', resp)
      let rawWsUrl = resp.websocketUrl
      // Append since/limit to WS URL so server backfill (logs.init) matches the UI window
      const qp: string[] = []
      if (opts?.since) qp.push(`since=${encodeURIComponent(opts.since)}`)
      if (opts?.limit) qp.push(`limit=${opts.limit}`)
      if (qp.length) rawWsUrl += (rawWsUrl.includes('?') ? '&' : '?') + qp.join('&')
      const wsUrl = buildWebSocketUrl(rawWsUrl)
      dbg('resolved WebSocket URL:', wsUrl)
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        dbg('WebSocket onopen for streamId:', resp.streamId)
        setState({ status: "connected", streamId: resp.streamId, podCount: resp.podCount })
      }

      ws.onmessage = (ev) => {
        dbg('WebSocket onmessage raw:', typeof ev.data, (typeof ev.data === 'string' ? ev.data.slice(0, 200) : ev.data))
        try {
          const msg = JSON.parse(ev.data)
          dbg('WebSocket parsed message:', msg?.type, msg)
          switch (msg.type) {
            case "logs.init":
              if (Array.isArray(msg.data)) {
                dbg('logs.init entries:', msg.data.length)
                setEntries(msg.data)
              }
              break
            case "logs":
              if (msg.data) {
                dbg('logs single entry received')
                setEntries(prev => [...prev, msg.data as LogEntry])
              }
              break
            case "logs.batch":
              if (Array.isArray(msg.data)) {
                dbg('logs.batch entries:', msg.data.length)
                setEntries(prev => [...prev, ...msg.data as LogEntry[]])
              }
              break
            case "logs.degraded":
              dbg('stream degraded')
              setState(s => ({ ...s, status: "degraded" }))
              break
            case "logs.normal":
              dbg('stream back to normal')
              setState(s => ({ ...s, status: "connected" }))
              break
            default:
              dbg('unhandled WS message type:', msg?.type)
          }
        } catch (e) {
          // ignore parsing error
          dbg('failed to parse WS message', e)
        }
      }

      ws.onerror = () => {
        dbg('WebSocket onerror')
        setState(s => ({ ...s, status: "error", error: "WebSocket error" }))
      }

      ws.onclose = (ev) => {
        dbg('WebSocket onclose', { code: ev.code, reason: ev.reason, wasClean: ev.wasClean })
        setState({ status: "idle" })
      }

      return resp
    } catch (e: any) {
      dbg('start() failed', e)
      setState({ status: "error", error: e?.message ?? String(e) })
      throw e
    }
  }, [])

  const stop = React.useCallback(async () => {
    dbg('stop() called, current state:', state)
    const ws = wsRef.current
    wsRef.current = null
    if (ws && ws.readyState === WebSocket.OPEN) {
      dbg('closing WebSocket...')
      ws.close()
    }
    if (state.streamId) {
      try {
        dbg('stopping server-side stream:', state.streamId)
        await stopLogStream(state.streamId)
      } catch (err) {
        dbg('stopLogStream failed (ignoring):', err)
      }
    }
    setState({ status: "idle" })
  }, [state.streamId])

  React.useEffect(() => () => {
    if (wsRef.current) {
      dbg('cleanup effect closing WebSocket')
      wsRef.current.close()
    }
  }, [])

  return { entries, state, start, stop, setEntries }
}

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

  const start = React.useCallback(async (req: StartLogStreamRequest) => {
    try {
      setState({ status: "starting" })
      const resp = await startLogStream(req)
      const wsUrl = buildWebSocketUrl(resp.websocketUrl)
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        setState({ status: "connected", streamId: resp.streamId, podCount: resp.podCount })
      }

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data)
          switch (msg.type) {
            case "logs.init":
              if (Array.isArray(msg.data)) {
                setEntries(msg.data)
              }
              break
            case "logs":
              if (msg.data) {
                setEntries(prev => [...prev, msg.data as LogEntry])
              }
              break
            case "logs.batch":
              if (Array.isArray(msg.data)) {
                setEntries(prev => [...prev, ...msg.data as LogEntry[]])
              }
              break
            case "logs.degraded":
              setState(s => ({ ...s, status: "degraded" }))
              break
            case "logs.normal":
              setState(s => ({ ...s, status: "connected" }))
              break
          }
        } catch (e) {
          // ignore parsing error
        }
      }

      ws.onerror = () => {
        setState(s => ({ ...s, status: "error", error: "WebSocket error" }))
      }

      ws.onclose = () => {
        setState({ status: "idle" })
      }

      return resp
    } catch (e: any) {
      setState({ status: "error", error: e?.message ?? String(e) })
      throw e
    }
  }, [])

  const stop = React.useCallback(async () => {
    const ws = wsRef.current
    wsRef.current = null
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.close()
    }
    if (state.streamId) {
      try { await stopLogStream(state.streamId) } catch { /* noop */ }
    }
    setState({ status: "idle" })
  }, [state.streamId])

  React.useEffect(() => () => { if (wsRef.current) { wsRef.current.close() } }, [])

  return { entries, state, start, stop, setEntries }
}


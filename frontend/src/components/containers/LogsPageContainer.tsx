"use client"

import * as React from "react"
import { getLogs, type GetLogsParams, type LogEntry } from "@/api/logs"
import { useLogStream } from "@/hooks/useLogStream"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { IconPlayerPlay, IconPlayerStop, IconDownload, IconSearch } from "@tabler/icons-react"

export function LogsPageContainer() {
  const [namespace, setNamespace] = React.useState("")
  const [pod, setPod] = React.useState("")
  const [levels, setLevels] = React.useState<string>("")
  const [q, setQ] = React.useState("")
  const [since, setSince] = React.useState("15m")
  const [limit, setLimit] = React.useState(1000)
  const [entries, setEntries] = React.useState<LogEntry[]>([])
  const [loading, setLoading] = React.useState(false)
  const { entries: liveEntries, state, start, stop, setEntries: setLiveEntries } = useLogStream()

  // Merge live entries into display when streaming
  const displayed = state.status === "connected" || state.status === "degraded" ? liveEntries : entries

  React.useEffect(() => {
    const sp = new URLSearchParams(window.location.search)
    const ns = sp.get("namespace") || ""
    const p = sp.get("pod") || ""
    const lv = sp.get("levels") || ""
    const text = sp.get("q") || ""
    const sn = sp.get("since") || "15m"
    const lim = parseInt(sp.get("limit") || "1000", 10)
    setNamespace(ns)
    setPod(p)
    setLevels(lv)
    setQ(text)
    setSince(sn)
    setLimit(isNaN(lim) ? 1000 : lim)
    // Initial fetch
    handleSearch(ns, p, lv, text, sn, isNaN(lim) ? 1000 : lim).catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSearch(ns = namespace, p = pod, lv = levels, text = q, sn = since, lm = limit) {
    const params: GetLogsParams = {
      namespace: ns || undefined,
      pod: p || undefined,
      levels: lv ? lv.split(",").map(s => s.trim()).filter(Boolean) : undefined,
      q: text || undefined,
      since: sn || undefined,
      limit: lm || undefined,
      direction: "backward",
    }
    setLoading(true)
    try {
      const res = await getLogs(params)
      setEntries(res.data || [])
      // If streaming was active, reset live list too
      setLiveEntries(res.data || [])
    } catch (e) {
      // noop error display for now
    } finally {
      setLoading(false)
    }
  }

  async function handleFollow() {
    if (state.status === "connected" || state.status === "degraded") {
      await stop()
      return
    }
    const body = {
      selector: namespace ? { namespace } : { namespaces: [] },
      container: undefined,
      sinceSeconds: undefined,
      tailLines: undefined,
      follow: true,
      timestamps: true,
      previous: false,
    }
    // Clear live entries and start
    setLiveEntries(entries)
    await start(body)
  }

  function formatEntry(e: LogEntry) {
    return `${new Date(e.ts).toLocaleTimeString()} [${e.level}] ${e.namespace}/${e.pod} ${e.container} - ${e.msg}`
  }

  function onExport(format: "csv" | "json") {
    const params = new URLSearchParams()
    if (namespace) params.set("namespace", namespace)
    if (pod) params.set("pod", pod)
    if (levels) params.set("levels", levels)
    if (q) params.set("q", q)
    if (since) params.set("since", since)
    if (limit) params.set("limit", String(limit))
    const url = `/api/v1/logs/export?${params.toString()}&format=${format}`
    const a = document.createElement('a')
    a.href = url
    a.download = `logs.${format === 'csv' ? 'csv' : 'json'}`
    a.click()
  }

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col">
          <label className="text-xs text-muted-foreground">Namespace</label>
          <Input value={namespace} onChange={e => setNamespace(e.target.value)} placeholder="default" className="w-48" />
        </div>
        <div className="flex flex-col">
          <label className="text-xs text-muted-foreground">Pod (optional)</label>
          <Input value={pod} onChange={e => setPod(e.target.value)} placeholder="mypod-abc" className="w-56" />
        </div>
        <div className="flex flex-col">
          <label className="text-xs text-muted-foreground">Levels (comma)</label>
          <Input value={levels} onChange={e => setLevels(e.target.value)} placeholder="INFO,ERROR" className="w-40" />
        </div>
        <div className="flex flex-col">
          <label className="text-xs text-muted-foreground">Search</label>
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="text..." className="w-56" />
        </div>
        <div className="flex flex-col">
          <label className="text-xs text-muted-foreground">Since</label>
          <Input value={since} onChange={e => setSince(e.target.value)} placeholder="15m or RFC3339" className="w-40" />
        </div>
        <div className="flex flex-col">
          <label className="text-xs text-muted-foreground">Limit</label>
          <Input value={limit} onChange={e => setLimit(parseInt(e.target.value || "0", 10) || 1000)} className="w-28" />
        </div>
        <Button onClick={() => handleSearch()} disabled={loading} className="flex gap-1">
          <IconSearch className="size-4" /> Search
        </Button>
        <Button onClick={handleFollow} variant={state.status === "connected" || state.status === "degraded" ? "secondary" : "default"} className="flex gap-1">
          {state.status === "connected" || state.status === "degraded" ? <IconPlayerStop className="size-4" /> : <IconPlayerPlay className="size-4" />}
          {state.status === "connected" || state.status === "degraded" ? "Stop" : "Follow"}
        </Button>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" onClick={() => onExport("json")} className="flex gap-1"><IconDownload className="size-4" /> JSON</Button>
          <Button variant="outline" onClick={() => onExport("csv")} className="flex gap-1"><IconDownload className="size-4" /> CSV</Button>
        </div>
      </div>

      {(state.status === "degraded") && (
        <div className="text-sm"><Badge variant="outline">Degraded</Badge> Streaming in batch mode</div>
      )}

      <div className="border rounded-md p-2 h-[60vh] overflow-auto bg-background text-sm font-mono">
        {displayed.length === 0 && <div className="text-muted-foreground">No logs</div>}
        {displayed.map((e, i) => (
          <div key={i} className="whitespace-pre-wrap break-words">{formatEntry(e)}</div>
        ))}
      </div>
    </div>
  )
}


"use client"

import * as React from "react"
import { RouteGuard } from "@/components/authz"
import { UniversalDataTable } from "@/components/data_tables/UniversalDataTable"
import { type FilterOption } from "@/components/ui/data-table-filters"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { type ColumnDef } from "@/lib/table"
import { getLogs, type GetLogsParams, type LogEntry } from "@/api/logs"
import { useLogStream } from "@/hooks/useLogStream"
import { SummaryCards, type SummaryCard } from "@/components/SummaryCards"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { IconDownload, IconRefresh, IconCircleCheckFilled, IconAlertTriangle, IconClock, IconFileText } from "@tabler/icons-react"
import { LiveDataStatusBadge } from "@/components/badges/LiveDataStatus"
import { cn } from "@/lib/utils"
import { useNamespace } from "@/contexts/namespace-context"

type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR" | "FATAL"

const LOG_LEVEL_COLORS: Record<LogLevel, string> = {
  DEBUG: "text-muted-foreground",
  INFO: "text-blue-600",
  WARN: "text-yellow-600",
  ERROR: "text-red-600",
  FATAL: "text-red-800 font-bold"
}

// Inner component that can access the namespace context
function LogsContent() {
  const { namespaces } = useNamespace()

  // Filter states
  const [globalFilter, setGlobalFilter] = React.useState("")
  const [levelFilter, setLevelFilter] = React.useState<string>("all")
  const [namespaceFilter, setNamespaceFilter] = React.useState("all")
  const [sinceFilter, setSinceFilter] = React.useState("15m")
  const [limitFilter, setLimitFilter] = React.useState(1000)

  // Data states
  const [entries, setEntries] = React.useState<LogEntry[]>([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [alert, setAlert] = React.useState<null | { variant: 'success' | 'error', title: string, description?: string }>(null)

  // WebSocket streaming
  const { entries: liveEntries, state: streamState, setEntries: setLiveEntries } = useLogStream()

  // Determine displayed data: live entries when streaming, static entries otherwise
  const displayedEntries = React.useMemo(() => {
    return (streamState.status === "connected" || streamState.status === "degraded") ? liveEntries : entries
  }, [streamState.status, liveEntries, entries])

  const levelOptions: FilterOption[] = React.useMemo(() => {
    const levels = Array.from(new Set(displayedEntries.map(e => e.level))).filter(Boolean).sort()
    return levels.map(level => ({
      value: level,
      label: level,
      badge: <Badge
        variant="outline"
        className={cn("font-mono text-xs", LOG_LEVEL_COLORS[level as LogLevel] || "text-foreground")}
      >
        {level}
      </Badge>
    }))
  }, [displayedEntries])

  // Parse URL parameters on mount and auto-search when filters change
  React.useEffect(() => {
    const sp = new URLSearchParams(window.location.search)
    const ns = sp.get("namespace") || "all"
    const levels = sp.get("levels") || ""
    const q = sp.get("q") || ""
    const since = sp.get("since") || "15m"
    const limit = parseInt(sp.get("limit") || "1000", 10)

    setNamespaceFilter(ns)
    if (levels) setLevelFilter(levels)
    setGlobalFilter(q)
    setSinceFilter(since)
    setLimitFilter(isNaN(limit) ? 1000 : limit)

    // Initial fetch
    handleSearch(ns, "", levels, q, since, isNaN(limit) ? 1000 : limit).catch(() => { })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-search when filters change (debounced)
  React.useEffect(() => {
    const timeoutId = setTimeout(() => {
      if ((namespaceFilter && namespaceFilter !== "all") || levelFilter !== "all" || sinceFilter !== "15m" || limitFilter !== 1000) {
        handleSearch().catch(() => { })
      }
    }, 500) // 500ms debounce

    return () => clearTimeout(timeoutId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [namespaceFilter, levelFilter, sinceFilter, limitFilter])

  // Generate summary cards from log data
  const summaryData: SummaryCard[] = React.useMemo(() => {
    if (!displayedEntries || displayedEntries.length === 0) {
      return [
        {
          title: "Total Logs",
          value: 0,
          subtitle: "No logs found"
        },
        {
          title: "Pods",
          value: 0,
          subtitle: "0 unique pods"
        },
        {
          title: "Errors",
          value: 0,
          subtitle: "0 error logs"
        },
        {
          title: "Latest",
          value: "-",
          subtitle: "No recent logs"
        }
      ]
    }

    const totalLogs = displayedEntries.length
    const uniquePods = new Set(displayedEntries.map(e => e.pod)).size
    const errorLogs = displayedEntries.filter(e => e.level === 'ERROR' || e.level === 'FATAL').length
    const warnLogs = displayedEntries.filter(e => e.level === 'WARN').length
    const latestLog = displayedEntries[0]?.ts ? new Date(displayedEntries[0].ts) : null

    return [
      {
        title: "Total Logs",
        value: totalLogs,
        subtitle: `${uniquePods} unique pods`,
        badge: totalLogs > 0 ? <Badge variant="outline" className="text-blue-600 border-border bg-transparent px-1.5">
          <IconCircleCheckFilled className="size-3 fill-blue-600 mr-1" />
          {totalLogs}
        </Badge> : undefined,
        footer: streamState.status === "connected" ? "Live streaming" : "Historical data"
      },
      {
        title: "Unique Pods",
        value: uniquePods,
        subtitle: `From ${new Set(displayedEntries.map(e => e.namespace)).size} namespaces`,
        footer: uniquePods > 0 ? "Active log sources" : "No active sources"
      },
      {
        title: "Error Logs",
        value: errorLogs,
        subtitle: warnLogs > 0 ? `${warnLogs} warnings` : "No warnings",
        badge: errorLogs > 0 ? <Badge variant="outline" className="text-red-600 border-border bg-transparent px-1.5">
          <IconAlertTriangle className="size-3 text-red-600 mr-1" />
          {errorLogs}
        </Badge> : <Badge variant="outline" className="text-green-600 border-border bg-transparent px-1.5">
          <IconCircleCheckFilled className="size-3 fill-green-600 mr-1" />
          Clean
        </Badge>,
        footer: errorLogs === 0 ? "No errors detected" : "Needs attention"
      },
      {
        title: "Latest Log",
        value: latestLog ? latestLog.toLocaleTimeString() : "-",
        subtitle: latestLog ? `${Math.round((Date.now() - latestLog.getTime()) / 1000)}s ago` : "No recent logs",
        footer: streamState.status === "connected" ? "Real-time updates" : "Static snapshot"
      }
    ]
  }, [displayedEntries, streamState.status])

  // Search and filter function
  async function handleSearch(ns = namespaceFilter, pod = "", levels = levelFilter, q = globalFilter, since = sinceFilter, limit = limitFilter) {
    const params: GetLogsParams = {
      namespace: ns && ns !== "all" ? ns : undefined,
      pod: pod || undefined,
      levels: levels && levels !== "all" ? levels.split(",").map(s => s.trim()).filter(Boolean) : undefined,
      q: q || undefined,
      since: since || undefined,
      limit: limit || undefined,
      direction: "backward",
    }

    setLoading(true)
    setError(null)
    try {
      const res = await getLogs(params)
      setEntries(res.data || [])
      // If streaming was active, reset live list too
      setLiveEntries(res.data || [])
      setAlert({ variant: 'success', title: `Loaded ${res.data?.length || 0} log entries` })
    } catch (e: unknown) {
      const errorMsg = e instanceof Error ? e.message : String(e)
      setError(errorMsg)
      setAlert({ variant: 'error', title: 'Failed to load logs', description: errorMsg })
    } finally {
      setLoading(false)
    }
  }

  // Handle export
  function handleExport(format: "csv" | "json") {
    const params = new URLSearchParams()
    if (namespaceFilter && namespaceFilter !== "all") params.set("namespace", namespaceFilter)
    if (levelFilter && levelFilter !== "all") params.set("levels", levelFilter)
    if (globalFilter) params.set("q", globalFilter)
    if (sinceFilter) params.set("since", sinceFilter)
    if (limitFilter) params.set("limit", String(limitFilter))

    const url = `/api/v1/logs/export?${params.toString()}&format=${format}`
    const a = document.createElement('a')
    a.href = url
    a.download = `logs.${format === 'csv' ? 'csv' : 'json'}`
    a.click()
  }

  // Filtered data based on global search and level filter
  const filteredEntries = React.useMemo(() => {
    const q = globalFilter.trim().toLowerCase()
    return displayedEntries.filter(entry => {
      const matchesGlobal = !q ||
        entry.msg.toLowerCase().includes(q) ||
        entry.pod.toLowerCase().includes(q) ||
        entry.namespace.toLowerCase().includes(q) ||
        entry.container.toLowerCase().includes(q) ||
        entry.node.toLowerCase().includes(q)

      const matchesLevel = levelFilter === 'all' || entry.level === levelFilter

      return matchesGlobal && matchesLevel
    })
  }, [displayedEntries, globalFilter, levelFilter])

  // Table columns
  const columns: ColumnDef<LogEntry>[] = React.useMemo(() => ([
    {
      accessorKey: "ts",
      header: "Timestamp",
      cell: ({ row }: { row: { original: LogEntry } }) => {
        const ts = row.original.ts
        return (
          <div className="font-mono text-xs text-muted-foreground whitespace-nowrap">
            {new Date(ts).toLocaleString()}
          </div>
        )
      },
      size: 160,
    },
    {
      accessorKey: "level",
      header: "Level",
      cell: ({ row }: { row: { original: LogEntry } }) => {
        const level = row.original.level as LogLevel
        return (
          <Badge
            variant="outline"
            className={cn("font-mono text-xs", LOG_LEVEL_COLORS[level] || "text-foreground")}
          >
            {level}
          </Badge>
        )
      },
      size: 80,
    },
    {
      accessorKey: "namespace",
      header: "Namespace",
      cell: ({ row }: { row: { original: LogEntry } }) => (
        <Badge variant="outline" className="text-muted-foreground px-1.5 font-mono text-xs">
          {row.original.namespace}
        </Badge>
      ),
      size: 120,
    },
    {
      accessorKey: "pod",
      header: "Pod",
      cell: ({ row }: { row: { original: LogEntry } }) => (
        <div className="font-mono text-sm truncate max-w-[200px]" title={row.original.pod}>
          {row.original.pod}
        </div>
      ),
      size: 200,
    },
    {
      accessorKey: "container",
      header: "Container",
      cell: ({ row }: { row: { original: LogEntry } }) => (
        <div className="font-mono text-sm">{row.original.container}</div>
      ),
      size: 120,
    },
    {
      accessorKey: "node",
      header: "Node",
      cell: ({ row }: { row: { original: LogEntry } }) => (
        <div className="font-mono text-sm">{row.original.node}</div>
      ),
      size: 120,
    },
    {
      accessorKey: "msg",
      header: "Message",
      cell: ({ row }: { row: { original: LogEntry } }) => (
        <div className="font-mono text-sm whitespace-pre-wrap break-words max-w-[400px]">
          {row.original.msg}
        </div>
      ),
      size: 400,
    },
  ]), [])

  // Bulk actions
  const bulkActions = React.useMemo(() => {
    const actions: { id: string, label: string, icon?: React.ReactNode, variant?: 'default' | 'destructive', requiresSelection?: boolean, action: (rows: LogEntry[]) => void | Promise<void> }[] = []

    actions.push({
      id: 'export-json',
      label: 'Export as JSON',
      icon: <IconDownload className="size-4" />,
      requiresSelection: true,
      action: async (rows) => {
        const data = JSON.stringify(rows, null, 2)
        const blob = new Blob([data], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `selected-logs-${new Date().toISOString().slice(0, 19)}.json`
        a.click()
        URL.revokeObjectURL(url)
      }
    })

    actions.push({
      id: 'export-csv',
      label: 'Export as CSV',
      icon: <IconFileText className="size-4" />,
      requiresSelection: true,
      action: async (rows) => {
        // Convert to CSV format
        const headers = ['Timestamp', 'Level', 'Namespace', 'Pod', 'Container', 'Node', 'Message']
        const csvRows = [
          headers.join(','),
          ...rows.map(row => [
            new Date(row.ts).toISOString(),
            row.level,
            row.namespace,
            row.pod,
            row.container,
            row.node,
            `"${row.msg.replace(/"/g, '""')}"` // Escape quotes in message
          ].join(','))
        ]
        const csvContent = csvRows.join('\n')
        const blob = new Blob([csvContent], { type: 'text/csv' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `selected-logs-${new Date().toISOString().slice(0, 19)}.csv`
        a.click()
        URL.revokeObjectURL(url)
      }
    })

    return actions
  }, [])

  // Add unique IDs for row selection
  const dataWithIds = React.useMemo(() =>
    filteredEntries.map((entry, index) => ({
      ...entry,
      __uid: `${entry.ts}-${entry.pod}-${entry.container}-${index}`
    })), [filteredEntries]
  )

  return (
    <div className="space-y-6">
      {/* Header with connection status */}
      <div className="px-4 lg:px-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">Logs</h1>
            </div>
            <p className="text-muted-foreground">
              Monitor and analyze log streams from your Kubernetes cluster
            </p>
          </div>
          <LiveDataStatusBadge isConnected={streamState.status === "connected"} />
        </div>
      </div>

      {/* Summary Cards */}
      <SummaryCards
        cards={summaryData}
        loading={loading}
        error={error}
      />

      <div className="px-4 lg:px-6 space-y-3">
        {alert && (
          <Alert
            className={alert.variant === 'success'
              ? 'bg-transparent border-green-600 text-green-700'
              : 'bg-transparent border-red-600 text-red-700'}
            variant='default'
          >
            <AlertTitle>{alert.title}</AlertTitle>
            {alert.description && <AlertDescription>{alert.description}</AlertDescription>}
          </Alert>
        )}

        <UniversalDataTable
          data={dataWithIds}
          columns={columns}
          enableReorder={false}
          enableRowSelection={true}
          loading={loading}
          error={error}
          className="px-0 [&_tbody_tr]:bg-background/50"
          getRowId={(row) => `${row.cluster}-${row.namespace}-${row.pod}-${row.container}-${row.ts}`}
          initialPageSize={50}
          initialSorting={[{ id: "ts", desc: true }]}
          renderFilters={({ table, selectedCount, totalCount }) => (
            <div className="space-y-4">
              {/* All Filters in One Responsive Row */}
              <div className="flex flex-wrap gap-2 items-center">
                {/* Search Input - Full width on mobile, flex-1 on larger screens */}
                <div className="relative w-full sm:flex-1 sm:min-w-[200px]">
                  <Input
                    value={globalFilter}
                    onChange={e => setGlobalFilter(e.target.value)}
                    placeholder="Search logs by message, pod, namespace, or node..."
                    className="h-8"
                  />
                </div>

                {/* Other filters - wrap to new line on mobile if needed */}
                <div className="flex flex-wrap gap-2 items-center w-full sm:w-auto">
                  {/* Level Filter */}
                  <Select value={levelFilter} onValueChange={setLevelFilter}>
                    <SelectTrigger className="w-[120px] h-8">
                      <SelectValue placeholder="Level" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Levels</SelectItem>
                      {levelOptions.map(option => (
                        <SelectItem key={option.value} value={option.value}>
                          <div className="flex items-center gap-2">
                            {option.badge}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* Namespace Filter */}
                  <Select value={namespaceFilter} onValueChange={setNamespaceFilter}>
                    <SelectTrigger className="w-40 h-8">
                      <SelectValue placeholder="Namespace..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Namespaces</SelectItem>
                      {namespaces.map(ns => (
                        <SelectItem key={ns.metadata.name} value={ns.metadata.name || ""}>
                          {ns.metadata.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* Time Period Filter */}
                  <Select value={sinceFilter} onValueChange={setSinceFilter}>
                    <SelectTrigger className="w-[100px] h-8">
                      <div className="flex items-center gap-2">
                        <IconClock className="size-4" />
                        <SelectValue />
                      </div>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="5m">5m</SelectItem>
                      <SelectItem value="15m">15m</SelectItem>
                      <SelectItem value="1h">1h</SelectItem>
                      <SelectItem value="6h">6h</SelectItem>
                      <SelectItem value="12h">12h</SelectItem>
                      <SelectItem value="24h">24h</SelectItem>
                    </SelectContent>
                  </Select>

                  {/* Limit Input */}
                  <Input
                    value={limitFilter}
                    onChange={e => setLimitFilter(parseInt(e.target.value || "0", 10) || 1000)}
                    placeholder="Limit"
                    className="w-20 h-8"
                    type="number"
                  />

                  {/* Export Buttons for all data */}
                  <Button variant="outline" onClick={() => handleExport("json")} size="sm" className="h-8">
                    <IconDownload className="size-4 mr-1" />
                    Export JSON
                  </Button>
                  <Button variant="outline" onClick={() => handleExport("csv")} size="sm" className="h-8">
                    <IconDownload className="size-4 mr-1" />
                    Export CSV
                  </Button>
                </div>
              </div>

              {/* Selection and Bulk Actions Row */}
              {selectedCount > 0 && (
                <div className="flex items-center justify-between gap-2 p-3 bg-muted/50 rounded-lg">
                  <span className="text-sm text-muted-foreground">
                    {selectedCount} of {totalCount} selected
                  </span>
                  <div className="flex items-center gap-2">
                    {bulkActions.map(action => (
                      <Button
                        key={action.id}
                        variant={action.variant || 'outline'}
                        size="sm"
                        onClick={() => action.action(table.getFilteredSelectedRowModel().rows.map((r: { original: LogEntry }) => r.original as LogEntry))}
                        className="h-8"
                      >
                        {action.icon}
                        {action.label}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          renderEmptyState={() => (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="text-muted-foreground mb-4">
                {streamState.status === "connected" || streamState.status === "degraded"
                  ? "Waiting for new logs..."
                  : "No logs found"}
              </div>
              {!(streamState.status === "connected" || streamState.status === "degraded") && (
                <Button onClick={() => handleSearch()} disabled={loading} variant="outline">
                  <IconRefresh className="size-4 mr-2" />
                  Refresh
                </Button>
              )}
            </div>
          )}
        />
      </div>
    </div>
  )
}

export function LogsPageContainer() {
  return (
    <RouteGuard
      requiredCapabilities={['pods.logs']}
      requireAll={false}
    >
      <LogsContent />
    </RouteGuard>
  )
}


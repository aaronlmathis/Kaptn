"use client"

import * as React from "react"
import { UniversalDataTable } from "@/components/data_tables/UniversalDataTable"
import { SummaryCards, type SummaryCard } from "@/components/SummaryCards"
import { RouteGuard } from "@/components/authz"
import { IfAllowed } from "@/components/authz/IfAllowed"
import { useCapabilities } from "@/hooks/use-capabilities"
import { useHPAsWithWebSocket } from "@/hooks/useHPAsWithWebSocket"
import type { DashboardHPA } from "@/types/hpa"
import { type ColumnDef } from "@/lib/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu"
import { IconEye, IconDotsVertical, IconEdit } from "@tabler/icons-react"
import { ResourceYamlEditor } from "@/components/ResourceYamlEditor"
import { useCluster } from "@/hooks/useCluster"
import { DataTableFilters, type FilterOption } from "@/components/ui/data-table-filters"
import { useAuthzCapabilitiesInContext } from "@/hooks/useAuthzCapabilitiesSimple"
import { IconTrash, IconCopy, IconDownload } from "@tabler/icons-react"

function statusBadge(status: DashboardHPA['status']) {
  switch (status) {
    case 'atMax':
      return <Badge variant="outline" className="text-orange-600 border-border bg-transparent px-1.5">At Max</Badge>
    case 'limited':
      return <Badge variant="outline" className="text-yellow-600 border-border bg-transparent px-1.5">Limited</Badge>
    case 'active':
      return <Badge variant="outline" className="text-blue-600 border-border bg-transparent px-1.5">Active</Badge>
    default:
      return <Badge variant="outline" className="text-muted-foreground border-border bg-transparent px-1.5">Idle</Badge>
  }
}

function HPAsContent() {
  const { data: hpas, loading: isLoading, error, isConnected } = useHPAsWithWebSocket(true)
  const [lastUpdated, setLastUpdated] = React.useState<string | null>(null)
  const { fetchAdditional } = useCapabilities()

  // Fetch additional capabilities for HPA actions
  React.useEffect(() => {
    fetchAdditional([
      'horizontalpodautoscalers.get',
      'horizontalpodautoscalers.update',
      'horizontalpodautoscalers.patch',
      'horizontalpodautoscalers.delete',
      'horizontalpodautoscalers.create',
      'horizontalpodautoscalers.list',
      'horizontalpodautoscalers.watch',
    ]).catch(() => { /* noop */ })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  React.useEffect(() => {
    if (hpas.length > 0) setLastUpdated(new Date().toISOString())
  }, [hpas])

  // Summary Cards
  const summaryData: SummaryCard[] = React.useMemo(() => {
    if (!hpas || hpas.length === 0) {
      return [
        { title: 'Total HPAs', value: 0, subtitle: 'No HPAs found' },
        { title: 'At Max', value: 0, subtitle: '0 constrained' },
        { title: 'Limited', value: 0, subtitle: '0 limited' },
        { title: 'Active', value: 0, subtitle: '0 scaling' },
      ]
    }
    const total = hpas.length
    const atMax = hpas.filter(h => h.status === 'atMax').length
    const limited = hpas.filter(h => h.status === 'limited').length
    const active = hpas.filter(h => h.status === 'active').length
    return [
      { title: 'Total HPAs', value: total, subtitle: `${atMax} at max, ${limited} limited` },
      { title: 'At Max', value: atMax, subtitle: `${atMax} HPAs at max replicas` },
      { title: 'Limited', value: limited, subtitle: `${limited} HPAs limited by policies` },
      { title: 'Active', value: active, subtitle: `${active} HPAs scaling` },
    ]
  }, [hpas])

  // Filters state
  const [globalFilter, setGlobalFilter] = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState<string>('all')

  const statusOptions: FilterOption[] = [
    { value: 'atMax', label: 'At Max', badge: statusBadge('atMax') },
    { value: 'limited', label: 'Limited', badge: statusBadge('limited') },
    { value: 'active', label: 'Active', badge: statusBadge('active') },
    { value: 'none', label: 'Idle', badge: statusBadge('none') },
  ]

  // Filter data client-side for now
  const filtered = React.useMemo(() => {
    const q = globalFilter.trim().toLowerCase()
    return hpas.filter(h => {
      const matchesQuery = !q || h.name.toLowerCase().includes(q) || h.namespace.toLowerCase().includes(q) || h.target.toLowerCase().includes(q)
      const matchesStatus = statusFilter === 'all' || h.status === (statusFilter as DashboardHPA['status'])
      return matchesQuery && matchesStatus
    })
  }, [hpas, globalFilter, statusFilter])

  // Columns
  const { clusterId } = useCluster()

  const columns: ColumnDef<DashboardHPA>[] = React.useMemo(() => ([
    {
      accessorKey: 'name',
      header: 'HPA',
      cell: ({ row }) => (
        <IfAllowed
          feature="horizontalpodautoscalers.get"
          namespace={row.original.namespace}
          resourceName={row.original.name}
          fallback={<span>{row.original.name}</span>}
        >
          <span className="hover:underline cursor-pointer">{row.original.name}</span>
        </IfAllowed>
      ),
    },
    { accessorKey: 'namespace', header: 'Namespace' },
    { accessorKey: 'target', header: 'Target' },
    { accessorKey: 'min', header: 'Min' },
    { accessorKey: 'max', header: 'Max' },
    { accessorKey: 'desired', header: 'Desired' },
    { accessorKey: 'current', header: 'Current' },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => statusBadge(row.original.status),
    },
    {
      id: 'actions',
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="data-[state=open]:bg-muted text-muted-foreground flex size-8"
              size="icon"
            >
              <IconDotsVertical />
              <span className="sr-only">Open menu</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <IfAllowed
              feature="horizontalpodautoscalers.get"
              cluster={clusterId}
              namespace={row.original.namespace}
              resourceName={row.original.name}
              fallback={
                <DropdownMenuItem disabled className="text-muted-foreground">
                  <IconEye className="size-4 mr-2" />
                  View Details
                </DropdownMenuItem>
              }
            >
              <DropdownMenuItem>
                <IconEye className="size-4 mr-2" />
                View Details
              </DropdownMenuItem>
            </IfAllowed>
            <IfAllowed
              feature="horizontalpodautoscalers.patch"
              cluster={clusterId}
              namespace={row.original.namespace}
              resourceName={row.original.name}
              fallback={
                <DropdownMenuItem disabled className="text-muted-foreground">
                  <IconEdit className="size-4 mr-2" />
                  Edit YAML
                </DropdownMenuItem>
              }
            >
              <ResourceYamlEditor
                resourceName={row.original.name}
                namespace={row.original.namespace}
                resourceKind="HorizontalPodAutoscaler"
              >
                <button
                  className="flex w-full items-center gap-2 px-2 py-1.5 text-sm hover:bg-accent rounded-sm cursor-pointer"
                  style={{ background: 'transparent', border: 'none', textAlign: 'left' }}
                >
                  <IconEdit className="size-4" />
                  Edit YAML
                </button>
              </ResourceYamlEditor>
            </IfAllowed>
            <DropdownMenuSeparator />
            <IfAllowed
              feature="horizontalpodautoscalers.delete"
              cluster={clusterId}
              namespace={row.original.namespace}
              resourceName={row.original.name}
              fallback={<DropdownMenuItem disabled className="text-muted-foreground"><IconTrash className="size-4 mr-2" />Delete</DropdownMenuItem>}
            >
              <DropdownMenuItem className="text-red-600" onClick={() => deleteSelectedHPAs([row.original])}>
                <IconTrash className="size-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </IfAllowed>
          </DropdownMenuContent>
        </DropdownMenu>
      )
    }
  ]), [])

  // Bulk actions
  const { isAllowed } = useAuthzCapabilitiesInContext([
    'horizontalpodautoscalers.get',
    'horizontalpodautoscalers.delete',
  ])

  const getCSRF = React.useCallback(() => {
    if (typeof document === 'undefined') return null
    const name = 'kaptn_csrf='
    const cookies = decodeURIComponent(document.cookie).split(';')
    for (let c of cookies) {
      c = c.trim()
      if (c.indexOf(name) === 0) return c.substring(name.length)
    }
    return null
  }, [])

  const deleteSelectedHPAs = React.useCallback(async (rows: DashboardHPA[]) => {
    const csrf = getCSRF()
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (csrf) headers['X-CSRF-Token'] = csrf
    await Promise.all(rows.map(row => fetch('/api/v1/resources', {
      method: 'DELETE',
      credentials: 'include',
      headers,
      body: JSON.stringify({
        namespace: row.namespace,
        name: row.name,
        kind: 'HorizontalPodAutoscaler',
        deletePods: false,
      })
    })))
  }, [getCSRF])

  type HpaBulkAction = {
    id: string
    label: string
    icon?: React.ReactNode
    variant?: 'default' | 'destructive'
    requiresSelection?: boolean
    action: (rows: DashboardHPA[]) => void | Promise<void>
  }

  const hpaBulkActions: HpaBulkAction[] = React.useMemo(() => {
    const actions: BulkAction<DashboardHPA>[] = []

    // Copy names (always available)
    actions.push({
      id: 'copy-names',
      label: 'Copy HPA Names',
      icon: <IconCopy className="size-4" />,
      requiresSelection: true,
      action: (rows) => {
        const names = rows.map(r => r.name).join('\n')
        navigator.clipboard.writeText(names)
      },
    })

    // Export YAML placeholder (requires get)
    if (isAllowed('horizontalpodautoscalers.get')) {
      actions.push({
        id: 'export-yaml',
        label: 'Export Selected as YAML',
        icon: <IconDownload className="size-4" />,
        requiresSelection: true,
        action: (rows) => {
          console.log('Export YAML for HPAs:', rows.map(r => `${r.namespace}/${r.name}`))
        },
      })
    }

    // Delete (destructive)
    if (isAllowed('horizontalpodautoscalers.delete')) {
      actions.push({
        id: 'delete-hpas',
        label: 'Delete Selected HPAs',
        icon: <IconTrash className="size-4" />,
        variant: 'destructive',
        requiresSelection: true,
        action: async (rows) => {
          await deleteSelectedHPAs(rows)
        },
      })
    }

    return actions
  }, [isAllowed, deleteSelectedHPAs])

  return (
    <>
      <div className="px-4 lg:px-6">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold tracking-tight">Horizontal Pod Autoscalers</h1>
            {isConnected && (
              <div className="flex items-center space-x-1 text-xs text-green-600">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                <span>Real-time updates enabled</span>
              </div>
            )}
          </div>
          <p className="text-muted-foreground">View and monitor HPA status and scaling activity</p>
        </div>
      </div>

      <SummaryCards cards={summaryData} loading={isLoading} error={error} lastUpdated={lastUpdated} />

      <div className="px-4 lg:px-6">
        <UniversalDataTable
          data={filtered}
          columns={columns}
          enableReorder={false}
          enableRowSelection={true}
          loading={isLoading}
          error={error}
          className="px-0 [&_tbody_tr]:bg-background/50"
          renderFilters={({ table, selectedCount, totalCount }) => (
            <div className="space-y-4">
              <DataTableFilters
                globalFilter={globalFilter}
                onGlobalFilterChange={setGlobalFilter}
                searchPlaceholder="Search HPAs by name, namespace, or target..."
                categoryFilter={statusFilter}
                onCategoryFilterChange={setStatusFilter}
                categoryLabel="Status"
                categoryOptions={statusOptions}
                selectedCount={selectedCount}
                totalCount={totalCount}
                bulkActions={hpaBulkActions.map(a => ({
                  id: a.id,
                  label: a.label,
                  icon: a.icon,
                  variant: a.variant,
                  requiresSelection: a.requiresSelection,
                  action: () => a.action(table.getFilteredSelectedRowModel().rows.map(r => r.original as DashboardHPA)),
                }))}
                table={table as any}
                showColumnToggle={true}
              />
            </div>
          )}
        />
      </div>
    </>
  )
}

export function HPAsPageContainer() {
  return (
    <RouteGuard requiredCapabilities={["horizontalpodautoscalers.list"]} requireAll={false}>
      <HPAsContent />
    </RouteGuard>
  )
}

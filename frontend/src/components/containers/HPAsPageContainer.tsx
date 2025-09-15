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
import { ActionConfirmationDialog } from "@/components/ui/action-confirmation-dialog"
import { HPADetailDrawer } from "@/components/viewers/HPADetailDrawer"
import { bulkActionsApi } from "@/lib/api/bulk-actions"

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
  const { data: hpas, loading: isLoading, error } = useHPAsWithWebSocket(true)
  const [lastUpdated, setLastUpdated] = React.useState<string | null>(null)
  const { fetchAdditional } = useCapabilities()

  // Confirmation dialog state for destructive actions
  const [confirmDialogOpen, setConfirmDialogOpen] = React.useState(false)
  const [isConfirmExecuting, setIsConfirmExecuting] = React.useState(false)
  const [confirmWarnings, setConfirmWarnings] = React.useState<string[]>([])

  type Item = { name: string; namespace?: string }
  type Scope = 'pods' | 'deployments' | 'services' | 'configmaps' | 'secrets' | 'daemonsets' | 'statefulsets' | 'cronjobs' | 'nodes' |
    'clusterroles' | 'clusterrolebindings' | 'roles' | 'rolebindings' | 'horizontalpodautoscalers' | string

  const [pendingAction, setPendingAction] = React.useState<null | { scope: Scope, items: Item[] }>(null)

  // Detail drawer state
  const [detailDrawerOpen, setDetailDrawerOpen] = React.useState(false)
  const [selectedHPAForDetails, setSelectedHPAForDetails] = React.useState<DashboardHPA | null>(null)

  const requireTextConfirm = React.useMemo(() => !!pendingAction && pendingAction.items.length > 0, [pendingAction])
  const confirmValue = React.useMemo(() => {
    if (!pendingAction || pendingAction.items.length === 0) return ''
    const count = pendingAction.items.length
    return count === 1 ? pendingAction.items[0].name : 'DELETE'
  }, [pendingAction])

  // Validate function — sets warnings on dialog before running destructive action
  const validateDelete = React.useCallback(async (scope: Scope, items: Item[]) => {
    try {
      const targets = items.map(i => ({ namespace: i.namespace ?? '', name: i.name }))
      const resp = await bulkActionsApi.validateAction(String(scope), { action: 'delete', targets })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const details: any = resp?.details
      const warnings: string[] = Array.isArray(details?.results)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ? details.results.flatMap((r: any) => Array.isArray(r.warnings) ? r.warnings : [])
        : []
      setConfirmWarnings(warnings)
    } catch {
      setConfirmWarnings([])
    }
  }, [])

  // Confirm handler — executes with `force_confirm: true`
  const handleConfirmAction = React.useCallback(async () => {
    if (!pendingAction) return
    setIsConfirmExecuting(true)
    try {
      const targets = pendingAction.items.map(i => ({ namespace: i.namespace ?? '', name: i.name }))
      await bulkActionsApi.executeBulkAction(String(pendingAction.scope), { action: 'delete', targets, force_confirm: true })
    } finally {
      setIsConfirmExecuting(false)
      setConfirmDialogOpen(false)
      setPendingAction(null)
    }
  }, [pendingAction])
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
          cluster={clusterId}
          namespace={row.original.namespace}
          resourceName={row.original.name}
          fallback={<span>{row.original.name}</span>}
        >
          <button
            onClick={() => { setSelectedHPAForDetails(row.original); setDetailDrawerOpen(true) }}
            className="text-left hover:underline focus:underline focus:outline-none"
          >
            {row.original.name}
          </button>
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
              <DropdownMenuItem onClick={() => { setSelectedHPAForDetails(row.original); setDetailDrawerOpen(true) }}>
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
                <DropdownMenuItem
                  onSelect={(e) => e.preventDefault()}
                >
                  <IconEdit className="size-4 mr-2" />
                  Edit YAML
                </DropdownMenuItem>
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
              <DropdownMenuItem className="text-red-600" onClick={() => {
                const item = row.original
                setPendingAction({ scope: 'horizontalpodautoscalers', items: [{ name: item.name, namespace: item.namespace }] })
                setConfirmDialogOpen(true)
                validateDelete('horizontalpodautoscalers', [{ name: item.name, namespace: item.namespace }])
              }}>
                <IconTrash className="size-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </IfAllowed>
          </DropdownMenuContent>
        </DropdownMenu>
      )
    }
  ]), [clusterId, validateDelete])

  // Bulk actions
  const { isAllowed } = useAuthzCapabilitiesInContext([
    'horizontalpodautoscalers.get',
    'horizontalpodautoscalers.delete',
  ])

  type HpaBulkAction = {
    id: string
    label: string
    icon?: React.ReactNode
    variant?: 'default' | 'destructive'
    requiresSelection?: boolean
    action: (rows: DashboardHPA[]) => void | Promise<void>
  }

  const hpaBulkActions: HpaBulkAction[] = React.useMemo(() => {
    const actions: HpaBulkAction[] = []

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
        action: (rows) => {
          const selected = rows.map(r => ({ name: r.name, namespace: r.namespace }))
          setPendingAction({ scope: 'horizontalpodautoscalers', items: selected })
          setConfirmDialogOpen(true)
          validateDelete('horizontalpodautoscalers', selected)
        },
      })
    }

    return actions
  }, [isAllowed, validateDelete])

  return (
    <>


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
                table={table}
                showColumnToggle={true}
              />
            </div>
          )}
        />
      </div>

      <ActionConfirmationDialog
        open={confirmDialogOpen}
        onOpenChange={setConfirmDialogOpen}
        title={'Delete ' + (pendingAction?.scope ?? 'Resources')}
        description={'Are you sure you want to delete the selected items? This action cannot be undone.'}
        actionLabel={pendingAction?.items && pendingAction.items.length > 1 ? 'Delete Selected' : 'Delete'}
        variant={'destructive'}
        isExecuting={isConfirmExecuting}
        onConfirm={handleConfirmAction}
        resources={(pendingAction?.items || []).map(i => ({ name: i.name, namespace: i.namespace }))}
        safetyViolations={[]}
        warnings={confirmWarnings}
        requireTextConfirm={requireTextConfirm}
        confirmPrompt={pendingAction?.items && pendingAction.items.length === 1 ? 'Type the resource name to confirm' : 'Type DELETE to confirm'}
        confirmValue={confirmValue}
      />

      {selectedHPAForDetails && (
        <HPADetailDrawer
          item={selectedHPAForDetails}
          open={detailDrawerOpen}
          onOpenChange={(open) => {
            setDetailDrawerOpen(open)
            if (!open) setSelectedHPAForDetails(null)
          }}
        />
      )}
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

"use client"

import * as React from "react"
import { UniversalDataTable } from "@/components/data_tables/UniversalDataTable"
import { DataTableFilters, type FilterOption } from "@/components/ui/data-table-filters"
import { IfAllowed } from "@/components/authz/IfAllowed"
import { useAuthzCapabilitiesInContext } from "@/hooks/useAuthzCapabilitiesSimple"
import { useCluster } from "@/hooks/useCluster"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { IconDotsVertical, IconEye, IconTrash, IconScale, IconRefresh, IconDownload, IconCopy, IconEdit, IconCircleCheckFilled, IconLoader, IconAlertTriangle } from "@tabler/icons-react"
import { type ColumnDef } from "@/lib/table"
import { SummaryCards, type SummaryCard } from "@/components/SummaryCards"
import { useReplicaSetsWithWebSocket } from "@/hooks/useReplicaSetsWithWebSocket"
import { replicaSetSchema } from "@/lib/schemas/replicaset"
import { z } from "zod"
import {
  getReplicaStatusBadge,
  getUpdateStatusBadge,
  getResourceIcon,
  getHealthTrendBadge
} from "@/lib/summary-card-utils"
import { RouteGuard } from "@/components/authz"
import { useCapabilities } from "@/hooks/use-capabilities"
import { Badge } from "@/components/ui/badge"
import { ReplicaSetDetailDrawer } from "@/components/viewers/ReplicaSetDetailDrawer"
import { ResourceYamlEditor } from "@/components/ResourceYamlEditor"
import { ActionConfirmationDialog } from "@/components/ui/action-confirmation-dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { bulkActionsApi } from "@/lib/api/bulk-actions"

type DashboardReplicaSet = z.infer<typeof replicaSetSchema>

// Inner component that can access the namespace context
function ReplicaSetsContent() {
  const { data: replicaSets, loading: isLoading, error, isConnected, refetch } = useReplicaSetsWithWebSocket(true)
  const [lastUpdated, setLastUpdated] = React.useState<string | null>(null)
  const { fetchAdditional } = useCapabilities()
  const { clusterId } = useCluster()
  const { isAllowed } = useAuthzCapabilitiesInContext(['replicasets.get', 'replicasets.patch', 'replicasets.delete', 'replicasets.scale.update'])
  const [detailDrawerOpen, setDetailDrawerOpen] = React.useState(false)
  const [selectedReplicaSetForDetails, setSelectedReplicaSetForDetails] = React.useState<DashboardReplicaSet | null>(null)
  const [confirmDialogOpen, setConfirmDialogOpen] = React.useState(false)
  const [isConfirmExecuting, setIsConfirmExecuting] = React.useState(false)
  const [confirmWarnings, setConfirmWarnings] = React.useState<string[]>([])
  const [pendingAction, setPendingAction] = React.useState<null | { type: 'delete' | 'restart' | 'scale', replicaSets: DashboardReplicaSet[] }>(null)
  const [alert, setAlert] = React.useState<null | { variant: 'success' | 'error', title: string, description?: string }>(null)

  // Ensure replicaset-specific action capabilities are requested
  React.useEffect(() => {
    fetchAdditional([
      'replicasets.get',
      'replicasets.patch',
      'replicasets.delete',
      'replicasets.scale.update',
    ]).catch(() => { /* noop */ })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Update lastUpdated when replicaSets change
  React.useEffect(() => {
    if (replicaSets.length > 0) {
      setLastUpdated(new Date().toISOString())
    }
  }, [replicaSets])

  // Generate summary cards from replicaset data
  const summaryData: SummaryCard[] = React.useMemo(() => {
    if (!replicaSets || replicaSets.length === 0) {
      return [
        {
          title: "Total ReplicaSets",
          value: 0,
          subtitle: "No replicasets found"
        },
        {
          title: "Ready",
          value: 0,
          subtitle: "0/0 ready"
        },
        {
          title: "Available",
          value: 0,
          subtitle: "0 available"
        },
        {
          title: "Current",
          value: 0,
          subtitle: "0 current replicas"
        }
      ]
    }

    const totalReplicaSets = replicaSets.length

    // Calculate ready replicasets (where ready fraction equals 1)
    const readyReplicaSets = replicaSets.filter(rs => {
      const [ready, total] = rs.ready.split('/').map(Number)
      return ready === total && total > 0
    }).length

    // Calculate total replica stats
    const totalAvailable = replicaSets.reduce((sum, rs) => sum + rs.available, 0)
    const totalCurrent = replicaSets.reduce((sum, rs) => sum + rs.current, 0)
    const totalDesired = replicaSets.reduce((sum, rs) => sum + rs.desired, 0)
    const totalReady = replicaSets.reduce((sum, rs) => {
      const [ready] = rs.ready.split('/').map(Number)
      return sum + (ready || 0)
    }, 0)

    return [
      {
        title: "Total ReplicaSets",
        value: totalReplicaSets,
        subtitle: `${readyReplicaSets}/${totalReplicaSets} ready`,
        badge: getReplicaStatusBadge(readyReplicaSets, totalReplicaSets),
        icon: getResourceIcon("replicasets"),
        footer: totalReplicaSets > 0 ? "All replicaset resources in cluster" : "No replicasets found"
      },
      {
        title: "Ready Replicas",
        value: `${totalReady}/${totalDesired}`,
        subtitle: totalDesired > 0 ? `${Math.round((totalReady / totalDesired) * 100)}% ready` : "No replicas",
        badge: getReplicaStatusBadge(totalReady, totalDesired),
        footer: totalDesired > 0 ? "Pod instances across all replicasets" : "No pod replicas"
      },
      {
        title: "Available",
        value: totalAvailable,
        subtitle: `${totalAvailable} replicas available`,
        badge: getHealthTrendBadge(totalDesired > 0 ? (totalAvailable / totalDesired) * 100 : 0),
        footer: totalAvailable > 0 ? "Ready to serve traffic" : "No available replicas"
      },
      {
        title: "Current",
        value: totalCurrent,
        subtitle: `${totalCurrent} current replicas`,
        badge: getUpdateStatusBadge(totalCurrent, totalDesired),
        footer: totalCurrent > 0 ? "Currently running replicas" : "No current replicas"
      }
    ]
  }, [replicaSets])

  // Filters
  const [globalFilter, setGlobalFilter] = React.useState("")
  const [statusFilter, setStatusFilter] = React.useState<string>("all")

  const statusOptions: FilterOption[] = React.useMemo(() => {
    const statuses = new Set<string>()
    replicaSets.forEach(rs => {
      const [current, desired] = rs.ready.split("/").map(Number)
      const isReady = current === desired && desired > 0
      const isPartial = current > 0 && current < desired

      if (isReady) {
        statuses.add("Ready")
      } else if (isPartial) {
        statuses.add("Partial")
      } else {
        statuses.add("Not Ready")
      }
    })
    return Array.from(statuses).sort().map(status => ({
      value: status,
      label: status,
      badge: getReadyBadge(status === "Ready" ? "1/1" : status === "Partial" ? "1/2" : "0/1")
    }))
  }, [replicaSets])

  const filtered = React.useMemo(() => {
    const q = globalFilter.trim().toLowerCase()
    return replicaSets.filter(rs => {
      // Apply global filter (search)
      const matchesQuery = !q ||
        rs.name.toLowerCase().includes(q) ||
        rs.namespace.toLowerCase().includes(q) ||
        rs.ready.toLowerCase().includes(q) ||
        rs.desired.toString().includes(q) ||
        rs.current.toString().includes(q) ||
        rs.available.toString().includes(q)

      // Apply status filter
      let matchesStatus = true
      if (statusFilter !== "all") {
        const [current, desired] = rs.ready.split("/").map(Number)
        const isReady = current === desired && desired > 0
        const isPartial = current > 0 && current < desired
        const status = isReady ? "Ready" : isPartial ? "Partial" : "Not Ready"
        matchesStatus = status === statusFilter
      }

      return matchesQuery && matchesStatus
    })
  }, [replicaSets, globalFilter, statusFilter])

  // Ready status badge helper
  function getReadyBadge(ready: string) {
    const [current, desired] = ready.split("/").map(Number)
    const isReady = current === desired && desired > 0
    const isPartial = current > 0 && current < desired

    if (isReady) {
      return (
        <Badge variant="outline" className="text-green-600 border-border bg-transparent px-1.5">
          <IconCircleCheckFilled className="size-3 fill-green-600 mr-1" />
          {ready}
        </Badge>
      )
    } else if (isPartial) {
      return (
        <Badge variant="outline" className="text-yellow-600 border-border bg-transparent px-1.5">
          <IconLoader className="size-3 text-yellow-600 mr-1" />
          {ready}
        </Badge>
      )
    } else {
      return (
        <Badge variant="outline" className="text-red-600 border-border bg-transparent px-1.5">
          <IconAlertTriangle className="size-3 text-red-600 mr-1" />
          {ready}
        </Badge>
      )
    }
  }

  // Bulk actions: preflight validate to show warnings in confirmation dialog
  const validateReplicaSetsAction = React.useCallback(async (type: 'delete' | 'restart' | 'scale', rows: DashboardReplicaSet[]) => {
    try {
      const targets = rows.map(r => ({ namespace: r.namespace, name: r.name }))
      const legacyAction = type === 'delete' ? 'delete-replicasets' : type === 'restart' ? 'restart-replicasets' : 'scale-replicasets'
      const resp = await bulkActionsApi.validateAction('replicasets', { action: legacyAction, targets })
      const details = resp?.details as { results?: { warnings?: string[] }[] }
      const warnings: string[] = Array.isArray(details?.results)
        ? details.results.flatMap((r: { warnings?: string[] }) => Array.isArray(r.warnings) ? r.warnings : [])
        : []
      setConfirmWarnings(warnings)
    } catch {
      setConfirmWarnings([])
    }
  }, [])

  // Build table columns
  const columns: ColumnDef<DashboardReplicaSet>[] = React.useMemo(() => ([
    {
      accessorKey: 'name',
      header: 'ReplicaSet Name',
      cell: ({ row }) => (
        <IfAllowed
          feature="replicasets.get"
          cluster={clusterId}
          namespace={row.original.namespace}
          resourceName={row.original.name}
          fallback={<span>{row.original.name}</span>}
        >
          <button
            onClick={() => { setSelectedReplicaSetForDetails(row.original); setDetailDrawerOpen(true) }}
            className="text-left hover:underline focus:underline focus:outline-none"
          >
            {row.original.name}
          </button>
        </IfAllowed>
      ),
    },
    {
      accessorKey: 'namespace',
      header: 'Namespace',
      cell: ({ row }) => (
        <Badge variant="outline" className="text-muted-foreground px-1.5">
          {row.original.namespace}
        </Badge>
      )
    },
    {
      accessorKey: 'ready',
      header: 'Ready',
      cell: ({ row }) => getReadyBadge(row.original.ready)
    },
    {
      accessorKey: 'desired',
      header: 'Desired',
      cell: ({ row }) => (
        <div className="font-mono text-sm">{row.original.desired}</div>
      )
    },
    {
      accessorKey: 'current',
      header: 'Current',
      cell: ({ row }) => (
        <div className="font-mono text-sm">{row.original.current}</div>
      )
    },
    {
      accessorKey: 'available',
      header: 'Available',
      cell: ({ row }) => (
        <div className="font-mono text-sm">{row.original.available}</div>
      )
    },
    {
      accessorKey: 'age',
      header: 'Age',
      cell: ({ row }) => (
        <div className="font-mono text-sm">{row.original.age}</div>
      )
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
          <DropdownMenuContent align="end" className="w-52">
            <IfAllowed
              feature="replicasets.get"
              cluster={clusterId}
              namespace={row.original.namespace}
              resourceName={row.original.name}
              fallback={<DropdownMenuItem disabled className="text-muted-foreground"><IconEye className="size-4 mr-2" />View Details</DropdownMenuItem>}
            >
              <DropdownMenuItem onClick={() => { setSelectedReplicaSetForDetails(row.original); setDetailDrawerOpen(true) }}>
                <IconEye className="size-4 mr-2" />
                View Details
              </DropdownMenuItem>
            </IfAllowed>

            <IfAllowed
              feature="replicasets.scale.update"
              cluster={clusterId}
              namespace={row.original.namespace}
              resourceName={row.original.name}
              fallback={<DropdownMenuItem disabled className="text-muted-foreground"><IconScale className="size-4 mr-2" />Scale</DropdownMenuItem>}
            >
              <DropdownMenuItem onClick={() => { setPendingAction({ type: 'scale', replicaSets: [row.original] }); setConfirmDialogOpen(true); validateReplicaSetsAction('scale', [row.original]) }}>
                <IconScale className="size-4 mr-2" />
                Scale
              </DropdownMenuItem>
            </IfAllowed>

            <IfAllowed
              feature="replicasets.patch"
              cluster={clusterId}
              namespace={row.original.namespace}
              resourceName={row.original.name}
              fallback={<DropdownMenuItem disabled className="text-muted-foreground"><IconEdit className="size-4 mr-2" />Edit YAML</DropdownMenuItem>}
            >
              <ResourceYamlEditor
                resourceName={row.original.name}
                namespace={row.original.namespace}
                resourceKind="ReplicaSet"
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

            <IfAllowed
              feature="replicasets.patch"
              cluster={clusterId}
              namespace={row.original.namespace}
              resourceName={row.original.name}
              fallback={<DropdownMenuItem disabled className="text-muted-foreground"><IconRefresh className="size-4 mr-2" />Restart</DropdownMenuItem>}
            >
              <DropdownMenuItem onClick={() => { setPendingAction({ type: 'restart', replicaSets: [row.original] }); setConfirmDialogOpen(true); validateReplicaSetsAction('restart', [row.original]) }}>
                <IconRefresh className="size-4 mr-2" />
                Restart
              </DropdownMenuItem>
            </IfAllowed>

            <IfAllowed
              feature="replicasets.get"
              cluster={clusterId}
              namespace={row.original.namespace}
              resourceName={row.original.name}
              fallback={<DropdownMenuItem disabled className="text-muted-foreground"><IconDownload className="size-4 mr-2" />Export YAML</DropdownMenuItem>}
            >
              <DropdownMenuItem onClick={() => {
                console.log('Export YAML for ReplicaSet:', `${row.original.name} in ${row.original.namespace}`);
                // TODO: Implement single-item YAML export
              }}>
                <IconDownload className="size-4 mr-2" />
                Export YAML
              </DropdownMenuItem>
            </IfAllowed>

            <DropdownMenuSeparator />

            <IfAllowed
              feature="replicasets.delete"
              cluster={clusterId}
              namespace={row.original.namespace}
              resourceName={row.original.name}
              fallback={<DropdownMenuItem disabled className="text-muted-foreground"><IconTrash className="size-4 mr-2" />Delete</DropdownMenuItem>}
            >
              <DropdownMenuItem className="text-red-600" onClick={() => { setPendingAction({ type: 'delete', replicaSets: [row.original] }); setConfirmDialogOpen(true); validateReplicaSetsAction('delete', [row.original]) }}>
                <IconTrash className="size-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </IfAllowed>
          </DropdownMenuContent>
        </DropdownMenu>
      )
    }
  ]), [clusterId, validateReplicaSetsAction])

  const bulkActions = React.useMemo(() => {
    const actions: { id: string, label: string, icon?: React.ReactNode, variant?: 'default' | 'destructive', requiresSelection?: boolean, action: (rows: DashboardReplicaSet[]) => void | Promise<void> }[] = []

    if (isAllowed('replicasets.get')) {
      actions.push({
        id: "export-yaml",
        label: "Export Selected as YAML",
        icon: <IconDownload className="size-4" />,
        action: (rows) => {
          console.log('Export YAML for ReplicaSets:', rows.map(rs => rs.name))
          // TODO: Implement bulk YAML export
        },
        requiresSelection: true,
      })
    }

    actions.push({
      id: "copy-names",
      label: "Copy ReplicaSet Names",
      icon: <IconCopy className="size-4" />,
      action: (rows) => {
        const names = rows.map(rs => rs.name).join('\n')
        navigator.clipboard.writeText(names)
      },
      requiresSelection: true,
    })

    if (isAllowed('replicasets.scale.update')) {
      actions.push({
        id: "scale-replicasets",
        label: "Scale Selected ReplicaSets",
        icon: <IconScale className="size-4" />,
        action: (rows) => {
          setPendingAction({ type: 'scale', replicaSets: rows });
          setConfirmDialogOpen(true);
          validateReplicaSetsAction('scale', rows)
        },
        requiresSelection: true,
      })
    }

    if (isAllowed('replicasets.patch')) {
      actions.push({
        id: "restart-replicasets",
        label: "Restart Selected ReplicaSets",
        icon: <IconRefresh className="size-4" />,
        action: (rows) => {
          setPendingAction({ type: 'restart', replicaSets: rows });
          setConfirmDialogOpen(true);
          validateReplicaSetsAction('restart', rows)
        },
        requiresSelection: true,
      })
    }

    if (isAllowed('replicasets.delete')) {
      actions.push({
        id: "delete-replicasets",
        label: "Delete Selected ReplicaSets",
        icon: <IconTrash className="size-4" />,
        variant: 'destructive',
        action: (rows) => {
          setPendingAction({ type: 'delete', replicaSets: rows });
          setConfirmDialogOpen(true);
          validateReplicaSetsAction('delete', rows)
        },
        requiresSelection: true,
      })
    }

    return actions
  }, [isAllowed, validateReplicaSetsAction])

  const handleConfirmAction = React.useCallback(async () => {
    if (!pendingAction) return
    setIsConfirmExecuting(true)
    try {
      const targets = pendingAction.replicaSets.map(rs => ({ namespace: rs.namespace, name: rs.name }))
      const legacyAction = pendingAction.type === 'delete' ? 'delete-replicasets' : pendingAction.type === 'restart' ? 'restart-replicasets' : 'scale-replicasets'
      const resp = await bulkActionsApi.executeBulkAction('replicasets', { action: legacyAction, targets })
      const success = resp?.success
      const total = resp?.resources_total ?? 0
      const affected = resp?.resources_affected ?? 0
      setAlert({
        variant: success ? 'success' : 'error',
        title: success ? `Success: ${affected}/${total} replicasets processed` : `Errors: ${total - affected} failed`,
        description: resp?.message
      })
    } catch (e) {
      setAlert({ variant: 'error', title: 'Action failed', description: e instanceof Error ? e.message : String(e) })
    } finally {
      setIsConfirmExecuting(false)
      setConfirmDialogOpen(false)
      setPendingAction(null)
    }
  }, [pendingAction])

  return (
    <div className="space-y-6">
      {/* Header with connection status */}


      {/* Summary Cards */}
      <SummaryCards
        cards={summaryData}
        loading={isLoading}
        error={error}
        lastUpdated={lastUpdated}
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
          data={filtered}
          columns={columns}
          enableReorder={false}
          enableRowSelection={true}
          loading={isLoading}
          error={error}
          onRefresh={refetch}
          className="px-0 [&_tbody_tr]:bg-background/50"
          renderFilters={({ table, selectedCount, totalCount }) => (
            <div className="space-y-4">
              <DataTableFilters
                globalFilter={globalFilter}
                onGlobalFilterChange={setGlobalFilter}
                searchPlaceholder="Search ReplicaSets by name, namespace, ready status, or replica counts... (Press '/' to focus)"
                categoryFilter={statusFilter}
                onCategoryFilterChange={setStatusFilter}
                categoryLabel="Filter by status"
                categoryOptions={statusOptions}
                selectedCount={selectedCount}
                totalCount={totalCount}
                bulkActions={bulkActions.map(a => ({
                  id: a.id,
                  label: a.label,
                  icon: a.icon ?? undefined,
                  variant: (a.variant === 'destructive' ? 'destructive' : 'default') as 'default' | 'destructive',
                  requiresSelection: a.requiresSelection,
                  action: () => a.action(table.getFilteredSelectedRowModel().rows.map(r => r.original as DashboardReplicaSet))
                }))}
                table={table}
                showColumnToggle={true}
              >

              </DataTableFilters>
            </div>
          )}
        />
      </div>

      {/* Bulk action confirmation dialog */}
      <ActionConfirmationDialog
        open={confirmDialogOpen}
        onOpenChange={setConfirmDialogOpen}
        title={pendingAction?.type === 'restart' ? 'Restart ReplicaSets' : pendingAction?.type === 'scale' ? 'Scale ReplicaSets' : 'Delete ReplicaSets'}
        description={
          pendingAction?.type === 'restart'
            ? 'Are you sure you want to restart the selected replicasets? This will terminate and recreate their pods.'
            : pendingAction?.type === 'scale'
              ? 'Are you sure you want to scale the selected replicasets? This will modify their replica count.'
              : 'Are you sure you want to delete the selected replicasets? This action cannot be undone.'
        }
        actionLabel={pendingAction?.type === 'restart' ? 'Restart ReplicaSets' : pendingAction?.type === 'scale' ? 'Scale ReplicaSets' : 'Delete ReplicaSets'}
        variant={pendingAction?.type === 'delete' ? 'destructive' : 'default'}
        isExecuting={isConfirmExecuting}
        onConfirm={handleConfirmAction}
        resources={(pendingAction?.replicaSets || []).map(rs => ({ name: rs.name, namespace: rs.namespace }))}
        safetyViolations={[]}
        warnings={confirmWarnings}
      />

      {selectedReplicaSetForDetails && (
        <ReplicaSetDetailDrawer
          item={selectedReplicaSetForDetails}
          open={detailDrawerOpen}
          onOpenChange={(open) => {
            setDetailDrawerOpen(open)
            if (!open) setSelectedReplicaSetForDetails(null)
          }}
        />
      )}
    </div>
  )
}

export function ReplicaSetsPageContainer() {
  return (
    <RouteGuard requiredCapabilities={["replicasets.list"]} requireAll={false}>
      <ReplicaSetsContent />
    </RouteGuard>
  )
} 

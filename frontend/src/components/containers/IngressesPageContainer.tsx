"use client"

import * as React from "react"
import { RouteGuard } from "@/components/authz"
import { UniversalDataTable } from "@/components/data_tables/UniversalDataTable"
import { DataTableFilters, type FilterOption } from "@/components/ui/data-table-filters"
import { IfAllowed } from "@/components/authz/IfAllowed"
import { useAuthzCapabilitiesInContext } from "@/hooks/useAuthzCapabilitiesSimple"
import { useCluster } from "@/hooks/useCluster"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { IconDotsVertical, IconEye, IconTrash, IconDownload, IconCopy, IconEdit } from "@tabler/icons-react"
import { type ColumnDef } from "@/lib/table"
import type { DashboardIngress } from "@/lib/k8s-workloads"
import { IngressDetailDrawer } from "@/components/viewers/IngressDetailDrawer"
import { ResourceYamlEditor } from "@/components/ResourceYamlEditor"
import { SummaryCards, type SummaryCard } from "@/components/SummaryCards"
import { useIngressesWithWebSocket } from "@/hooks/useIngressesWithWebSocket"
import { useCapabilities } from "@/hooks/use-capabilities"
import { Badge } from "@/components/ui/badge"
import { ActionConfirmationDialog } from "@/components/ui/action-confirmation-dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { bulkActionsApi } from "@/lib/api/bulk-actions"
import {
    getResourceIcon,
    getReplicaStatusBadge
} from "@/lib/summary-card-utils"

// Inner component that can access the namespace context
function IngressesContent() {
    const { data: ingresses, loading: isLoading, error, isConnected } = useIngressesWithWebSocket(true)
    const [lastUpdated, setLastUpdated] = React.useState<string | null>(null)
    const { fetchAdditional } = useCapabilities()
    const { clusterId } = useCluster()
    const { isAllowed } = useAuthzCapabilitiesInContext(['ingresses.get', 'ingresses.patch', 'ingresses.delete'])
    const [detailDrawerOpen, setDetailDrawerOpen] = React.useState(false)
    const [selectedIngressForDetails, setSelectedIngressForDetails] = React.useState<DashboardIngress | null>(null)
    const [confirmDialogOpen, setConfirmDialogOpen] = React.useState(false)
    const [isConfirmExecuting, setIsConfirmExecuting] = React.useState(false)
    const [confirmWarnings, setConfirmWarnings] = React.useState<string[]>([])
    const [pendingAction, setPendingAction] = React.useState<null | { type: 'delete', ingresses: DashboardIngress[] }>(null)
    const [alert, setAlert] = React.useState<null | { variant: 'success' | 'error', title: string, description?: string }>(null)

    // Bulk actions: preflight validate to show warnings in confirmation dialog
    const validateIngressesAction = React.useCallback(async (type: 'delete', rows: DashboardIngress[]) => {
        try {
            const targets = rows.map(r => ({ namespace: r.namespace, name: r.name }))
            const legacyAction = 'delete-ingresses'
            const resp = await bulkActionsApi.validateAction('ingresses', { action: legacyAction, targets })
            const details: any = resp?.details
            const warnings: string[] = Array.isArray(details?.results)
                ? details.results.flatMap((r: any) => Array.isArray(r.warnings) ? r.warnings : [])
                : []
            setConfirmWarnings(warnings)
        } catch {
            setConfirmWarnings([])
        }
    }, [])

    // Ensure ingress-specific action capabilities are requested
    React.useEffect(() => {
        fetchAdditional([
            'ingresses.get',
            'ingresses.patch',
            'ingresses.delete',
        ]).catch(() => { /* noop */ })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // Update lastUpdated when ingresses change
    React.useEffect(() => {
        if (ingresses.length > 0) {
            setLastUpdated(new Date().toISOString())
        }
    }, [ingresses])

    // Filters
    const [globalFilter, setGlobalFilter] = React.useState("")
    const [classFilter, setClassFilter] = React.useState<string>("all")

    const classOptions: FilterOption[] = React.useMemo(() => {
        const classes = Array.from(new Set(ingresses.map(i => i.ingressClass).filter(Boolean))).sort()
        return classes.map(ic => ({ value: ic, label: ic }))
    }, [ingresses])

    const filtered = React.useMemo(() => {
        const q = globalFilter.trim().toLowerCase()
        return ingresses.filter(i => {
            const matchesQuery = !q ||
                i.name.toLowerCase().includes(q) ||
                i.namespace.toLowerCase().includes(q) ||
                i.ingressClass.toLowerCase().includes(q) ||
                i.hostsDisplay.toLowerCase().includes(q) ||
                i.externalIPsDisplay.toLowerCase().includes(q)
            const matchesClass = classFilter === 'all' || i.ingressClass === classFilter
            return matchesQuery && matchesClass
        })
    }, [ingresses, globalFilter, classFilter])

    // Handle opening detail drawer
    const handleViewDetails = React.useCallback((ingress: DashboardIngress) => {
        setSelectedIngressForDetails(ingress)
        setDetailDrawerOpen(true)
    }, [setSelectedIngressForDetails, setDetailDrawerOpen])

    // Build table columns
    const columns: ColumnDef<DashboardIngress>[] = React.useMemo(() => ([
        {
            accessorKey: 'name',
            header: 'Ingress Name',
            cell: ({ row }) => (
                <IfAllowed
                    feature="ingresses.get"
                    cluster={clusterId}
                    namespace={row.original.namespace}
                    resourceName={row.original.name}
                    fallback={<span>{row.original.name}</span>}
                >
                    <button
                        onClick={() => handleViewDetails(row.original)}
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
            accessorKey: 'ingressClass',
            header: 'Class',
            cell: ({ row }) => (
                <div className="text-sm">{row.original.ingressClass}</div>
            )
        },
        {
            accessorKey: 'hostsDisplay',
            header: 'Hosts',
            cell: ({ row }) => (
                <div className="text-sm font-mono">{row.original.hostsDisplay}</div>
            )
        },
        {
            accessorKey: 'externalIPsDisplay',
            header: 'Address',
            cell: ({ row }) => (
                <div className="text-sm font-mono">{row.original.externalIPsDisplay}</div>
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
                        <Button variant="ghost" size="icon" className="data-[state=open]:bg-muted text-muted-foreground flex size-8">
                            <IconDotsVertical />
                            <span className="sr-only">Open menu</span>
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                        <IfAllowed feature="ingresses.get" cluster={clusterId} namespace={row.original.namespace} resourceName={row.original.name}
                            fallback={<DropdownMenuItem disabled className="text-muted-foreground"><IconEye className="size-4 mr-2" />View Details</DropdownMenuItem>}
                        >
                            <DropdownMenuItem onClick={() => handleViewDetails(row.original)}>
                                <IconEye className="size-4 mr-2" />
                                View Details
                            </DropdownMenuItem>
                        </IfAllowed>
                        <IfAllowed feature="ingresses.patch" cluster={clusterId} namespace={row.original.namespace} resourceName={row.original.name}
                            fallback={<DropdownMenuItem disabled className="text-muted-foreground"><IconEdit className="size-4 mr-2" />Edit YAML</DropdownMenuItem>}
                        >
                            <ResourceYamlEditor resourceName={row.original.name} namespace={row.original.namespace} resourceKind="Ingress">
                                <button className="flex w-full items-center gap-2 px-2 py-1.5 text-sm hover:bg-accent rounded-sm cursor-pointer" style={{ background: 'transparent', border: 'none', textAlign: 'left' }}>
                                    <IconEdit className="size-4" />
                                    Edit YAML
                                </button>
                            </ResourceYamlEditor>
                        </IfAllowed>
                        <DropdownMenuSeparator />
                        <IfAllowed feature="ingresses.delete" cluster={clusterId} namespace={row.original.namespace} resourceName={row.original.name}
                            fallback={<DropdownMenuItem disabled className="text-muted-foreground"><IconTrash className="size-4 mr-2" />Delete</DropdownMenuItem>}
                        >
                            <DropdownMenuItem className="text-red-600" onClick={() => {
                                setPendingAction({ type: 'delete', ingresses: [row.original] });
                                setConfirmDialogOpen(true);
                            }}>
                                <IconTrash className="size-4 mr-2" />
                                Delete
                            </DropdownMenuItem>
                        </IfAllowed>
                    </DropdownMenuContent>
                </DropdownMenu>
            )
        }
    ]), [clusterId, handleViewDetails, setPendingAction, setConfirmDialogOpen])

    // Bulk actions (capability-aware)
    const bulkActions = React.useMemo(() => {
        const actions: { id: string, label: string, icon?: React.ReactNode, variant?: 'default' | 'destructive', requiresSelection?: boolean, action: (rows: DashboardIngress[]) => void | Promise<void> }[] = []

        actions.push({
            id: 'copy-names',
            label: 'Copy Ingress Names',
            icon: <IconCopy className="size-4" />,
            requiresSelection: true,
            action: (rows) => navigator.clipboard.writeText(rows.map(r => r.name).join('\n'))
        })

        if (isAllowed('ingresses.get')) {
            actions.push({
                id: 'export-yaml',
                label: 'Export Selected as YAML',
                icon: <IconDownload className="size-4" />,
                requiresSelection: true,
                action: (rows) => {
                    console.log('Export YAML for ingresses:', rows.map(i => i.name))
                },
            })
        }

        if (isAllowed('ingresses.delete')) {
            actions.push({
                id: 'delete-ingresses',
                label: 'Delete Selected Ingresses',
                icon: <IconTrash className="size-4" />,
                variant: 'destructive',
                requiresSelection: true,
                action: (rows) => {
                    setPendingAction({ type: 'delete', ingresses: rows });
                    setConfirmDialogOpen(true);
                },
            })
        }

        return actions
    }, [isAllowed, setPendingAction, setConfirmDialogOpen])

    // Handle confirmation dialog
    const handleConfirmAction = React.useCallback(async () => {
        if (!pendingAction) return
        setIsConfirmExecuting(true)
        try {
            const targets = pendingAction.ingresses.map(i => ({ namespace: i.namespace, name: i.name }))
            // Using a mock delete API call - replace with actual API call
            console.log('Deleting ingresses:', targets)

            // Simulate API response for now
            const affected = targets.length
            const total = targets.length
            setAlert({
                variant: 'success',
                title: `Success: ${affected}/${total} ingresses deleted`,
                description: 'The selected ingresses have been successfully deleted.'
            })
        } catch (e: unknown) {
            setAlert({
                variant: 'error',
                title: 'Delete failed',
                description: e instanceof Error ? e.message : String(e)
            })
        } finally {
            setIsConfirmExecuting(false)
            setConfirmDialogOpen(false)
            setPendingAction(null)
        }
    }, [pendingAction, setIsConfirmExecuting, setConfirmDialogOpen, setPendingAction, setAlert])

    // Generate summary cards from ingress data
    const summaryData: SummaryCard[] = React.useMemo(() => {
        if (!ingresses || ingresses.length === 0) {
            return [
                {
                    title: "Total Ingresses",
                    value: 0,
                    subtitle: "No ingresses found"
                },
                {
                    title: "Configured Hosts",
                    value: 0,
                    subtitle: "No hosts configured"
                },
                {
                    title: "External IPs",
                    value: 0,
                    subtitle: "No external IPs"
                },
                {
                    title: "Ingress Rules",
                    value: 0,
                    subtitle: "No rules configured"
                }
            ]
        }

        const totalIngresses = ingresses.length

        // Calculate ingress-specific metrics
        const uniqueHosts = new Set()
        const uniqueExternalIPs = new Set()
        let totalRules = 0

        ingresses.forEach(ingress => {
            // Count unique hosts
            ingress.hosts.forEach(host => uniqueHosts.add(host))

            // Count unique external IPs
            ingress.externalIPs.forEach(ip => uniqueExternalIPs.add(ip))

            // Count rules (assuming this data is available)
            totalRules += ingress.hosts.length || 0
        })

        const configuredHosts = uniqueHosts.size
        const externalIPs = uniqueExternalIPs.size

        return [
            {
                title: "Total Ingresses",
                value: totalIngresses,
                subtitle: `${totalIngresses} ingress${totalIngresses !== 1 ? 'es' : ''}`,
                badge: getReplicaStatusBadge(totalIngresses, totalIngresses),
                icon: getResourceIcon("ingresses"),
                footer: totalIngresses > 0 ? "All ingress instances in cluster" : "No ingresses found"
            },
            {
                title: "Configured Hosts",
                value: configuredHosts,
                subtitle: `${configuredHosts} unique host${configuredHosts !== 1 ? 's' : ''}`,
                icon: getResourceIcon("services"),
                footer: configuredHosts > 0 ? "Hosts with ingress rules" : "No hosts configured"
            },
            {
                title: "External Access",
                value: externalIPs,
                subtitle: `${externalIPs} external endpoint${externalIPs !== 1 ? 's' : ''}`,
                icon: getResourceIcon("endpoints"),
                footer: externalIPs > 0 ? "External IP addresses/hostnames" : "No external access"
            },
            {
                title: "Ingress Rules",
                value: totalRules,
                subtitle: `${totalRules} routing rule${totalRules !== 1 ? 's' : ''}`,
                icon: getResourceIcon("configmaps"),
                footer: totalRules > 0 ? "Total routing rules configured" : "No rules configured"
            }
        ]
    }, [ingresses])

    return (
        <div className="space-y-6">
            {/* Header with connection status */}
            <div className="px-4 lg:px-6">
                <div className="flex items-center justify-between">
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <h1 className="text-2xl font-bold tracking-tight">Ingresses</h1>
                            {isConnected && (
                                <div className="flex items-center gap-1.5 text-xs text-green-600">
                                    <div className="size-2 bg-green-500 rounded-full animate-pulse" />
                                    Live
                                </div>
                            )}
                        </div>
                        <p className="text-muted-foreground">
                            Manage and monitor Ingress resources in your Kubernetes cluster

                        </p>
                    </div>
                    {lastUpdated && (
                        <div className="text-sm text-muted-foreground">
                            Last updated: {new Date(lastUpdated).toLocaleTimeString()}
                        </div>
                    )}
                </div>
            </div>

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
                    className="px-0 [&_tbody_tr]:bg-background/50"
                    renderFilters={({ table, selectedCount, totalCount }) => (
                        <div className="space-y-4">
                            <DataTableFilters
                                globalFilter={globalFilter}
                                onGlobalFilterChange={setGlobalFilter}
                                searchPlaceholder="Search ingresses by name, namespace, class, host, or address..."
                                categoryFilter={classFilter}
                                onCategoryFilterChange={setClassFilter}
                                categoryLabel="Filter by class"
                                categoryOptions={classOptions}
                                selectedCount={selectedCount}
                                totalCount={totalCount}
                                bulkActions={bulkActions.map(a => ({
                                    id: a.id,
                                    label: a.label,
                                    icon: a.icon ?? <IconCopy className="size-4" />,
                                    variant: a.variant === 'destructive' ? 'destructive' : 'default',
                                    requiresSelection: a.requiresSelection,
                                    action: () => a.action(table.getFilteredSelectedRowModel().rows.map(r => r.original as DashboardIngress))
                                }))}
                                table={table}
                                showColumnToggle={true}
                            />
                        </div>
                    )}
                />
            </div>

            {/* Bulk action confirmation dialog */}
            <ActionConfirmationDialog
                open={confirmDialogOpen}
                onOpenChange={setConfirmDialogOpen}
                title="Delete Ingresses"
                description="Are you sure you want to delete the selected ingresses? This action cannot be undone."
                actionLabel="Delete Ingresses"
                variant="destructive"
                isExecuting={isConfirmExecuting}
                onConfirm={handleConfirmAction}
                resources={(pendingAction?.ingresses || []).map(i => ({ name: i.name, namespace: i.namespace }))}
                safetyViolations={[]}
                warnings={[]}
            />

            {selectedIngressForDetails && (
                <IngressDetailDrawer
                    item={selectedIngressForDetails}
                    open={detailDrawerOpen}
                    onOpenChange={(open) => {
                        setDetailDrawerOpen(open)
                        if (!open) setSelectedIngressForDetails(null)
                    }}
                />
            )}
        </div>
    )
}
export function IngressesPageContainer() {
    return (
        <RouteGuard requiredCapabilities={["ingresses.list"]}>
            <IngressesContent />
        </RouteGuard>
    )
} 

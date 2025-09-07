"use client"

import * as React from "react"
import { RouteGuard } from "@/components/authz"
import { UniversalDataTable } from "@/components/data_tables/UniversalDataTable"
import { DataTableFilters } from "@/components/ui/data-table-filters"
import { IfAllowed } from "@/components/authz/IfAllowed"
import { useAuthzCapabilitiesInContext } from "@/hooks/useAuthzCapabilitiesSimple"
import { useCluster } from "@/hooks/useCluster"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { IconDotsVertical, IconEye, IconTrash, IconEdit, IconCopy, IconDownload, IconSettings, IconNetwork } from "@tabler/icons-react"
import { type ColumnDef } from "@/lib/table"
import type { DashboardIngressClass } from "@/lib/k8s-services"
import { IngressClassDetailDrawer } from "@/components/viewers/IngressClassDetailDrawer"
import { ResourceYamlEditor } from "@/components/ResourceYamlEditor"
import { SummaryCards, type SummaryCard } from "@/components/SummaryCards"
import { useIngressClassesWithWebSocket } from "@/hooks/useIngressClassesWithWebSocket"
import { useCapabilities } from "@/hooks/use-capabilities"
import { ActionConfirmationDialog } from "@/components/ui/action-confirmation-dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { bulkActionsApi } from "@/lib/api/bulk-actions"
import {
	getResourceIcon,
	getReplicaStatusBadge
} from "@/lib/summary-card-utils"

// Inner component that can access the namespace context
function IngressClassesContent() {
	const { data: ingressClasses, loading: isLoading, error, isConnected } = useIngressClassesWithWebSocket(true)
	const [lastUpdated, setLastUpdated] = React.useState<string | null>(null)
	const { fetchAdditional } = useCapabilities()
	const { clusterId } = useCluster()
	const { isAllowed } = useAuthzCapabilitiesInContext(['ingressclasses.get', 'ingressclasses.patch', 'ingressclasses.delete'])
	const [detailDrawerOpen, setDetailDrawerOpen] = React.useState(false)
	const [selectedIngressClassForDetails, setSelectedIngressClassForDetails] = React.useState<DashboardIngressClass | null>(null)
	const [confirmDialogOpen, setConfirmDialogOpen] = React.useState(false)
	const [isConfirmExecuting, setIsConfirmExecuting] = React.useState(false)
	const [pendingAction, setPendingAction] = React.useState<null | { type: 'delete', ingressClasses: DashboardIngressClass[] }>(null)
	const [alert, setAlert] = React.useState<null | { variant: 'success' | 'error', title: string, description?: string }>(null)

	// Ensure ingress class-specific action capabilities are requested
	React.useEffect(() => {
		fetchAdditional([
			'ingressclasses.get',
			'ingressclasses.patch',
			'ingressclasses.delete',
		]).catch(() => { /* noop */ })
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	// Update lastUpdated when ingress classes change
	React.useEffect(() => {
		if (ingressClasses.length > 0) {
			setLastUpdated(new Date().toISOString())
		}
	}, [ingressClasses])

	// Filters
	const [globalFilter, setGlobalFilter] = React.useState("")

	const filtered = React.useMemo(() => {
		const q = globalFilter.trim().toLowerCase()
		return ingressClasses.filter(ic => {
			const matchesQuery = !q ||
				ic.name.toLowerCase().includes(q) ||
				ic.controller.toLowerCase().includes(q) ||
				(ic.parametersKind && ic.parametersKind.toLowerCase().includes(q)) ||
				(ic.parametersName && ic.parametersName.toLowerCase().includes(q))
			return matchesQuery
		})
	}, [ingressClasses, globalFilter])

	// Handle opening detail drawer
	const handleViewDetails = React.useCallback((ingressClass: DashboardIngressClass) => {
		setSelectedIngressClassForDetails(ingressClass)
		setDetailDrawerOpen(true)
	}, [setSelectedIngressClassForDetails, setDetailDrawerOpen])

	// Build table columns
	const columns: ColumnDef<DashboardIngressClass>[] = React.useMemo(() => ([
		{
			accessorKey: 'name',
			header: 'Class Name',
			cell: ({ row }) => (
				<IfAllowed
					feature="ingressclasses.get"
					cluster={clusterId}
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
			accessorKey: 'controller',
			header: 'Controller',
			cell: ({ row }) => (
				<div className="text-sm font-mono">{row.original.controller}</div>
			)
		},
		{
			accessorKey: 'isDefault',
			header: 'Default',
			cell: ({ row }) => (
				<div className="flex items-center">
					{row.original.isDefault ? (
						<Badge variant="default" className="text-xs">
							Default
						</Badge>
					) : (
						<span className="text-muted-foreground text-xs">-</span>
					)}
				</div>
			)
		},
		{
			accessorKey: 'parametersName',
			header: 'Parameters',
			cell: ({ row }) => (
				<div className="text-sm">
					{row.original.parametersName || <span className="text-muted-foreground">None</span>}
				</div>
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
						<IfAllowed feature="ingressclasses.get" cluster={clusterId} resourceName={row.original.name}
							fallback={<DropdownMenuItem disabled className="text-muted-foreground"><IconEye className="size-4 mr-2" />View Details</DropdownMenuItem>}
						>
							<DropdownMenuItem onClick={() => handleViewDetails(row.original)}>
								<IconEye className="size-4 mr-2" />
								View Details
							</DropdownMenuItem>
						</IfAllowed>
						<IfAllowed feature="ingressclasses.patch" cluster={clusterId} resourceName={row.original.name}
							fallback={<DropdownMenuItem disabled className="text-muted-foreground"><IconEdit className="size-4 mr-2" />Edit YAML</DropdownMenuItem>}
						>
							<ResourceYamlEditor
								resourceName={row.original.name}
								namespace=""
								resourceKind="IngressClass"
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
						<IfAllowed feature="ingressclasses.delete" cluster={clusterId} resourceName={row.original.name}
							fallback={<DropdownMenuItem disabled className="text-muted-foreground"><IconTrash className="size-4 mr-2" />Delete</DropdownMenuItem>}
						>
							<DropdownMenuItem className="text-red-600" onClick={() => { setPendingAction({ type: 'delete', ingressClasses: [row.original] }); setConfirmDialogOpen(true) }}>
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
		const actions: { id: string, label: string, icon?: React.ReactNode, variant?: 'default' | 'destructive', requiresSelection?: boolean, action: (rows: DashboardIngressClass[]) => void | Promise<void> }[] = []

		actions.push({
			id: 'copy-names',
			label: 'Copy Names',
			icon: <IconCopy className="size-4" />,
			requiresSelection: true,
			action: (rows) => navigator.clipboard.writeText(rows.map(r => r.name).join('\n'))
		})

		if (isAllowed('ingressclasses.get')) {
			actions.push({
				id: 'export-yaml',
				label: 'Export to YAML',
				icon: <IconDownload className="size-4" />,
				requiresSelection: true,
				action: (rows) => {
					const yamlContent = rows.map(ic => `---\n${JSON.stringify(ic, null, 2)}`).join('\n')
					const blob = new Blob([yamlContent], { type: 'text/yaml' })
					const url = URL.createObjectURL(blob)
					const a = document.createElement('a')
					a.href = url
					a.download = `ingress-classes-${new Date().toISOString().split('T')[0]}.yaml`
					document.body.appendChild(a)
					a.click()
					document.body.removeChild(a)
					URL.revokeObjectURL(url)
				}
			})
		}

		if (isAllowed('ingressclasses.patch')) {
			actions.push({
				id: 'set-default',
				label: 'Set as Default',
				icon: <IconSettings className="size-4" />,
				requiresSelection: true,
				action: (rows) => {
					console.log("Setting ingress classes as default:", rows.map(ic => ic.name))
					// TODO: Implement setting ingress class as default
				}
			})

			actions.push({
				id: 'network-config',
				label: 'Network Configuration',
				icon: <IconNetwork className="size-4" />,
				requiresSelection: true,
				action: (rows) => {
					console.log("Opening network configuration for:", rows.map(ic => ic.name))
					// TODO: Implement network configuration
				}
			})
		}

		if (isAllowed('ingressclasses.delete')) {
			actions.push({
				id: 'delete-ingress-classes',
				label: 'Delete Selected Classes',
				icon: <IconTrash className="size-4" />,
				variant: 'destructive',
				requiresSelection: true,
				action: (rows) => { setPendingAction({ type: 'delete', ingressClasses: rows }); setConfirmDialogOpen(true) }
			})
		}

		return actions
	}, [isAllowed, setPendingAction, setConfirmDialogOpen])

	// Handle confirmation dialog
	const handleConfirmAction = React.useCallback(async () => {
		if (!pendingAction) return
		setIsConfirmExecuting(true)
		try {
			const targets = pendingAction.ingressClasses.map(ic => ({ name: ic.name }))
			const resp = await bulkActionsApi.executeBulkAction('ingressclasses', { action: 'delete-ingressclasses', targets })
			const success = resp?.success
			const total = resp?.resources_total ?? 0
			const affected = resp?.resources_affected ?? 0
			setAlert({ variant: success ? 'success' : 'error', title: success ? `Success: ${affected}/${total} ingress classes processed` : `Errors: ${total - affected} failed`, description: resp?.message })
		} catch (e: unknown) {
			const errorMessage = e instanceof Error ? e.message : String(e)
			setAlert({ variant: 'error', title: 'Action failed', description: errorMessage })
		} finally {
			setIsConfirmExecuting(false)
			setConfirmDialogOpen(false)
			setPendingAction(null)
		}
	}, [pendingAction])

	// Generate summary cards from ingress class data
	const summaryData: SummaryCard[] = React.useMemo(() => {
		if (!ingressClasses || ingressClasses.length === 0) {
			return [
				{
					title: "Total Classes",
					value: 0,
					subtitle: "No ingress classes found"
				},
				{
					title: "In Use",
					value: 0,
					subtitle: "No classes in use"
				},
				{
					title: "Default Class",
					value: "None",
					subtitle: "No default class set"
				},
				{
					title: "Created Last 24h",
					value: 0,
					subtitle: "No recent classes"
				}
			]
		}

		const totalClasses = ingressClasses.length

		// Calculate ingress class-specific metrics
		const defaultClasses = ingressClasses.filter(ic => ic.isDefault)
		const hasDefaultClass = defaultClasses.length > 0
		const defaultClassName = hasDefaultClass ? defaultClasses[0].name : "None"

		// Count classes created in the last 24 hours
		const recentClasses = ingressClasses.filter(ic => {
			// This would need age parsing, for now we'll estimate based on age string
			return ic.age.includes('m') || ic.age.includes('h') || (ic.age.includes('d') && parseInt(ic.age) === 1)
		}).length

		// Note: "In Use" count would need additional data from ingresses to show actual usage
		// For now, we'll show total classes as a placeholder
		const inUseCount = totalClasses // This should be calculated from actual ingress usage

		return [
			{
				title: "Total Classes",
				value: totalClasses,
				subtitle: `${totalClasses} ingress class${totalClasses !== 1 ? 'es' : ''}`,
				badge: getReplicaStatusBadge(totalClasses, totalClasses),
				icon: getResourceIcon("ingressclasses"),
				footer: totalClasses > 0 ? "All ingress class instances in cluster" : "No ingress classes found"
			},
			{
				title: "In Use",
				value: inUseCount,
				subtitle: `${inUseCount} class${inUseCount !== 1 ? 'es' : ''} with ingresses`,
				icon: getResourceIcon("ingresses"),
				footer: inUseCount > 0 ? "Classes referenced by ingresses" : "No classes currently in use"
			},
			{
				title: "Default Class",
				value: hasDefaultClass ? "Set" : "None",
				subtitle: hasDefaultClass ? defaultClassName : "No default class configured",
				badge: hasDefaultClass ? getReplicaStatusBadge(1, 1) : undefined,
				icon: getResourceIcon("configmaps"),
				footer: hasDefaultClass ? "Default class for new ingresses" : "Configure a default class"
			},
			{
				title: "Created Last 24h",
				value: recentClasses,
				subtitle: `${recentClasses} class${recentClasses !== 1 ? 'es' : ''} created recently`,
				icon: getResourceIcon("services"),
				footer: recentClasses > 0 ? "Recently created classes" : "No recent activity"
			}
		]
	}, [ingressClasses])

	return (
		<div className="space-y-6">
			{/* Header with connection status */}
			<div className="px-4 lg:px-6">
				<div className="flex items-center justify-between">
					<div className="space-y-2">
						<div className="flex items-center gap-2">
							<h1 className="text-2xl font-bold tracking-tight">Ingress Classes</h1>
							{isConnected && (
								<div className="flex items-center gap-1.5 text-xs text-green-600">
									<div className="size-2 bg-green-500 rounded-full animate-pulse" />
									Live
								</div>
							)}
						</div>
						<p className="text-muted-foreground">
							Manage and monitor IngressClass resources in your Kubernetes cluster
						</p>
					</div>
					{lastUpdated && (
						<div className="text-sm text-muted-foreground">
							Last updated: {new Date(lastUpdated).toLocaleTimeString()}
						</div>
					)}
				</div>
			</div>

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
								searchPlaceholder="Search ingress classes by name, controller, or parameters..."
								selectedCount={selectedCount}
								totalCount={totalCount}
								bulkActions={bulkActions.map(a => ({
									id: a.id,
									label: a.label,
									icon: a.icon ?? <IconCopy className="size-4" />,
									variant: a.variant === 'destructive' ? 'destructive' : 'default',
									requiresSelection: a.requiresSelection,
									action: () => a.action(table.getFilteredSelectedRowModel().rows.map(r => r.original as DashboardIngressClass))
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
				title="Delete Ingress Classes"
				description="Are you sure you want to delete the selected ingress classes? This action cannot be undone."
				actionLabel="Delete Ingress Classes"
				variant="destructive"
				isExecuting={isConfirmExecuting}
				onConfirm={handleConfirmAction}
				resources={(pendingAction?.ingressClasses || []).map(ic => ({ name: ic.name }))}
				safetyViolations={[]}
				warnings={[]}
			/>

			{selectedIngressClassForDetails && (
				<IngressClassDetailDrawer
					item={selectedIngressClassForDetails}
					open={detailDrawerOpen}
					onOpenChange={(open) => {
						setDetailDrawerOpen(open)
						if (!open) setSelectedIngressClassForDetails(null)
					}}
				/>
			)}
		</div>
	)
}

export function IngressClassesPageContainer() {
	return (
		<RouteGuard requiredCapabilities={["ingressclasses.list"]}>
			<IngressClassesContent />
		</RouteGuard>
	)
}

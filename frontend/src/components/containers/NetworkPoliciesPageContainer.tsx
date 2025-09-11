"use client"

import * as React from "react"
import { UniversalDataTable } from "@/components/data_tables/UniversalDataTable"
import { DataTableFilters, type FilterOption } from "@/components/ui/data-table-filters"
import { SummaryCards, type SummaryCard } from "@/components/SummaryCards"
import { useNetworkPoliciesWithWebSocket } from "@/hooks/useNetworkPoliciesWithWebSocket"
import {
	getReplicaStatusBadge,
	getResourceIcon,
	getHealthTrendBadge
} from "@/lib/summary-card-utils"
import { RouteGuard } from "@/components/authz"
import { IfAllowed } from "@/components/authz/IfAllowed"
import { useCapabilities } from "@/hooks/use-capabilities"
import { useAuthzCapabilitiesInContext } from "@/hooks/useAuthzCapabilitiesSimple"
import { useCluster } from "@/hooks/useCluster"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { IconDotsVertical, IconEye, IconTrash, IconEdit, IconCopy, IconDownload, IconNetwork } from "@tabler/icons-react"
import { type ColumnDef } from "@/lib/table"
import type { DashboardNetworkPolicy } from "@/lib/k8s-services"
import { NetworkPolicyDetailDrawer } from "@/components/viewers/NetworkPolicyDetailDrawer"
import { ResourceYamlEditor } from "@/components/ResourceYamlEditor"
import { ActionConfirmationDialog } from "@/components/ui/action-confirmation-dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

// Inner component that can access the namespace context
function NetworkPoliciesContent() {
	const { data: networkPolicies, loading: isLoading, error, isConnected } = useNetworkPoliciesWithWebSocket(true)
	const [lastUpdated, setLastUpdated] = React.useState<string | null>(null)
	const { fetchAdditional } = useCapabilities()
	const { clusterId } = useCluster()
	const { isAllowed } = useAuthzCapabilitiesInContext(['networkpolicies.get', 'networkpolicies.patch', 'networkpolicies.delete'])
	const [detailDrawerOpen, setDetailDrawerOpen] = React.useState(false)
	const [selectedNetworkPolicyForDetails, setSelectedNetworkPolicyForDetails] = React.useState<DashboardNetworkPolicy | null>(null)
	const [confirmDialogOpen, setConfirmDialogOpen] = React.useState(false)
	const [isConfirmExecuting, setIsConfirmExecuting] = React.useState(false)
	const [pendingAction, setPendingAction] = React.useState<null | { type: 'delete', policies: DashboardNetworkPolicy[] }>(null)
	const [alert, setAlert] = React.useState<null | { variant: 'success' | 'error', title: string, description?: string }>(null)

	React.useEffect(() => {
		fetchAdditional([
			'networkpolicies.get',
			'networkpolicies.patch',
			'networkpolicies.delete',
		]).catch(() => { /* noop */ })
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	// Update lastUpdated when network policies change
	React.useEffect(() => {
		if (networkPolicies.length > 0) {
			setLastUpdated(new Date().toISOString())
		}
	}, [networkPolicies])

	// Generate summary cards from network policy data
	const summaryData: SummaryCard[] = React.useMemo(() => {
		if (!networkPolicies || networkPolicies.length === 0) {
			return [
				{
					title: "Total Policies",
					value: 0,
					subtitle: "No network policies found"
				},
				{
					title: "With Ingress Rules",
					value: 0,
					subtitle: "No policies with ingress rules"
				},
				{
					title: "With Egress Rules",
					value: 0,
					subtitle: "No policies with egress rules"
				},
				{
					title: "Namespaces Protected",
					value: 0,
					subtitle: "No protected namespaces"
				}
			]
		}

		const totalPolicies = networkPolicies.length
		const policiesWithIngress = networkPolicies.filter(np => np.ingressRules > 0).length
		const policiesWithEgress = networkPolicies.filter(np => np.egressRules > 0).length
		const uniqueNamespaces = new Set(networkPolicies.map(np => np.namespace)).size

		// Calculate metrics for badges
		const ingressPercentage = totalPolicies > 0 ? (policiesWithIngress / totalPolicies) * 100 : 0
		const egressPercentage = totalPolicies > 0 ? (policiesWithEgress / totalPolicies) * 100 : 0

		return [
			{
				title: "Total Policies",
				value: totalPolicies,
				subtitle: `${totalPolicies} network ${totalPolicies === 1 ? 'policy' : 'policies'}`,
				badge: getReplicaStatusBadge(totalPolicies, totalPolicies),
				icon: getResourceIcon("networkpolicies"),
				footer: totalPolicies > 0 ? "Network traffic control policies" : "No network policies found"
			},
			{
				title: "With Ingress Rules",
				value: policiesWithIngress,
				subtitle: `${ingressPercentage.toFixed(0)}% of policies`,
				badge: getHealthTrendBadge(ingressPercentage, true),
				icon: getResourceIcon("networkpolicies"),
				footer: `Controlling incoming traffic to ${policiesWithIngress} ${policiesWithIngress === 1 ? 'policy' : 'policies'}`
			},
			{
				title: "With Egress Rules",
				value: policiesWithEgress,
				subtitle: `${egressPercentage.toFixed(0)}% of policies`,
				badge: getHealthTrendBadge(egressPercentage, true),
				icon: getResourceIcon("networkpolicies"),
				footer: `Controlling outgoing traffic from ${policiesWithEgress} ${policiesWithEgress === 1 ? 'policy' : 'policies'}`
			},
			{
				title: "Namespaces Protected",
				value: uniqueNamespaces,
				subtitle: `${uniqueNamespaces} unique ${uniqueNamespaces === 1 ? 'namespace' : 'namespaces'}`,
				badge: getReplicaStatusBadge(uniqueNamespaces, uniqueNamespaces),
				icon: getResourceIcon("networkpolicies"),
				footer: uniqueNamespaces > 0 ? "Namespaces with active network policies" : "No protected namespaces"
			}
		]
	}, [networkPolicies])

	// Filters
	const [globalFilter, setGlobalFilter] = React.useState("")
	const [policyTypeFilter, setPolicyTypeFilter] = React.useState<string>("all")

	const policyTypeOptions: FilterOption[] = React.useMemo(() => {
		const types = new Set<string>()
		networkPolicies.forEach(policy => {
			if (policy.policyTypes) {
				// Split policy types if they're comma-separated
				const policyTypeList = policy.policyTypes.split(',').map(t => t.trim())
				policyTypeList.forEach(type => types.add(type))
			}
		})
		return Array.from(types).sort().map(type => ({
			value: type,
			label: type,
			badge: (
				<Badge variant="outline" className="text-purple-600 border-border bg-transparent px-1.5">
					<IconNetwork className="size-3 mr-1" />
					{type}
				</Badge>
			)
		}))
	}, [networkPolicies])

	const filtered = React.useMemo(() => {
		let filteredData = networkPolicies

		// Apply policy type filter
		if (policyTypeFilter !== "all") {
			filteredData = filteredData.filter(policy =>
				policy.policyTypes && policy.policyTypes.includes(policyTypeFilter)
			)
		}

		// Apply global filter (search)
		if (globalFilter) {
			const searchTerm = globalFilter.toLowerCase()
			filteredData = filteredData.filter(policy =>
				policy.name.toLowerCase().includes(searchTerm) ||
				policy.namespace.toLowerCase().includes(searchTerm) ||
				(policy.podSelector && policy.podSelector.toLowerCase().includes(searchTerm)) ||
				(policy.policyTypes && policy.policyTypes.toLowerCase().includes(searchTerm)) ||
				(policy.affectedPods && policy.affectedPods.toString().includes(searchTerm)) ||
				policy.age.toLowerCase().includes(searchTerm)
			)
		}

		return filteredData
	}, [networkPolicies, policyTypeFilter, globalFilter])

	// Handle opening detail drawer
	const handleViewDetails = React.useCallback((networkPolicy: DashboardNetworkPolicy) => {
		setSelectedNetworkPolicyForDetails(networkPolicy)
		setDetailDrawerOpen(true)
	}, [])

	const columns: ColumnDef<DashboardNetworkPolicy>[] = React.useMemo(() => ([
		{
			accessorKey: 'name',
			header: 'Network Policy Name',
			cell: ({ row }: { row: { original: DashboardNetworkPolicy } }) => (
				<IfAllowed
					feature="networkpolicies.get"
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
			enableHiding: false,
		},
		{
			accessorKey: 'namespace',
			header: 'Namespace',
			cell: ({ row }: { row: { original: DashboardNetworkPolicy } }) => (
				<Badge variant="outline" className="text-muted-foreground px-1.5">
					{row.original.namespace}
				</Badge>
			),
		},
		{
			accessorKey: 'podSelector',
			header: 'Pod Selector',
			cell: ({ row }: { row: { original: DashboardNetworkPolicy } }) => (
				<div className="text-sm">{row.original.podSelector}</div>
			),
		},
		{
			accessorKey: 'ingressRules',
			header: 'Ingress Rules',
			cell: ({ row }: { row: { original: DashboardNetworkPolicy } }) => (
				<div className="font-mono text-sm">{row.original.ingressRules}</div>
			),
		},
		{
			accessorKey: 'egressRules',
			header: 'Egress Rules',
			cell: ({ row }: { row: { original: DashboardNetworkPolicy } }) => (
				<div className="font-mono text-sm">{row.original.egressRules}</div>
			),
		},
		{
			accessorKey: 'policyTypes',
			header: 'Policy Types',
			cell: ({ row }: { row: { original: DashboardNetworkPolicy } }) => (
				<div className="text-sm">{row.original.policyTypes}</div>
			),
		},
		{
			accessorKey: 'affectedPods',
			header: 'Affected Pods',
			cell: ({ row }: { row: { original: DashboardNetworkPolicy } }) => (
				<div className="font-mono text-sm">{row.original.affectedPods}</div>
			),
		},
		{
			accessorKey: 'age',
			header: 'Age',
			cell: ({ row }: { row: { original: DashboardNetworkPolicy } }) => (
				<div className="font-mono text-sm">{row.original.age}</div>
			),
		},
		{
			id: 'actions',
			cell: ({ row }: { row: { original: DashboardNetworkPolicy } }) => (
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
						<IfAllowed feature="networkpolicies.get" cluster={clusterId} namespace={row.original.namespace} resourceName={row.original.name}
							fallback={<DropdownMenuItem disabled className="text-muted-foreground"><IconEye className="size-4 mr-2" />View Details</DropdownMenuItem>}
						>
							<DropdownMenuItem onClick={() => handleViewDetails(row.original)}>
								<IconEye className="size-4 mr-2" />
								View Details
							</DropdownMenuItem>
						</IfAllowed>
						<IfAllowed feature="networkpolicies.patch" cluster={clusterId} namespace={row.original.namespace} resourceName={row.original.name}
							fallback={<DropdownMenuItem disabled className="text-muted-foreground"><IconEdit className="size-4 mr-2" />Edit YAML</DropdownMenuItem>}
						>
							<ResourceYamlEditor
								resourceName={row.original.name}
								namespace={row.original.namespace}
								resourceKind="NetworkPolicy"
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
						<IfAllowed feature="networkpolicies.delete" cluster={clusterId} namespace={row.original.namespace} resourceName={row.original.name}
							fallback={<DropdownMenuItem disabled className="text-muted-foreground"><IconTrash className="size-4 mr-2" />Delete</DropdownMenuItem>}
						>
							<DropdownMenuItem className="text-red-600" onClick={() => { setPendingAction({ type: 'delete', policies: [row.original] }); setConfirmDialogOpen(true) }}>
								<IconTrash className="size-4 mr-2" />
								Delete
							</DropdownMenuItem>
						</IfAllowed>
					</DropdownMenuContent>
				</DropdownMenu>
			)
		}
	]), [clusterId, handleViewDetails])

	// Bulk actions based on original NetworkPoliciesDataTable
	const bulkActions = React.useMemo(() => {
		const actions: { id: string, label: string, icon?: React.ReactNode, variant?: 'default' | 'destructive', requiresSelection?: boolean, action: (rows: DashboardNetworkPolicy[]) => void | Promise<void> }[] = []

		actions.push({
			id: 'copy-names',
			label: 'Copy Names',
			icon: <IconCopy className="size-4" />,
			requiresSelection: true,
			action: (rows) => navigator.clipboard.writeText(rows.map(r => r.name).join('\n'))
		})

		if (isAllowed('networkpolicies.get')) {
			actions.push({
				id: 'export-yaml',
				label: 'Export Selected as YAML',
				icon: <IconDownload className="size-4" />,
				requiresSelection: true,
				action: (rows) => {
					console.log('Export YAML for network policies:', rows.map(p => `${p.name} in ${p.namespace}`))
				}
			})
		}

		if (isAllowed('networkpolicies.delete')) {
			actions.push({
				id: 'delete-policies',
				label: 'Delete Selected Policies',
				icon: <IconTrash className="size-4" />,
				variant: 'destructive',
				requiresSelection: true,
				action: (rows) => { setPendingAction({ type: 'delete', policies: rows }); setConfirmDialogOpen(true) }
			})
		}

		return actions
	}, [isAllowed])

	const handleConfirmAction = React.useCallback(async () => {
		if (!pendingAction) return
		setIsConfirmExecuting(true)
		try {
			// Simulate API call for deleting network policies
			console.log('Delete network policies:', pendingAction.policies.map(p => `${p.name} in ${p.namespace}`))
			setAlert({ variant: 'success', title: `Success: ${pendingAction.policies.length} network policies deleted` })
		} catch (e: unknown) {
			setAlert({ variant: 'error', title: 'Action failed', description: e instanceof Error ? e.message : String(e) })
		} finally {
			setIsConfirmExecuting(false)
			setConfirmDialogOpen(false)
			setPendingAction(null)
		}
	}, [pendingAction])

	return (
		<div className="space-y-6">


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
								searchPlaceholder="Search network policies by name, namespace, pod selector, policy types, or affected pods... (Press '/' to focus)"
								categoryFilter={policyTypeFilter}
								onCategoryFilterChange={setPolicyTypeFilter}
								categoryLabel="Filter by policy type"
								categoryOptions={policyTypeOptions}
								selectedCount={selectedCount}
								totalCount={totalCount}
								bulkActions={bulkActions.map(a => ({
									id: a.id,
									label: a.label,
									icon: a.icon || undefined,
									variant: a.variant || 'default',
									requiresSelection: a.requiresSelection,
									action: () => a.action(table.getFilteredSelectedRowModel().rows.map((r: { original: DashboardNetworkPolicy }) => r.original))
								}))}
								table={table}
								showColumnToggle={true}
							/>
						</div>
					)}
				/>
			</div>

			{/* Controlled detail drawer for full network policy details */}
			{selectedNetworkPolicyForDetails && (
				<NetworkPolicyDetailDrawer
					item={selectedNetworkPolicyForDetails}
					open={detailDrawerOpen}
					onOpenChange={(open: boolean) => {
						setDetailDrawerOpen(open)
						if (!open) {
							setSelectedNetworkPolicyForDetails(null)
						}
					}}
				/>
			)}

			{/* Bulk action confirmation dialog */}
			<ActionConfirmationDialog
				open={confirmDialogOpen}
				onOpenChange={setConfirmDialogOpen}
				title="Delete Network Policies"
				description="Are you sure you want to delete the selected network policies? This action cannot be undone."
				actionLabel="Delete Policies"
				variant="destructive"
				isExecuting={isConfirmExecuting}
				onConfirm={handleConfirmAction}
				resources={(pendingAction?.policies || []).map(p => ({ name: p.name, namespace: p.namespace }))}
				safetyViolations={[]}
				warnings={[]}
			/>
		</div>
	)
}

export function NetworkPoliciesPageContainer() {
	return (
		<RouteGuard requiredCapabilities={["networkpolicies.list"]}>
			<NetworkPoliciesContent />
		</RouteGuard>
	)
}

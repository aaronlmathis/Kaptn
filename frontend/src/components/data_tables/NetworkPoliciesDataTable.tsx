"use client"

import * as React from "react"
import {
	closestCenter,
	DndContext,
	KeyboardSensor,
	MouseSensor,
	TouchSensor,
	useSensor,
	useSensors,
	type DragEndEvent,
	type UniqueIdentifier,
} from "@dnd-kit/core"
import { restrictToVerticalAxis } from "@dnd-kit/modifiers"
import {
	arrayMove,
	SortableContext,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {
	IconChevronLeft,
	IconChevronRight,
	IconChevronsLeft,
	IconChevronsRight,
	IconDotsVertical,
	IconGripVertical,
	IconLoader,
	IconAlertTriangle,
	IconTrash,
	IconEdit,
	IconEye,
	IconDownload,
	IconCopy,
	IconNetwork,
} from "@tabler/icons-react"

import {
	flexRender,
	getCoreRowModel,
	getFacetedRowModel,
	getFacetedUniqueValues,
	getFilteredRowModel,
	getPaginationRowModel,
	getSortedRowModel,
	useReactTable,
	type ColumnDef,
	type Row,
	type VisibilityState,
	type SortingState,
	type ColumnFiltersState,
} from "@/lib/table"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table"

import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { DataTableFilters } from "@/components/ui/data-table-filters"
import { NetworkPolicyDetailDrawer } from "@/components/viewers/NetworkPolicyDetailDrawer"
import { ResourceYamlEditor } from "@/components/ResourceYamlEditor"
import { useNetworkPoliciesWithWebSocket } from "@/hooks/useNetworkPoliciesWithWebSocket"
import { useNamespace } from "@/contexts/namespace-context"
import { networkPolicySchema } from "@/lib/schemas/networkpolicy"
import { z } from "zod"

// Drag handle component
function DragHandle({ id }: { id: number }) {
	const { attributes, listeners } = useSortable({
		id,
	})

	return (
		<Button
			{...attributes}
			{...listeners}
			variant="ghost"
			size="icon"
			className="text-muted-foreground size-7 hover:bg-transparent"
		>
			<IconGripVertical className="text-muted-foreground size-3" />
			<span className="sr-only">Drag to reorder</span>
		</Button>
	)
}

// Column definitions for NetworkPolicies table
const createColumns = (
	onViewDetails: (networkPolicy: z.infer<typeof networkPolicySchema>) => void
): ColumnDef<z.infer<typeof networkPolicySchema>>[] => [
		{
			id: "drag",
			header: () => null,
			cell: ({ row }) => <DragHandle id={row.original.id} />,
			size: 50,
			maxSize: 50,
		},
		{
			id: "select",
			header: ({ table }) => (
				<div className="flex items-center justify-center">
					<Checkbox
						checked={
							table.getIsAllPageRowsSelected() ||
							(table.getIsSomePageRowsSelected() && "indeterminate")
						}
						onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
						aria-label="Select all"
					/>
				</div>
			),
			cell: ({ row }) => (
				<div className="flex items-center justify-center">
					<Checkbox
						checked={row.getIsSelected()}
						onCheckedChange={(value) => row.toggleSelected(!!value)}
						aria-label="Select row"
					/>
				</div>
			),
			enableSorting: false,
			enableHiding: false,
			size: 50,
			maxSize: 50,
		},
		{
			accessorKey: "name",
			header: "Network Policy Name",
			cell: ({ row }) => {
				return (
					<button
						onClick={() => onViewDetails(row.original)}
						className="text-left hover:underline focus:underline focus:outline-none"
					>
						{row.original.name}
					</button>
				)
			},
			enableHiding: false,
		},
		{
			accessorKey: "namespace",
			header: "Namespace",
			cell: ({ row }) => (
				<Badge variant="outline" className="text-muted-foreground px-1.5">
					{row.original.namespace}
				</Badge>
			),
		},
		{
			accessorKey: "podSelector",
			header: "Pod Selector",
			cell: ({ row }) => (
				<div className="text-sm">{row.original.podSelector}</div>
			),
		},
		{
			accessorKey: "ingressRules",
			header: "Ingress Rules",
			cell: ({ row }) => (
				<div className="font-mono text-sm">{row.original.ingressRules}</div>
			),
		},
		{
			accessorKey: "egressRules",
			header: "Egress Rules",
			cell: ({ row }) => (
				<div className="font-mono text-sm">{row.original.egressRules}</div>
			),
		},
		{
			accessorKey: "policyTypes",
			header: "Policy Types",
			cell: ({ row }) => (
				<div className="text-sm">{row.original.policyTypes}</div>
			),
		},
		{
			accessorKey: "affectedPods",
			header: "Affected Pods",
			cell: ({ row }) => (
				<div className="font-mono text-sm">{row.original.affectedPods}</div>
			),
		},
		{
			accessorKey: "age",
			header: "Age",
			cell: ({ row }) => (
				<div className="font-mono text-sm">{row.original.age}</div>
			),
		},
		{
			id: "actions",
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
					<DropdownMenuContent align="end" className="w-40">
						<DropdownMenuItem
							onClick={() => onViewDetails(row.original)}
						>
							<IconEye className="size-4 mr-2" />
							View Details
						</DropdownMenuItem>
						<ResourceYamlEditor
							resourceName={row.original.name}
							namespace={row.original.namespace}
							resourceKind="NetworkPolicy"
						>
							<button
								className="flex w-full items-center gap-2 px-2 py-1.5 text-sm hover:bg-accent rounded-sm cursor-pointer"
								style={{
									background: 'transparent',
									border: 'none',
									textAlign: 'left'
								}}
							>
								<IconEdit className="size-4" />
								Edit YAML
							</button>
						</ResourceYamlEditor>
						<DropdownMenuSeparator />
						<DropdownMenuItem className="text-red-600">
							<IconTrash className="size-4 mr-2" />
							Delete
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			),
		},
	]

// Draggable row component
function DraggableRow({ row }: { row: Row<z.infer<typeof networkPolicySchema>> }) {
	const {
		transform,
		transition,
		setNodeRef,
		isDragging,
	} = useSortable({
		id: row.original.id,
	})

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
	}

	return (
		<TableRow
			ref={setNodeRef}
			style={style}
			data-state={row.getIsSelected() && "selected"}
			className={isDragging ? "opacity-50" : ""}
		>
			{row.getVisibleCells().map((cell) => (
				<TableCell key={cell.id}>
					{flexRender(cell.column.columnDef.cell, cell.getContext())}
				</TableCell>
			))}
		</TableRow>
	)
}

export function NetworkPoliciesDataTable() {
	const { data: networkPolicies, loading, error, refetch, isConnected } = useNetworkPoliciesWithWebSocket(true)
	const { selectedNamespace } = useNamespace()

	const [globalFilter, setGlobalFilter] = React.useState("")
	const [policyTypeFilter, setPolicyTypeFilter] = React.useState<string>("all")
	const [sorting, setSorting] = React.useState<SortingState>([])
	const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
	const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({})
	const [rowSelection, setRowSelection] = React.useState({})
	const [detailDrawerOpen, setDetailDrawerOpen] = React.useState(false)
	const [selectedNetworkPolicyForDetails, setSelectedNetworkPolicyForDetails] = React.useState<z.infer<typeof networkPolicySchema> | null>(null)

	// Handle opening detail drawer
	const handleViewDetails = React.useCallback((networkPolicy: z.infer<typeof networkPolicySchema>) => {
		setSelectedNetworkPolicyForDetails(networkPolicy)
		setDetailDrawerOpen(true)
	}, [])

	// Create columns with the onViewDetails callback
	const columns = React.useMemo(
		() => createColumns(handleViewDetails),
		[handleViewDetails]
	)

	// Create filter options for policy types
	const policyTypes = React.useMemo(() => {
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

	// Filter data based on global filter and policy type filter
	const filteredData = React.useMemo(() => {
		let filtered = networkPolicies

		// Apply policy type filter
		if (policyTypeFilter !== "all") {
			filtered = filtered.filter(policy =>
				policy.policyTypes && policy.policyTypes.includes(policyTypeFilter)
			)
		}

		// Apply global filter (search)
		if (globalFilter) {
			const searchTerm = globalFilter.toLowerCase()
			filtered = filtered.filter(policy =>
				policy.name.toLowerCase().includes(searchTerm) ||
				policy.namespace.toLowerCase().includes(searchTerm) ||
				(policy.podSelector && policy.podSelector.toLowerCase().includes(searchTerm)) ||
				(policy.policyTypes && policy.policyTypes.toLowerCase().includes(searchTerm)) ||
				(policy.affectedPods && policy.affectedPods.toString().includes(searchTerm)) ||
				policy.age.toLowerCase().includes(searchTerm)
			)
		}

		return filtered
	}, [networkPolicies, policyTypeFilter, globalFilter])

	const table = useReactTable({
		data: filteredData,
		columns,
		onSortingChange: setSorting,
		onColumnFiltersChange: setColumnFilters,
		getCoreRowModel: getCoreRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		onColumnVisibilityChange: setColumnVisibility,
		onRowSelectionChange: setRowSelection,
		getFacetedRowModel: getFacetedRowModel(),
		getFacetedUniqueValues: getFacetedUniqueValues(),
		state: {
			sorting,
			columnFilters,
			columnVisibility,
			rowSelection,
		},
	})

	// Drag and drop setup
	const sensors = useSensors(
		useSensor(MouseSensor, {}),
		useSensor(TouchSensor, {}),
		useSensor(KeyboardSensor, {})
	)

	const [sortableIds, setSortableIds] = React.useState<UniqueIdentifier[]>(
		networkPolicies.map((networkPolicy) => networkPolicy.id)
	)

	React.useEffect(() => {
		setSortableIds(networkPolicies.map((networkPolicy) => networkPolicy.id))
	}, [networkPolicies])

	function handleDragEnd(event: DragEndEvent) {
		const { active, over } = event
		if (over && active.id !== over.id) {
			setSortableIds((ids) => {
				const oldIndex = ids.indexOf(active.id)
				const newIndex = ids.indexOf(over.id)
				return arrayMove(ids, oldIndex, newIndex)
			})
		}
	}

	if (loading) {
		return (
			<div className="px-4 lg:px-6">
				<div className="flex items-center justify-center py-10">
					<IconLoader className="size-6 animate-spin" />
					<span className="ml-2">Loading network policies...</span>
				</div>
			</div>
		)
	}

	if (error) {
		return (
			<div className="px-4 lg:px-6">
				<div className="flex items-center justify-center py-10 text-red-600">
					<IconAlertTriangle className="size-6" />
					<span className="ml-2">Error: {error}</span>
				</div>
			</div>
		)
	}

	return (
		<div className="px-4 lg:px-6">
			<div className="space-y-4">
				{/* Search and filter controls */}
				<DataTableFilters
					globalFilter={globalFilter}
					onGlobalFilterChange={setGlobalFilter}
					searchPlaceholder="Search network policies by name, namespace, pod selector, policy types, or affected pods... (Press '/' to focus)"
					categoryFilter={policyTypeFilter}
					onCategoryFilterChange={setPolicyTypeFilter}
					categoryLabel="Filter by policy type"
					categoryOptions={policyTypes}
					selectedCount={table.getFilteredSelectedRowModel().rows.length}
					totalCount={table.getFilteredRowModel().rows.length}
					bulkActions={[
						{
							id: "export-yaml",
							label: "Export Selected as YAML",
							icon: <IconDownload className="size-4" />,
							action: () => {
								const selectedPolicies = table.getFilteredSelectedRowModel().rows.map(row => row.original)
								console.log('Export YAML for network policies:', selectedPolicies.map(policy => `${policy.name} in ${policy.namespace}`))
								// TODO: Implement bulk YAML export
							},
							requiresSelection: true,
						},
						{
							id: "copy-names",
							label: "Copy Policy Names",
							icon: <IconCopy className="size-4" />,
							action: () => {
								const selectedPolicies = table.getFilteredSelectedRowModel().rows.map(row => row.original)
								const names = selectedPolicies.map(policy => policy.name).join('\n')
								navigator.clipboard.writeText(names)
								console.log('Copied network policy names:', names)
							},
							requiresSelection: true,
						},
						{
							id: "delete-policies",
							label: "Delete Selected Policies",
							icon: <IconTrash className="size-4" />,
							action: () => {
								const selectedPolicies = table.getFilteredSelectedRowModel().rows.map(row => row.original)
								if (confirm(`Are you sure you want to delete ${selectedPolicies.length} network polic${selectedPolicies.length === 1 ? 'y' : 'ies'}? This action cannot be undone.`)) {
									console.log('Delete network policies:', selectedPolicies.map(policy => `${policy.name} in ${policy.namespace}`))
									// TODO: Implement bulk deletion
								}
							},
							variant: "destructive" as const,
							requiresSelection: true,
						},
					]}
					bulkActionsLabel="Actions"
					table={table}
					showColumnToggle={true}
					onRefresh={refetch}
					isRefreshing={loading}
				>
					{/* Real-time updates indicator */}
					{isConnected && (
						<div className="flex items-center space-x-1 text-xs text-green-600">
							<div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
							<span>Real-time updates enabled</span>
						</div>
					)}
				</DataTableFilters>

				{/* Data table */}
				<div className="overflow-hidden rounded-lg border">
					<ScrollArea className="w-full">
						<DndContext
							collisionDetection={closestCenter}
							modifiers={[restrictToVerticalAxis]}
							onDragEnd={handleDragEnd}
							sensors={sensors}
						>
							<Table>
								<TableHeader className="bg-muted sticky top-0 z-10">
									{table.getHeaderGroups().map((headerGroup) => (
										<TableRow key={headerGroup.id}>
											{headerGroup.headers.map((header) => {
												return (
													<TableHead key={header.id}>
														{header.isPlaceholder
															? null
															: flexRender(
																header.column.columnDef.header,
																header.getContext()
															)}
													</TableHead>
												)
											})}
										</TableRow>
									))}
								</TableHeader>
								<TableBody>
									<SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
										{table.getRowModel().rows?.length ? (
											table.getRowModel().rows.map((row) => (
												<DraggableRow key={row.original.id} row={row} />
											))
										) : (
											<TableRow>
												<TableCell
													colSpan={columns.length}
													className="h-24 text-center"
												>
													No network policies found in {selectedNamespace === 'all' ? 'any namespace' : `namespace "${selectedNamespace}"`}.
												</TableCell>
											</TableRow>
										)}
									</SortableContext>
								</TableBody>
							</Table>
						</DndContext>
						<ScrollBar orientation="vertical" />
						<ScrollBar orientation="horizontal" />
					</ScrollArea>
				</div>

				{/* Pagination */}
				<div className="flex flex-col gap-4 px-2 sm:flex-row sm:items-center sm:justify-between">
					<div className="text-sm text-muted-foreground">
						{table.getFilteredSelectedRowModel().rows.length} of{" "}
						{table.getFilteredRowModel().rows.length} row(s) selected.
					</div>
					<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6 lg:gap-8">
						<div className="flex items-center space-x-2">
							<p className="text-sm font-medium">Rows per page</p>
							<select
								value={`${table.getState().pagination.pageSize}`}
								onChange={(e) => {
									table.setPageSize(Number(e.target.value))
								}}
								className="h-8 w-[70px] rounded border border-input bg-background px-3 py-1 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
							>
								{[10, 20, 30, 40, 50].map((pageSize) => (
									<option key={pageSize} value={pageSize}>
										{pageSize}
									</option>
								))}
							</select>
						</div>
						<div className="flex items-center justify-between sm:justify-center sm:gap-6 lg:gap-8">
							<div className="flex w-[100px] items-center justify-center text-sm font-medium">
								Page {table.getState().pagination.pageIndex + 1} of{" "}
								{table.getPageCount()}
							</div>
							<div className="flex items-center space-x-2">
								<Button
									variant="outline"
									className="hidden h-8 w-8 p-0 lg:flex"
									onClick={() => table.setPageIndex(0)}
									disabled={!table.getCanPreviousPage()}
								>
									<span className="sr-only">Go to first page</span>
									<IconChevronsLeft />
								</Button>
								<Button
									variant="outline"
									className="size-8"
									size="icon"
									onClick={() => table.previousPage()}
									disabled={!table.getCanPreviousPage()}
								>
									<span className="sr-only">Go to previous page</span>
									<IconChevronLeft />
								</Button>
								<Button
									variant="outline"
									className="size-8"
									size="icon"
									onClick={() => table.nextPage()}
									disabled={!table.getCanNextPage()}
								>
									<span className="sr-only">Go to next page</span>
									<IconChevronRight />
								</Button>
								<Button
									variant="outline"
									className="hidden size-8 lg:flex"
									size="icon"
									onClick={() => table.setPageIndex(table.getPageCount() - 1)}
									disabled={!table.getCanNextPage()}
								>
									<span className="sr-only">Go to last page</span>
									<IconChevronsRight />
								</Button>
							</div>
						</div>
					</div>
				</div>
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
		</div>
	)
}

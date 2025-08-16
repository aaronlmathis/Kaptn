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
	IconCircleCheckFilled,
	IconDotsVertical,
	IconGripVertical,
	IconLoader,
	IconAlertTriangle,
	IconRefresh,
	IconTrash,
	IconEdit,
	IconEye,
	IconNetwork,
	IconDownload,
	IconCopy,
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
import { LoadBalancerDetailDrawer } from "@/components/viewers/LoadBalancerDetailDrawer"
import { ResourceYamlEditor } from "@/components/ResourceYamlEditor"
import { useLoadBalancersWithWebSocket } from "@/hooks/useLoadBalancersWithWebSocket"
import { useNamespace } from "@/contexts/namespace-context"
import { loadBalancerSchema, type LoadBalancer } from "@/lib/schemas/loadbalancer"
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

// Status badge helper for LoadBalancer services
function getLoadBalancerStatusBadge(externalIP: string) {
	if (externalIP && externalIP !== '<none>' && externalIP !== '<pending>') {
		return (
			<Badge variant="outline" className="text-green-600 border-border bg-transparent px-1.5">
				<IconCircleCheckFilled className="size-3 fill-green-600 mr-1" />
				Active
			</Badge>
		)
	} else if (externalIP === '<pending>') {
		return (
			<Badge variant="outline" className="text-yellow-600 border-border bg-transparent px-1.5">
				<IconLoader className="size-3 text-yellow-600 mr-1" />
				Pending
			</Badge>
		)
	} else {
		return (
			<Badge variant="outline" className="text-red-600 border-border bg-transparent px-1.5">
				<IconAlertTriangle className="size-3 text-red-600 mr-1" />
				No External IP
			</Badge>
		)
	}
}

// LoadBalancer type badge
function getLoadBalancerTypeBadge() {
	return (
		<Badge variant="outline" className="text-purple-600 border-border bg-transparent px-1.5">
			<IconNetwork className="size-3 mr-1" />
			LoadBalancer
		</Badge>
	)
}

// Column definitions for load balancers table
const createColumns = (
	onViewDetails: (loadBalancer: z.infer<typeof loadBalancerSchema>) => void
): ColumnDef<z.infer<typeof loadBalancerSchema>>[] => [
		{
			id: "drag",
			header: () => null,
			cell: ({ row }) => <DragHandle id={row.original.id} />,
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
		},
		{
			accessorKey: "name",
			header: "Load Balancer Name",
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
			accessorKey: "type",
			header: "Type",
			cell: ({ row: _row }) => getLoadBalancerTypeBadge(),
		},
		{
			accessorKey: "status",
			header: "Status",
			cell: ({ row }) => getLoadBalancerStatusBadge(row.original.externalIP),
		},
		{
			accessorKey: "clusterIP",
			header: "Cluster IP",
			cell: ({ row }) => (
				<div className="font-mono text-sm">{row.original.clusterIP}</div>
			),
		},
		{
			accessorKey: "externalIP",
			header: "External IP",
			cell: ({ row }) => (
				<div className="font-mono text-sm">{row.original.externalIP}</div>
			),
		},
		{
			accessorKey: "ports",
			header: "Ports",
			cell: ({ row }) => (
				<div className="font-mono text-sm">{row.original.ports}</div>
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
							resourceKind="Service"
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
						<DropdownMenuItem
							onClick={() => {
								// TODO: Implement LoadBalancer restart functionality
								console.log('Restart LoadBalancer:', row.original.name, 'in namespace:', row.original.namespace)
							}}
						>
							<IconRefresh className="size-4 mr-2" />
							Restart
						</DropdownMenuItem>
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
function DraggableRow({ row }: { row: Row<z.infer<typeof loadBalancerSchema>> }) {
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

export function LoadBalancersDataTable() {
	const { data: loadBalancers, loading, error, refetch, isConnected } = useLoadBalancersWithWebSocket(true)
	const { selectedNamespace } = useNamespace()

	const [sorting, setSorting] = React.useState<SortingState>([])
	const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
	const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({})
	const [rowSelection, setRowSelection] = React.useState({})
	const [detailDrawerOpen, setDetailDrawerOpen] = React.useState(false)
	const [selectedLoadBalancerForDetails, setSelectedLoadBalancerForDetails] = React.useState<z.infer<typeof loadBalancerSchema> | null>(null)

	// Additional state variables for DataTableFilters
	const [globalFilter, setGlobalFilter] = React.useState("")
	const [statusFilter, setStatusFilter] = React.useState<string>("all")

	// Handle opening detail drawer
	const handleViewDetails = React.useCallback((loadBalancer: z.infer<typeof loadBalancerSchema>) => {
		setSelectedLoadBalancerForDetails(loadBalancer)
		setDetailDrawerOpen(true)
	}, [])

	// Create columns with the onViewDetails callback
	const columns = React.useMemo(
		() => createColumns(handleViewDetails),
		[handleViewDetails]
	)

	// Create filter options for load balancer statuses based on externalIP
	const loadBalancerStatuses = React.useMemo(() => {
		const statuses = new Set<string>()
		loadBalancers.forEach(lb => {
			if (lb.externalIP && lb.externalIP !== '<none>' && lb.externalIP !== '<pending>') {
				statuses.add("Active")
			} else if (lb.externalIP === '<pending>') {
				statuses.add("Pending")
			} else {
				statuses.add("No External IP")
			}
		})
		return Array.from(statuses).sort().map(status => ({
			value: status,
			label: status,
			badge: (() => {
				if (status === "Active") {
					return getLoadBalancerStatusBadge("active-ip")
				} else if (status === "Pending") {
					return getLoadBalancerStatusBadge("<pending>")
				} else {
					return getLoadBalancerStatusBadge("<none>")
				}
			})()
		}))
	}, [loadBalancers])

	// Filter data based on global filter and status filter
	const filteredData = React.useMemo(() => {
		let filtered = loadBalancers

		// Apply category filter (status based on externalIP)
		if (statusFilter !== "all") {
			filtered = filtered.filter(lb => {
				if (statusFilter === "Active") {
					return lb.externalIP && lb.externalIP !== '<none>' && lb.externalIP !== '<pending>'
				} else if (statusFilter === "Pending") {
					return lb.externalIP === '<pending>'
				} else if (statusFilter === "No External IP") {
					return !lb.externalIP || lb.externalIP === '<none>'
				}
				return true
			})
		}

		// Apply global filter (search)
		if (globalFilter) {
			const searchTerm = globalFilter.toLowerCase()
			filtered = filtered.filter(lb =>
				lb.name.toLowerCase().includes(searchTerm) ||
				lb.namespace.toLowerCase().includes(searchTerm) ||
				(lb.clusterIP && lb.clusterIP.toLowerCase().includes(searchTerm)) ||
				(lb.externalIP && lb.externalIP !== '<none>' && lb.externalIP !== '<pending>' && lb.externalIP.toLowerCase().includes(searchTerm)) ||
				(lb.ports && lb.ports.toLowerCase().includes(searchTerm)) ||
				lb.age.toLowerCase().includes(searchTerm)
			)
		}

		return filtered
	}, [loadBalancers, statusFilter, globalFilter])

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
		loadBalancers.map((lb: LoadBalancer) => lb.id)
	)

	React.useEffect(() => {
		setSortableIds(loadBalancers.map((lb: LoadBalancer) => lb.id))
	}, [loadBalancers])

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
					<span className="ml-2">Loading load balancers...</span>
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
					table={table}
					globalFilter={globalFilter}
					onGlobalFilterChange={setGlobalFilter}
					categoryFilter={statusFilter}
					onCategoryFilterChange={setStatusFilter}
					categoryOptions={loadBalancerStatuses}
					categoryLabel="Status"
					searchPlaceholder="Search load balancers..."
					onRefresh={refetch}
					isRefreshing={loading}
					selectedCount={table.getFilteredSelectedRowModel().rows.length}
					totalCount={table.getFilteredRowModel().rows.length}
					bulkActions={[
						{
							id: "export-yaml",
							icon: <IconDownload />,
							label: "Export to YAML",
							action: () => {
								const selectedRows = table.getFilteredSelectedRowModel().rows
								// TODO: Implement bulk YAML export for selected load balancers
								console.log('Export selected load balancers:', selectedRows.map(row => row.original))
							},
							requiresSelection: true
						},
						{
							id: "copy-names",
							icon: <IconCopy />,
							label: "Copy names",
							action: () => {
								const selectedRows = table.getFilteredSelectedRowModel().rows
								const names = selectedRows.map(row => row.original.name).join('\n')
								navigator.clipboard.writeText(names)
							},
							requiresSelection: true
						}
					]}
					bulkActionsLabel="Actions"
					showColumnToggle={true}
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
													No load balancers found in {selectedNamespace === 'all' ? 'any namespace' : `namespace "${selectedNamespace}"`}.
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

			{/* Controlled detail drawer for full load balancer details */}
			{selectedLoadBalancerForDetails && (
				<LoadBalancerDetailDrawer
					item={selectedLoadBalancerForDetails}
					open={detailDrawerOpen}
					onOpenChange={(open: boolean) => {
						setDetailDrawerOpen(open)
						if (!open) {
							setSelectedLoadBalancerForDetails(null)
						}
					}}
				/>
			)}
		</div>
	)
}

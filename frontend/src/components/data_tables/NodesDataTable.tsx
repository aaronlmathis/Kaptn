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
	IconPlayerPause,
	IconDroplets,
	IconDownload,
	IconCopy,
	IconServer,
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
import { DataTableFilters, type FilterOption, type BulkAction } from "@/components/ui/data-table-filters"
import { NodeDetailDrawer } from "@/components/viewers/NodeDetailDrawer"
import { ResourceYamlEditor } from "@/components/ResourceYamlEditor"
import { useNodesWithWebSocket } from "@/hooks/useNodesWithWebSocket"
import { k8sService } from "@/lib/k8s-service"
import { nodeSchema } from "@/lib/schemas/node"
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

// Status badge helper
function getNodeStatusBadge(status: string) {
	switch (status.toLowerCase()) {
		case "ready":
			return (
				<Badge variant="outline" className="text-green-600 border-border bg-transparent px-1.5">
					<IconCircleCheckFilled className="size-3 fill-green-600 mr-1" />
					Ready
				</Badge>
			)
		case "notready":
		case "not ready":
			return (
				<Badge variant="outline" className="text-red-600 border-border bg-transparent px-1.5">
					<IconAlertTriangle className="size-3 text-red-600 mr-1" />
					Not Ready
				</Badge>
			)
		case "schedulingdisabled":
		case "scheduling disabled":
			return (
				<Badge variant="outline" className="text-yellow-600 border-border bg-transparent px-1.5">
					<IconPlayerPause className="size-3 text-yellow-600 mr-1" />
					Cordoned
				</Badge>
			)
		default:
			return (
				<Badge variant="outline" className="text-muted-foreground border-border bg-transparent px-1.5">
					{status}
				</Badge>
			)
	}
}

// Column definitions for nodes table
const createColumns = (
	onViewDetails: (node: z.infer<typeof nodeSchema>) => void,
	onCordonNode: (node: z.infer<typeof nodeSchema>) => void,
	onDrainNode: (node: z.infer<typeof nodeSchema>) => void
): ColumnDef<z.infer<typeof nodeSchema>>[] => [
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
			header: "Node Name",
			cell: ({ row }) => {
				return (
					<button
						onClick={() => onViewDetails(row.original)}
						className="text-left hover:underline focus:underline focus:outline-none font-medium"
					>
						{row.original.name}
					</button>
				)
			},
			enableHiding: false,
		},
		{
			accessorKey: "status",
			header: "Status",
			cell: ({ row }) => getNodeStatusBadge(row.original.status),
		},
		{
			accessorKey: "roles",
			header: "Roles",
			cell: ({ row }) => (
				<div className="text-sm">{row.original.roles || "worker"}</div>
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
			accessorKey: "version",
			header: "Kubernetes Version",
			cell: ({ row }) => (
				<div className="font-mono text-sm">{row.original.version}</div>
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
						<DropdownMenuItem
							onClick={() => onCordonNode(row.original)}
						>
							<IconPlayerPause className="size-4 mr-2" />
							Cordon
						</DropdownMenuItem>
						<DropdownMenuItem
							onClick={() => onDrainNode(row.original)}
						>
							<IconDroplets className="size-4 mr-2" />
							Drain
						</DropdownMenuItem>
						<ResourceYamlEditor
							resourceName={row.original.name}
							namespace=""
							resourceKind="Node"
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
function DraggableRow({ row }: { row: Row<z.infer<typeof nodeSchema>> }) {
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

export function NodesDataTable() {
	const { data: nodes, loading, error, refetch, isConnected } = useNodesWithWebSocket(true)

	const [globalFilter, setGlobalFilter] = React.useState("")
	const [statusFilter, setStatusFilter] = React.useState<string>("all")
	const [sorting, setSorting] = React.useState<SortingState>([])
	const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
	const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({})
	const [rowSelection, setRowSelection] = React.useState({})
	const [detailDrawerOpen, setDetailDrawerOpen] = React.useState(false)
	const [selectedNodeForDetails, setSelectedNodeForDetails] = React.useState<z.infer<typeof nodeSchema> | null>(null)

	// Handle opening detail drawer
	const handleViewDetails = React.useCallback((node: z.infer<typeof nodeSchema>) => {
		setSelectedNodeForDetails(node)
		setDetailDrawerOpen(true)
	}, [])

	// Handle cordon node
	const handleCordonNode = React.useCallback(async (node: z.infer<typeof nodeSchema>) => {
		try {
			const result = await k8sService.cordonNode(node.name)
			if (result.success) {
				// Refetch to update the node status
				refetch()
			}
		} catch (error) {
			console.error('Failed to cordon node:', error)
		}
	}, [refetch])

	// Handle drain node
	const handleDrainNode = React.useCallback(async (node: z.infer<typeof nodeSchema>) => {
		try {
			const result = await k8sService.drainNode(node.name)
			console.log('Drain operation initiated:', result)
			// Note: Draining is an async operation, the status might not change immediately
		} catch (error) {
			console.error('Failed to drain node:', error)
		}
	}, [])

	// Create columns with the callbacks
	const columns = React.useMemo(
		() => createColumns(handleViewDetails, handleCordonNode, handleDrainNode),
		[handleViewDetails, handleCordonNode, handleDrainNode]
	)

	// Create filter options for node statuses
	const nodeStatuses = React.useMemo(() => {
		const statuses = new Set(nodes.map(node => node.status))
		return Array.from(statuses).sort().map(status => ({
			value: status,
			label: status,
			badge: getNodeStatusBadge(status)
		}))
	}, [nodes])

	// Filter data based on global filter and status filter
	const filteredData = React.useMemo(() => {
		let filtered = nodes

		// Apply status filter
		if (statusFilter !== "all") {
			filtered = filtered.filter(node => node.status === statusFilter)
		}

		// Apply global filter (search)
		if (globalFilter) {
			const searchTerm = globalFilter.toLowerCase()
			filtered = filtered.filter(node =>
				node.name.toLowerCase().includes(searchTerm) ||
				node.status.toLowerCase().includes(searchTerm) ||
				(node.roles && node.roles.toLowerCase().includes(searchTerm)) ||
				(node.version && node.version.toLowerCase().includes(searchTerm)) ||
				node.age.toLowerCase().includes(searchTerm)
			)
		}

		return filtered
	}, [nodes, statusFilter, globalFilter])

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
		nodes.map((node: z.infer<typeof nodeSchema>) => node.id)
	)

	React.useEffect(() => {
		setSortableIds(nodes.map((node: z.infer<typeof nodeSchema>) => node.id))
	}, [nodes])

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
					<span className="ml-2">Loading nodes...</span>
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
					searchPlaceholder="Search nodes by name, status, role, or version... (Press '/' to focus)"
					categoryFilter={statusFilter}
					onCategoryFilterChange={setStatusFilter}
					categoryLabel="Filter by status"
					categoryOptions={nodeStatuses}
					selectedCount={table.getFilteredSelectedRowModel().rows.length}
					totalCount={table.getFilteredRowModel().rows.length}
					bulkActions={[
						{
							id: "export-yaml",
							label: "Export Selected as YAML",
							icon: <IconDownload className="size-4" />,
							action: () => {
								const selectedNodes = table.getFilteredSelectedRowModel().rows.map(row => row.original)
								console.log('Export YAML for nodes:', selectedNodes.map(node => node.name))
								// TODO: Implement bulk YAML export
							},
							requiresSelection: true,
						},
						{
							id: "copy-names",
							label: "Copy Node Names",
							icon: <IconCopy className="size-4" />,
							action: () => {
								const selectedNodes = table.getFilteredSelectedRowModel().rows.map(row => row.original)
								const names = selectedNodes.map(node => node.name).join('\n')
								navigator.clipboard.writeText(names)
								console.log('Copied node names:', names)
							},
							requiresSelection: true,
						},
						{
							id: "cordon-nodes",
							label: "Cordon Selected Nodes",
							icon: <IconPlayerPause className="size-4" />,
							action: () => {
								const selectedNodes = table.getFilteredSelectedRowModel().rows.map(row => row.original)
								if (confirm(`Are you sure you want to cordon ${selectedNodes.length} node(s)? This will prevent new pods from being scheduled on them.`)) {
									selectedNodes.forEach(node => handleCordonNode(node))
								}
							},
							requiresSelection: true,
						},
						{
							id: "drain-nodes",
							label: "Drain Selected Nodes",
							icon: <IconDroplets className="size-4" />,
							action: () => {
								const selectedNodes = table.getFilteredSelectedRowModel().rows.map(row => row.original)
								if (confirm(`Are you sure you want to drain ${selectedNodes.length} node(s)? This will evict all pods and cordon the nodes.`)) {
									selectedNodes.forEach(node => handleDrainNode(node))
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
													No nodes found.
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
				<div className="flex items-center justify-between px-2">
					<div className="flex-1 text-sm text-muted-foreground">
						{table.getFilteredSelectedRowModel().rows.length} of{" "}
						{table.getFilteredRowModel().rows.length} row(s) selected.
					</div>
					<div className="flex items-center space-x-6 lg:space-x-8">
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

			{/* Controlled detail drawer for full node details */}
			{selectedNodeForDetails && (
				<NodeDetailDrawer
					item={selectedNodeForDetails}
					open={detailDrawerOpen}
					onOpenChange={(open: boolean) => {
						setDetailDrawerOpen(open)
						if (!open) {
							setSelectedNodeForDetails(null)
						}
					}}
				/>
			)}
		</div>
	)
}

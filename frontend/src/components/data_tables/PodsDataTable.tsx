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
	IconTerminal,
	IconTrash,
	IconEdit,
	IconEye,
	IconDownload,
	IconCopy,
	IconFileText,
	IconInfoCircle,
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
import { DataTableFilters, type FilterOption, type BulkAction } from "@/components/ui/data-table-filters"

import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { useShell } from "@/hooks/use-shell"
import { PodDetailDrawer } from "@/components/viewers/PodDetailDrawer"
import { ResourceYamlEditor } from "@/components/ResourceYamlEditor"
import { usePodsWithWebSocket } from "@/hooks/usePodsWithWebSocket"
import { useNamespace } from "@/contexts/namespace-context"
import { z } from "zod"

// Pod schema from kubernetes-dashboard.tsx
export const podSchema = z.object({
	id: z.number(),
	name: z.string(),
	namespace: z.string(),
	node: z.string(),
	status: z.string(),
	ready: z.string(),
	restarts: z.number(),
	age: z.string(),
	cpu: z.string(),
	memory: z.string(),
	image: z.string(),
})

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
function getStatusBadge(status: string) {
	switch (status) {
		case "Running":
			return (
				<Badge variant="outline" className="text-green-600 border-border bg-transparent px-1.5">
					<IconCircleCheckFilled className="size-3 fill-green-600 mr-1" />
					{status}
				</Badge>
			)
		case "Pending":
			return (
				<Badge variant="outline" className="text-yellow-600 border-border bg-transparent px-1.5">
					<IconLoader className="size-3 text-yellow-600 mr-1" />
					{status}
				</Badge>
			)
		case "CrashLoopBackOff":
		case "Failed":
			return (
				<Badge variant="outline" className="text-red-600 border-border bg-transparent px-1.5">
					<IconAlertTriangle className="size-3 text-red-600 mr-1" />
					{status}
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

// Column definitions for pods table
const createColumns = (
	onViewDetails: (pod: z.infer<typeof podSchema>) => void,
	onExecShell?: (pod: z.infer<typeof podSchema>) => void
): ColumnDef<z.infer<typeof podSchema>>[] => [
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
			header: "Pod Name",
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
			accessorKey: "status",
			header: "Status",
			cell: ({ row }) => getStatusBadge(row.original.status),
		},
		{
			accessorKey: "ready",
			header: "Ready",
			cell: ({ row }) => (
				<div className="font-mono text-sm">{row.original.ready}</div>
			),
		},
		{
			accessorKey: "restarts",
			header: "Restarts",
			cell: ({ row }) => (
				<div className="font-mono text-sm">{row.original.restarts}</div>
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
			accessorKey: "node",
			header: "Node",
			cell: ({ row }) => (
				<div className="text-sm">{row.original.node}</div>
			),
		},
		{
			accessorKey: "cpu",
			header: "CPU",
			cell: ({ row }) => (
				<div className="font-mono text-sm">{row.original.cpu}</div>
			),
		},
		{
			accessorKey: "memory",
			header: "Memory",
			cell: ({ row }) => (
				<div className="font-mono text-sm">{row.original.memory}</div>
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
							onClick={() => onExecShell?.(row.original)}
							disabled={!onExecShell}
						>
							<IconTerminal className="size-4 mr-2" />
							Exec Shell
						</DropdownMenuItem>
						<ResourceYamlEditor
							resourceName={row.original.name}
							namespace={row.original.namespace}
							resourceKind="Pod"
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
						<DropdownMenuItem>
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
function DraggableRow({ row }: { row: Row<z.infer<typeof podSchema>> }) {
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

export function PodsDataTable() {
	const { data: pods, loading, error, refetch, isConnected } = usePodsWithWebSocket(true)
	const { selectedNamespace } = useNamespace()
	const { openShell } = useShell()

	const [sorting, setSorting] = React.useState<SortingState>([])
	const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
	const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({})
	const [rowSelection, setRowSelection] = React.useState({})
	const [globalFilter, setGlobalFilter] = React.useState("")
	const [statusFilter, setStatusFilter] = React.useState<string>("all")
	const [detailDrawerOpen, setDetailDrawerOpen] = React.useState(false)
	const [selectedPodForDetails, setSelectedPodForDetails] = React.useState<z.infer<typeof podSchema> | null>(null)

	// Handle opening detail drawer
	const handleViewDetails = React.useCallback((pod: z.infer<typeof podSchema>) => {
		setSelectedPodForDetails(pod)
		setDetailDrawerOpen(true)
	}, [])

	// Handle exec shell
	const handleExecShell = React.useCallback((pod: z.infer<typeof podSchema>) => {
		openShell(pod.name, pod.namespace)
	}, [openShell])

	// Create columns with the onViewDetails callback
	const columns = React.useMemo(
		() => createColumns(handleViewDetails, handleExecShell),
		[handleViewDetails, handleExecShell]
	)

	// Filter options for pod statuses
	const podStatuses: FilterOption[] = React.useMemo(() => {
		const statuses = new Set(pods.map(pod => pod.status))
		return Array.from(statuses).sort().map(status => ({
			value: status,
			label: status,
			badge: getStatusBadge(status)
		}))
	}, [pods])

	// Filter data based on global filter and status filter
	const filteredData = React.useMemo(() => {
		let filtered = pods

		// Apply status filter
		if (statusFilter !== "all") {
			filtered = filtered.filter(pod => pod.status === statusFilter)
		}

		// Apply global filter (search)
		if (globalFilter) {
			const searchTerm = globalFilter.toLowerCase()
			filtered = filtered.filter(pod =>
				pod.name.toLowerCase().includes(searchTerm) ||
				pod.namespace.toLowerCase().includes(searchTerm) ||
				pod.status.toLowerCase().includes(searchTerm) ||
				pod.node.toLowerCase().includes(searchTerm) ||
				pod.image.toLowerCase().includes(searchTerm)
			)
		}

		return filtered
	}, [pods, statusFilter, globalFilter])

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

	// Bulk actions for pods
	const podBulkActions: BulkAction[] = React.useMemo(() => [
		{
			id: "get-logs",
			label: "Get Logs for Selected",
			icon: <IconFileText className="size-4" />,
			action: () => {
				const selectedPods = table.getFilteredSelectedRowModel().rows.map(row => row.original)
				console.log('Get logs for pods:', selectedPods.map(p => `${p.name} in ${p.namespace}`))
				// TODO: Implement bulk log retrieval
			},
			requiresSelection: true,
		},
		{
			id: "describe-pods",
			label: "Describe Selected Pods",
			icon: <IconInfoCircle className="size-4" />,
			action: () => {
				const selectedPods = table.getFilteredSelectedRowModel().rows.map(row => row.original)
				console.log('Describe pods:', selectedPods.map(p => `${p.name} in ${p.namespace}`))
				// TODO: Implement bulk pod describe
			},
			requiresSelection: true,
		},
		{
			id: "export-yaml",
			label: "Export Selected as YAML",
			icon: <IconDownload className="size-4" />,
			action: () => {
				const selectedPods = table.getFilteredSelectedRowModel().rows.map(row => row.original)
				console.log('Export YAML for pods:', selectedPods.map(p => p.name))
				// TODO: Implement bulk YAML export
			},
			requiresSelection: true,
		},
		{
			id: "copy-names",
			label: "Copy Pod Names",
			icon: <IconCopy className="size-4" />,
			action: () => {
				const selectedPods = table.getFilteredSelectedRowModel().rows.map(row => row.original)
				const names = selectedPods.map(p => p.name).join('\n')
				navigator.clipboard.writeText(names)
				console.log('Copied pod names:', names)
			},
			requiresSelection: true,
		},
		{
			id: "restart-pods",
			label: "Restart Selected Pods",
			icon: <IconRefresh className="size-4" />,
			action: () => {
				const selectedPods = table.getFilteredSelectedRowModel().rows.map(row => row.original)
				console.log('Restart pods:', selectedPods.map(p => `${p.name} in ${p.namespace}`))
				// TODO: Implement bulk pod restart
			},
			requiresSelection: true,
		},
		{
			id: "delete-pods",
			label: "Delete Selected Pods",
			icon: <IconTrash className="size-4" />,
			action: () => {
				const selectedPods = table.getFilteredSelectedRowModel().rows.map(row => row.original)
				console.log('Delete pods:', selectedPods.map(p => `${p.name} in ${p.namespace}`))
				// TODO: Implement bulk pod deletion with confirmation
			},
			variant: "destructive" as const,
			requiresSelection: true,
		},
	], [table])

	// Drag and drop setup
	const sensors = useSensors(
		useSensor(MouseSensor, {}),
		useSensor(TouchSensor, {}),
		useSensor(KeyboardSensor, {})
	)

	const [sortableIds, setSortableIds] = React.useState<UniqueIdentifier[]>(
		pods.map((pod) => pod.id)
	)

	React.useEffect(() => {
		setSortableIds(pods.map((pod) => pod.id))
	}, [pods])

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
					<span className="ml-2">Loading pods...</span>
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
					searchPlaceholder="Search pods by name, namespace, status, node, or image... (Press '/' to focus)"
					categoryFilter={statusFilter}
					onCategoryFilterChange={setStatusFilter}
					categoryLabel="Filter by status"
					categoryOptions={podStatuses}
					selectedCount={table.getFilteredSelectedRowModel().rows.length}
					totalCount={table.getFilteredRowModel().rows.length}
					bulkActions={podBulkActions}
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
							<span>Live updates</span>
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
													No pods found in {selectedNamespace === 'all' ? 'any namespace' : `namespace "${selectedNamespace}"`}.
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

			{/* Controlled detail drawer for full pod details */}
			{
				selectedPodForDetails && (
					<PodDetailDrawer
						item={selectedPodForDetails}
						open={detailDrawerOpen}
						onOpenChange={(open) => {
							setDetailDrawerOpen(open)
							if (!open) {
								setSelectedPodForDetails(null)
							}
						}}
					/>
				)
			}
		</div >
	)
}

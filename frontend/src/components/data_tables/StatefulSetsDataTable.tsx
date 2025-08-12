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
	IconDownload,
	IconCopy,
	IconScale,
	IconFileText,
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
import { StatefulSetDetailDrawer } from "@/components/viewers/StatefulSetDetailDrawer"
import { ResourceYamlEditor } from "@/components/ResourceYamlEditor"
import { useStatefulSetsWithWebSocket } from "@/hooks/useStatefulSetsWithWebSocket"
import { useNamespace } from "@/contexts/namespace-context"
import { type StatefulSetTableRow } from "@/lib/schemas/statefulset"

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

// Status badge helper for StatefulSets
function getReadyBadge(ready: string) {
	const [current, desired] = ready.split("/").map(Number)
	const isReady = current === desired && desired > 0

	if (isReady) {
		return (
			<Badge variant="outline" className="text-green-600 border-border bg-transparent px-1.5">
				<IconCircleCheckFilled className="size-3 fill-green-600 mr-1" />
				{ready}
			</Badge>
		)
	} else {
		return (
			<Badge variant="outline" className="text-yellow-600 border-border bg-transparent px-1.5">
				<IconLoader className="size-3 text-yellow-600 mr-1" />
				{ready}
			</Badge>
		)
	}
}

// Column definitions for statefulsets table
const createColumns = (
	onViewDetails: (statefulSet: StatefulSetTableRow) => void
): ColumnDef<StatefulSetTableRow>[] => [
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
							(table.getIsSomePageRowsSelected() ? "indeterminate" : false)
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
			header: "StatefulSet Name",
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
			accessorKey: "ready",
			header: "Ready",
			cell: ({ row }) => getReadyBadge(row.original.ready),
		},
		{
			accessorKey: "current",
			header: "Current",
			cell: ({ row }) => (
				<div className="font-mono text-sm">{row.original.current}</div>
			),
		},
		{
			accessorKey: "updated",
			header: "Updated",
			cell: ({ row }) => (
				<div className="font-mono text-sm">{row.original.updated}</div>
			),
		},
		{
			accessorKey: "serviceName",
			header: "Service Name",
			cell: ({ row }) => (
				<div className="text-sm">{row.original.serviceName}</div>
			),
		},
		{
			accessorKey: "updateStrategy",
			header: "Update Strategy",
			cell: ({ row }) => (
				<Badge variant="outline" className="text-muted-foreground px-1.5">
					{row.original.updateStrategy}
				</Badge>
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
							resourceKind="StatefulSet"
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
function DraggableRow({ row }: { row: Row<StatefulSetTableRow> }) {
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

export function StatefulSetsDataTable() {
	const { data: statefulSets, loading, error, refetch, isConnected } = useStatefulSetsWithWebSocket(true)
	const { selectedNamespace } = useNamespace()

	const [sorting, setSorting] = React.useState<SortingState>([])
	const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
	const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({})
	const [rowSelection, setRowSelection] = React.useState({})
	const [globalFilter, setGlobalFilter] = React.useState("")
	const [statusFilter, setStatusFilter] = React.useState<string>("all")
	const [detailDrawerOpen, setDetailDrawerOpen] = React.useState(false)
	const [selectedStatefulSetForDetails, setSelectedStatefulSetForDetails] = React.useState<StatefulSetTableRow | null>(null)

	// Handle opening detail drawer
	const handleViewDetails = React.useCallback((statefulSet: StatefulSetTableRow) => {
		setSelectedStatefulSetForDetails(statefulSet)
		setDetailDrawerOpen(true)
	}, [])

	// Create filter options based on StatefulSet status (ready vs not ready)
	const statefulSetStatuses: FilterOption[] = React.useMemo(() => {
		const statuses = new Set<string>()
		statefulSets.forEach(statefulSet => {
			const [current, desired] = statefulSet.ready.split("/").map(Number)
			const isReady = current === desired && desired > 0
			statuses.add(isReady ? "Ready" : "Not Ready")
		})
		return Array.from(statuses).sort().map(status => ({
			value: status,
			label: status,
			badge: (
				<Badge variant="outline" className={status === "Ready" ? "text-green-600 border-border bg-transparent px-1.5" : "text-yellow-600 border-border bg-transparent px-1.5"}>
					{status}
				</Badge>
			)
		}))
	}, [statefulSets])

	// Filter data based on global filter and status filter
	const filteredData = React.useMemo(() => {
		let filtered = statefulSets

		// Apply status filter
		if (statusFilter !== "all") {
			filtered = filtered.filter(statefulSet => {
				const [current, desired] = statefulSet.ready.split("/").map(Number)
				const isReady = current === desired && desired > 0
				const status = isReady ? "Ready" : "Not Ready"
				return status === statusFilter
			})
		}

		// Apply global filter (search)
		if (globalFilter) {
			const searchTerm = globalFilter.toLowerCase()
			filtered = filtered.filter(statefulSet =>
				statefulSet.name.toLowerCase().includes(searchTerm) ||
				statefulSet.namespace.toLowerCase().includes(searchTerm) ||
				statefulSet.serviceName.toLowerCase().includes(searchTerm) ||
				statefulSet.updateStrategy.toLowerCase().includes(searchTerm)
			)
		}

		return filtered
	}, [statefulSets, statusFilter, globalFilter])

	// Create columns with the onViewDetails callback
	const columns = React.useMemo(
		() => createColumns(handleViewDetails),
		[handleViewDetails]
	)

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

	// Create bulk actions for StatefulSets (moved after table creation)
	const statefulSetBulkActions: BulkAction[] = React.useMemo(() => [
		{
			id: "export-yaml",
			label: "Export Selected as YAML",
			icon: <IconDownload className="size-4" />,
			action: () => {
				const selectedStatefulSets = table.getFilteredSelectedRowModel().rows.map(row => row.original)
				console.log('Export YAML for StatefulSets:', selectedStatefulSets.map(ss => ss.name))
				// TODO: Implement bulk YAML export
			},
			requiresSelection: true,
		},
		{
			id: "copy-names",
			label: "Copy StatefulSet Names",
			icon: <IconCopy className="size-4" />,
			action: () => {
				const selectedStatefulSets = table.getFilteredSelectedRowModel().rows.map(row => row.original)
				const names = selectedStatefulSets.map(ss => ss.name).join('\n')
				navigator.clipboard.writeText(names)
				console.log('Copied StatefulSet names:', names)
			},
			requiresSelection: true,
		},
		{
			id: "scale-statefulsets",
			label: "Scale Selected StatefulSets",
			icon: <IconScale className="size-4" />,
			action: () => {
				const selectedStatefulSets = table.getFilteredSelectedRowModel().rows.map(row => row.original)
				console.log('Scale StatefulSets:', selectedStatefulSets.map(ss => `${ss.name} in ${ss.namespace}`))
				// TODO: Implement bulk scaling with modal
			},
			requiresSelection: true,
		},
		{
			id: "get-logs",
			label: "Get Logs for Selected",
			icon: <IconFileText className="size-4" />,
			action: () => {
				const selectedStatefulSets = table.getFilteredSelectedRowModel().rows.map(row => row.original)
				console.log('Get logs for StatefulSets:', selectedStatefulSets.map(ss => `${ss.name} in ${ss.namespace}`))
				// TODO: Implement bulk log retrieval
			},
			requiresSelection: true,
		},
		{
			id: "restart-statefulsets",
			label: "Restart Selected StatefulSets",
			icon: <IconRefresh className="size-4" />,
			action: () => {
				const selectedStatefulSets = table.getFilteredSelectedRowModel().rows.map(row => row.original)
				console.log('Restart StatefulSets:', selectedStatefulSets.map(ss => `${ss.name} in ${ss.namespace}`))
				// TODO: Implement bulk restart
			},
			requiresSelection: true,
		},
		{
			id: "delete-statefulsets",
			label: "Delete Selected StatefulSets",
			icon: <IconTrash className="size-4" />,
			action: () => {
				const selectedStatefulSets = table.getFilteredSelectedRowModel().rows.map(row => row.original)
				console.log('Delete StatefulSets:', selectedStatefulSets.map(ss => `${ss.name} in ${ss.namespace}`))
				// TODO: Implement bulk deletion with confirmation
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
		statefulSets.map((statefulSet) => statefulSet.id)
	)

	React.useEffect(() => {
		setSortableIds(statefulSets.map((statefulSet) => statefulSet.id))
	}, [statefulSets])

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
					<span className="ml-2">Loading StatefulSets...</span>
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
					searchPlaceholder="Search StatefulSets by name, namespace, service name, or update strategy... (Press '/' to focus)"
					categoryFilter={statusFilter}
					onCategoryFilterChange={setStatusFilter}
					categoryLabel="Filter by status"
					categoryOptions={statefulSetStatuses}
					selectedCount={table.getFilteredSelectedRowModel().rows.length}
					totalCount={table.getFilteredRowModel().rows.length}
					bulkActions={statefulSetBulkActions}
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
													No StatefulSets found in {selectedNamespace === 'all' ? 'any namespace' : `namespace "${selectedNamespace}"`}.
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

			{/* Controlled detail drawer for full StatefulSet details */}
			{selectedStatefulSetForDetails && (
				<StatefulSetDetailDrawer
					statefulSet={selectedStatefulSetForDetails}
					open={detailDrawerOpen}
					onClose={(open: boolean) => {
						setDetailDrawerOpen(open)
						if (!open) {
							setSelectedStatefulSetForDetails(null)
						}
					}}
				/>
			)}
		</div>
	)
}

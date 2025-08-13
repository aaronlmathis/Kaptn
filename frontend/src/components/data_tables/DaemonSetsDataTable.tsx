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

import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { DataTableFilters, type FilterOption, type BulkAction } from "@/components/ui/data-table-filters"
import { DaemonSetDetailDrawer } from "@/components/viewers/DaemonSetDetailDrawer"
import { ResourceYamlEditor } from "@/components/ResourceYamlEditor"
import { useDaemonSetsWithWebSocket } from "@/hooks/useDaemonSetsWithWebSocket"
import { useNamespace } from "@/contexts/namespace-context"
import { daemonSetSchema } from "@/lib/schemas/daemonset"
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

// Ready status badge helper
function getReadyBadge(ready: number, desired: number) {
	const isReady = ready === desired && desired > 0
	const isPartial = ready > 0 && ready < desired

	if (isReady) {
		return (
			<Badge variant="outline" className="text-green-600 border-border bg-transparent px-1.5">
				<IconCircleCheckFilled className="size-3 fill-green-600 mr-1" />
				Ready
			</Badge>
		)
	} else if (isPartial) {
		return (
			<Badge variant="outline" className="text-yellow-600 border-border bg-transparent px-1.5">
				<IconLoader className="size-3 text-yellow-600 mr-1" />
				Partial
			</Badge>
		)
	} else {
		return (
			<Badge variant="outline" className="text-red-600 border-border bg-transparent px-1.5">
				<IconAlertTriangle className="size-3 text-red-600 mr-1" />
				Not Ready
			</Badge>
		)
	}
}

// Column definitions for daemonsets table
const createColumns = (
	onViewDetails: (daemonSet: z.infer<typeof daemonSetSchema>) => void
): ColumnDef<z.infer<typeof daemonSetSchema>>[] => [
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
			header: "DaemonSet Name",
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
			accessorKey: "desired",
			header: "Desired",
			cell: ({ row }) => (
				<div className="font-mono text-sm">{row.original.desired}</div>
			),
		},
		{
			accessorKey: "current",
			header: "Current",
			cell: ({ row }) => (
				<div className="font-mono text-sm">{row.original.current}</div>
			),
		},
		{
			accessorKey: "ready",
			header: "Ready",
			cell: ({ row }) => (
				<div className="font-mono text-sm">{row.original.ready}</div>
			),
		},
		{
			accessorKey: "available",
			header: "Available",
			cell: ({ row }) => (
				<div className="font-mono text-sm">{row.original.available}</div>
			),
		},
		{
			accessorKey: "unavailable",
			header: "Unavailable",
			cell: ({ row }) => (
				<div className="font-mono text-sm">{row.original.unavailable}</div>
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
			accessorKey: "updateStrategy",
			header: "Update Strategy",
			cell: ({ row }) => (
				<div className="text-sm">{row.original.updateStrategy}</div>
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
							resourceKind="DaemonSet"
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
function DraggableRow({ row }: { row: Row<z.infer<typeof daemonSetSchema>> }) {
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

export function DaemonSetsDataTable() {
	const { data: daemonSets, loading, error, refetch, isConnected } = useDaemonSetsWithWebSocket(true)
	const { selectedNamespace } = useNamespace()

	const [sorting, setSorting] = React.useState<SortingState>([])
	const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
	const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({})
	const [rowSelection, setRowSelection] = React.useState({})
	const [globalFilter, setGlobalFilter] = React.useState("")
	const [statusFilter, setStatusFilter] = React.useState<string>("all")
	const [detailDrawerOpen, setDetailDrawerOpen] = React.useState(false)
	const [selectedDaemonSetForDetails, setSelectedDaemonSetForDetails] = React.useState<z.infer<typeof daemonSetSchema> | null>(null)

	// Handle opening detail drawer
	const handleViewDetails = React.useCallback((daemonSet: z.infer<typeof daemonSetSchema>) => {
		setSelectedDaemonSetForDetails(daemonSet)
		setDetailDrawerOpen(true)
	}, [])

	// Create columns with the onViewDetails callback
	const columns = React.useMemo(
		() => createColumns(handleViewDetails),
		[handleViewDetails]
	)

	// Create readiness status options based on daemon set state
	const daemonSetStatuses: FilterOption[] = React.useMemo(() => {
		const statuses = new Set<string>()
		daemonSets.forEach(daemonSet => {
			const isReady = daemonSet.ready === daemonSet.desired && daemonSet.desired > 0
			const isPartial = daemonSet.ready > 0 && daemonSet.ready < daemonSet.desired
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
			badge: (
				<Badge variant="outline" className={
					status === "Ready" ? "text-green-600 border-border bg-transparent px-1.5" :
						status === "Partial" ? "text-yellow-600 border-border bg-transparent px-1.5" :
							"text-red-600 border-border bg-transparent px-1.5"
				}>
					{status === "Ready" && <IconCircleCheckFilled className="size-3 fill-green-600 mr-1" />}
					{status === "Partial" && <IconLoader className="size-3 text-yellow-600 mr-1" />}
					{status === "Not Ready" && <IconAlertTriangle className="size-3 text-red-600 mr-1" />}
					{status}
				</Badge>
			)
		}))
	}, [daemonSets])

	// Filter data based on global filter and status filter
	const filteredData = React.useMemo(() => {
		let filtered = daemonSets

		// Apply status filter
		if (statusFilter !== "all") {
			filtered = filtered.filter(daemonSet => {
				const isReady = daemonSet.ready === daemonSet.desired && daemonSet.desired > 0
				const isPartial = daemonSet.ready > 0 && daemonSet.ready < daemonSet.desired
				const status = isReady ? "Ready" : isPartial ? "Partial" : "Not Ready"
				return status === statusFilter
			})
		}

		// Apply global filter (search)
		if (globalFilter) {
			const searchTerm = globalFilter.toLowerCase()
			filtered = filtered.filter(daemonSet =>
				daemonSet.name.toLowerCase().includes(searchTerm) ||
				daemonSet.namespace.toLowerCase().includes(searchTerm) ||
				daemonSet.updateStrategy.toLowerCase().includes(searchTerm) ||
				daemonSet.age.toLowerCase().includes(searchTerm)
			)
		}

		return filtered
	}, [daemonSets, statusFilter, globalFilter])

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

	// Bulk actions for daemon sets
	const daemonSetBulkActions: BulkAction[] = React.useMemo(() => [
		{
			id: "export-yaml",
			label: "Export Selected as YAML",
			icon: <IconDownload className="size-4" />,
			action: () => {
				const selectedDaemonSets = table.getFilteredSelectedRowModel().rows.map(row => row.original)
				console.log('Export YAML for daemon sets:', selectedDaemonSets.map(ds => ds.name))
				// TODO: Implement bulk YAML export
			},
			requiresSelection: true,
		},
		{
			id: "copy-names",
			label: "Copy DaemonSet Names",
			icon: <IconCopy className="size-4" />,
			action: () => {
				const selectedDaemonSets = table.getFilteredSelectedRowModel().rows.map(row => row.original)
				const names = selectedDaemonSets.map(ds => ds.name).join('\n')
				navigator.clipboard.writeText(names)
				console.log('Copied daemon set names:', names)
			},
			requiresSelection: true,
		},
		{
			id: "restart-daemonsets",
			label: "Restart Selected DaemonSets",
			icon: <IconRefresh className="size-4" />,
			action: () => {
				const selectedDaemonSets = table.getFilteredSelectedRowModel().rows.map(row => row.original)
				console.log('Restart daemon sets:', selectedDaemonSets.map(ds => `${ds.name} in ${ds.namespace}`))
				// TODO: Implement bulk daemon set restart
			},
			requiresSelection: true,
		},
		{
			id: "get-logs",
			label: "Get Logs for Selected",
			icon: <IconFileText className="size-4" />,
			action: () => {
				const selectedDaemonSets = table.getFilteredSelectedRowModel().rows.map(row => row.original)
				console.log('Get logs for daemon sets:', selectedDaemonSets.map(ds => `${ds.name} in ${ds.namespace}`))
				// TODO: Implement bulk log retrieval
			},
			requiresSelection: true,
		},
		{
			id: "describe-daemonsets",
			label: "Describe Selected DaemonSets",
			icon: <IconInfoCircle className="size-4" />,
			action: () => {
				const selectedDaemonSets = table.getFilteredSelectedRowModel().rows.map(row => row.original)
				console.log('Describe daemon sets:', selectedDaemonSets.map(ds => `${ds.name} in ${ds.namespace}`))
				// TODO: Implement bulk daemon set describe
			},
			requiresSelection: true,
		},
		{
			id: "delete-daemonsets",
			label: "Delete Selected DaemonSets",
			icon: <IconTrash className="size-4" />,
			action: () => {
				const selectedDaemonSets = table.getFilteredSelectedRowModel().rows.map(row => row.original)
				console.log('Delete daemon sets:', selectedDaemonSets.map(ds => `${ds.name} in ${ds.namespace}`))
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
		daemonSets.map((daemonSet) => daemonSet.id)
	)

	React.useEffect(() => {
		setSortableIds(daemonSets.map((daemonSet) => daemonSet.id))
	}, [daemonSets])

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
					<span className="ml-2">Loading daemonsets...</span>
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
					searchPlaceholder="Search daemon sets by name, namespace, update strategy, or age... (Press '/' to focus)"
					categoryFilter={statusFilter}
					onCategoryFilterChange={setStatusFilter}
					categoryLabel="Filter by readiness"
					categoryOptions={daemonSetStatuses}
					selectedCount={table.getFilteredSelectedRowModel().rows.length}
					totalCount={table.getFilteredRowModel().rows.length}
					bulkActions={daemonSetBulkActions}
					bulkActionsLabel="DaemonSet Actions"
					table={table}
					showColumnToggle={true}
					onRefresh={refetch}
					isRefreshing={loading}
				>
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
													No daemonsets found in {selectedNamespace === 'all' ? 'any namespace' : `namespace "${selectedNamespace}"`}.
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
						{isConnected && (
							<div className="inline-flex items-center space-x-1 ml-4 text-xs text-green-600">
								<div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
								<span>Real-time updates enabled</span>
							</div>
						)}
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

			{/* Controlled detail drawer for full daemonset details */}
			{selectedDaemonSetForDetails && (
				<DaemonSetDetailDrawer
					item={selectedDaemonSetForDetails}
					open={detailDrawerOpen}
					onOpenChange={(open: boolean) => {
						setDetailDrawerOpen(open)
						if (!open) {
							setSelectedDaemonSetForDetails(null)
						}
					}}
				/>
			)}
		</div>
	)
}

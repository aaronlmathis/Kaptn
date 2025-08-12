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
	IconDatabase,
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
import { VolumeSnapshotDetailDrawer } from "@/components/viewers/VolumeSnapshotDetailDrawer"
import { ResourceYamlEditor } from "@/components/ResourceYamlEditor"
import { useVolumeSnapshotsWithWebSocket } from "@/hooks/useVolumeSnapshotsWithWebSocket"
import { useNamespace } from "@/contexts/namespace-context"
import { z } from "zod"

// VolumeSnapshot schema
export const volumeSnapshotSchema = z.object({
	id: z.string(),
	name: z.string(),
	namespace: z.string(),
	sourcePVC: z.string(),
	volumeSnapshotClassName: z.string(),
	readyToUse: z.boolean(),
	restoreSize: z.string(),
	creationTime: z.string(),
	snapshotHandle: z.string(),
	age: z.string(),
	labelsCount: z.number(),
	annotationsCount: z.number(),
})

// Drag handle component
function DragHandle({ id }: { id: string }) {
	const { listeners, setNodeRef, transform, isDragging } = useSortable({
		id,
	})

	return (
		<button
			ref={setNodeRef}
			{...listeners}
			className="size-4 cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing"
			style={{
				transform: CSS.Transform.toString(transform),
			}}
			data-dragging={isDragging}
		>
			<IconGripVertical />
		</button>
	)
}

// Status badge helper
function getReadyStatusBadge(readyToUse: boolean) {
	if (readyToUse) {
		return (
			<Badge variant="outline" className="text-green-600 border-border bg-transparent px-1.5">
				<IconCircleCheckFilled className="size-3 fill-green-600 mr-1" />
				Ready
			</Badge>
		)
	} else {
		return (
			<Badge variant="outline" className="text-yellow-600 border-border bg-transparent px-1.5">
				<IconLoader className="size-3 text-yellow-600 mr-1" />
				Not Ready
			</Badge>
		)
	}
}

// Column definitions for volume snapshots table
const createColumns = (
	onViewDetails: (volumeSnapshot: z.infer<typeof volumeSnapshotSchema>) => void
): ColumnDef<z.infer<typeof volumeSnapshotSchema>>[] => [
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
							table.getIsAllPageRowsSelected()
								? true
								: table.getIsSomePageRowsSelected()
									? "indeterminate"
									: false
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
			header: "Volume Snapshot Name",
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
			accessorKey: "readyToUse",
			header: "Status",
			cell: ({ row }) => getReadyStatusBadge(row.original.readyToUse),
		},
		{
			accessorKey: "sourcePVC",
			header: "Source PVC",
			cell: ({ row }) => (
				<div className="text-sm">{row.original.sourcePVC}</div>
			),
		},
		{
			accessorKey: "volumeSnapshotClassName",
			header: "Snapshot Class",
			cell: ({ row }) => (
				<div className="text-sm">{row.original.volumeSnapshotClassName}</div>
			),
		},
		{
			accessorKey: "restoreSize",
			header: "Restore Size",
			cell: ({ row }) => (
				<div className="font-mono text-sm">{row.original.restoreSize}</div>
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
							resourceKind="VolumeSnapshot"
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
function DraggableRow({ row }: { row: Row<z.infer<typeof volumeSnapshotSchema>> }) {
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

export function VolumeSnapshotsDataTable() {
	const { data: volumeSnapshots, loading, error, refetch, isConnected } = useVolumeSnapshotsWithWebSocket(true)
	const { selectedNamespace } = useNamespace()

	const [sorting, setSorting] = React.useState<SortingState>([])
	const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
	const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({})
	const [rowSelection, setRowSelection] = React.useState({})
	const [globalFilter, setGlobalFilter] = React.useState("")
	const [statusFilter, setStatusFilter] = React.useState<string>("all")
	const [detailDrawerOpen, setDetailDrawerOpen] = React.useState(false)
	const [selectedVolumeSnapshotForDetails, setSelectedVolumeSnapshotForDetails] = React.useState<z.infer<typeof volumeSnapshotSchema> | null>(null)

	// Handle opening detail drawer
	const handleViewDetails = React.useCallback((volumeSnapshot: z.infer<typeof volumeSnapshotSchema>) => {
		setSelectedVolumeSnapshotForDetails(volumeSnapshot)
		setDetailDrawerOpen(true)
	}, [])

	// Create filter options for ready status
	const readyStatuses: FilterOption[] = React.useMemo(() => [
		{
			value: "ready",
			label: "Ready",
			badge: getReadyStatusBadge(true)
		},
		{
			value: "not-ready",
			label: "Not Ready",
			badge: getReadyStatusBadge(false)
		}
	], [])

	// Filter data based on global filter and status filter
	const filteredData = React.useMemo(() => {
		let filtered = volumeSnapshots

		// Apply status filter
		if (statusFilter !== "all") {
			filtered = filtered.filter(vs => {
				if (statusFilter === "ready") return vs.readyToUse
				if (statusFilter === "not-ready") return !vs.readyToUse
				return true
			})
		}

		// Apply global filter (search)
		if (globalFilter) {
			const searchTerm = globalFilter.toLowerCase()
			filtered = filtered.filter(vs =>
				vs.name.toLowerCase().includes(searchTerm) ||
				vs.namespace.toLowerCase().includes(searchTerm) ||
				vs.sourcePVC.toLowerCase().includes(searchTerm) ||
				vs.volumeSnapshotClassName.toLowerCase().includes(searchTerm) ||
				vs.restoreSize.toLowerCase().includes(searchTerm)
			)
		}

		return filtered
	}, [volumeSnapshots, statusFilter, globalFilter])

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

	// Create bulk actions for volume snapshots
	const volumeSnapshotBulkActions: BulkAction[] = React.useMemo(() => [
		{
			id: "export-yaml",
			label: "Export Selected as YAML",
			icon: <IconDownload className="size-4" />,
			action: () => {
				const selectedSnapshots = table.getFilteredSelectedRowModel().rows.map(row => row.original)
				console.log('Export YAML for volume snapshots:', selectedSnapshots.map(vs => `${vs.name} in ${vs.namespace}`))
				// TODO: Implement bulk YAML export
			},
			requiresSelection: true,
		},
		{
			id: "copy-names",
			label: "Copy Snapshot Names",
			icon: <IconCopy className="size-4" />,
			action: () => {
				const selectedSnapshots = table.getFilteredSelectedRowModel().rows.map(row => row.original)
				const names = selectedSnapshots.map(vs => vs.name).join('\n')
				navigator.clipboard.writeText(names)
				console.log('Copied volume snapshot names:', names)
			},
			requiresSelection: true,
		},
		{
			id: "copy-pvcs",
			label: "Copy Source PVCs",
			icon: <IconDatabase className="size-4" />,
			action: () => {
				const selectedSnapshots = table.getFilteredSelectedRowModel().rows.map(row => row.original)
				const uniquePVCs = selectedSnapshots.map(vs => vs.sourcePVC)
				const pvcs = Array.from(new Set(uniquePVCs)).join('\n')
				navigator.clipboard.writeText(pvcs)
				console.log('Copied source PVCs:', pvcs)
			},
			requiresSelection: true,
		},
		{
			id: "delete-snapshots",
			label: "Delete Selected Snapshots",
			icon: <IconTrash className="size-4" />,
			action: () => {
				const selectedSnapshots = table.getFilteredSelectedRowModel().rows.map(row => row.original)
				console.log('Delete volume snapshots:', selectedSnapshots.map(vs => `${vs.name} in ${vs.namespace}`))
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
		volumeSnapshots.map((vs) => vs.id)
	)

	React.useEffect(() => {
		setSortableIds(volumeSnapshots.map((vs) => vs.id))
	}, [volumeSnapshots])

	function handleDragEnd(event: DragEndEvent) {
		const { active, over } = event
		if (over && active.id !== over.id) {
			const oldIndex = sortableIds.indexOf(active.id)
			const newIndex = sortableIds.indexOf(over.id)
			setSortableIds(arrayMove(sortableIds, oldIndex, newIndex))
		}
	}

	if (error) {
		return (
			<div className="px-4 lg:px-6">
				<div className="rounded-lg border border-red-200 bg-red-50 p-4">
					<div className="flex items-center">
						<IconAlertTriangle className="size-5 text-red-600 mr-2" />
						<h3 className="text-sm font-medium text-red-800">Error loading volume snapshots</h3>
					</div>
					<div className="mt-2 text-sm text-red-700">{error}</div>
					<Button className="mt-3" variant="outline" size="sm" onClick={refetch}>
						<IconRefresh className="size-4 mr-2" />
						Try again
					</Button>
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
					searchPlaceholder="Search volume snapshots by name, namespace, source PVC, snapshot class, or restore size... (Press '/' to focus)"
					categoryFilter={statusFilter}
					onCategoryFilterChange={setStatusFilter}
					categoryLabel="Filter by ready status"
					categoryOptions={readyStatuses}
					selectedCount={table.getFilteredSelectedRowModel().rows.length}
					totalCount={table.getFilteredRowModel().rows.length}
					bulkActions={volumeSnapshotBulkActions}
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
				</DataTableFilters>				{/* Data table */}
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
													{loading ? (
														<div className="flex items-center justify-center">
															<IconLoader className="animate-spin size-4 mr-2" />
															Loading volume snapshots...
														</div>
													) : (
														`No volume snapshots found in ${selectedNamespace === 'all' ? 'any namespace' : `namespace "${selectedNamespace}"`}.`
													)}
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
				</div>				{/* Controlled detail drawer for full volume snapshot details */}
				{selectedVolumeSnapshotForDetails && (
					<VolumeSnapshotDetailDrawer
						item={selectedVolumeSnapshotForDetails}
						open={detailDrawerOpen}
						onOpenChange={(open) => {
							setDetailDrawerOpen(open)
							if (!open) {
								setSelectedVolumeSnapshotForDetails(null)
							}
						}}
					/>
				)}
			</div>
		</div>
	)
}

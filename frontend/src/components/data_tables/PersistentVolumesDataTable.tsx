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

import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { PersistentVolumeDetailDrawer } from "@/components/viewers/PersistentVolumeDetailDrawer"
import { ResourceYamlEditor } from "@/components/ResourceYamlEditor"
import { DataTableFilters, type FilterOption, type BulkAction } from "@/components/ui/data-table-filters"
import { usePersistentVolumesWithWebSocket } from "@/hooks/usePersistentVolumesWithWebSocket"
import { persistentVolumeSchema } from "@/lib/schemas/persistent-volume"
import { z } from "zod"

// Drag handle component
function DragHandle({ id }: { id: string }) {
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
	switch (status.toLowerCase()) {
		case 'available':
			return (
				<Badge variant="outline" className="text-green-600 border-border bg-transparent px-1.5">
					<IconCircleCheckFilled className="size-3 fill-green-600 mr-1" />
					Available
				</Badge>
			)
		case 'bound':
			return (
				<Badge variant="outline" className="text-blue-600 border-border bg-transparent px-1.5">
					<IconCircleCheckFilled className="size-3 fill-blue-600 mr-1" />
					Bound
				</Badge>
			)
		case 'released':
			return (
				<Badge variant="outline" className="text-yellow-600 border-border bg-transparent px-1.5">
					<IconAlertTriangle className="size-3 text-yellow-600 mr-1" />
					Released
				</Badge>
			)
		case 'failed':
			return (
				<Badge variant="outline" className="text-red-600 border-border bg-transparent px-1.5">
					<IconAlertTriangle className="size-3 text-red-600 mr-1" />
					Failed
				</Badge>
			)
		default:
			return (
				<Badge variant="outline" className="text-muted-foreground px-1.5">
					{status}
				</Badge>
			)
	}
}

// Column definitions for persistent volumes table
const createColumns = (
	onViewDetails: (pv: z.infer<typeof persistentVolumeSchema>) => void
): ColumnDef<z.infer<typeof persistentVolumeSchema>>[] => [
		{
			id: "pv-drag",
			header: () => null,
			cell: ({ row }) => <DragHandle id={row.original.id} />,
		},
		{
			id: "pv-select",
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
			id: "pv-name",
			accessorKey: "name",
			header: "Name",
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
			id: "pv-capacity",
			accessorKey: "capacity",
			header: "Capacity",
			cell: ({ row }) => (
				<div className="font-mono text-sm">{row.original.capacity}</div>
			),
		},
		{
			id: "pv-access-modes",
			accessorKey: "accessModesDisplay",
			header: "Access Modes",
			cell: ({ row }) => (
				<div className="text-sm">{row.original.accessModesDisplay}</div>
			),
		},
		{
			id: "pv-reclaim-policy",
			accessorKey: "reclaimPolicy",
			header: "Reclaim Policy",
			cell: ({ row }) => (
				<div className="text-sm">{row.original.reclaimPolicy}</div>
			),
		},
		{
			id: "pv-status",
			accessorKey: "status",
			header: "Status",
			cell: ({ row }) => getStatusBadge(row.original.status),
		},
		{
			id: "pv-claim",
			accessorKey: "claim",
			header: "Claim",
			cell: ({ row }) => (
				<div className="text-sm">{row.original.claim || "<none>"}</div>
			),
		},
		{
			id: "pv-storage-class",
			accessorKey: "storageClass",
			header: "Storage Class",
			cell: ({ row }) => (
				<div className="text-sm">{row.original.storageClass}</div>
			),
		},
		{
			id: "pv-volume-source",
			accessorKey: "volumeSource",
			header: "Volume Source",
			cell: ({ row }) => (
				<div className="text-sm">{row.original.volumeSource}</div>
			),
		},
		{
			id: "pv-age",
			accessorKey: "age",
			header: "Age",
			cell: ({ row }) => (
				<div className="font-mono text-sm">{row.original.age}</div>
			),
		},
		{
			id: "pv-actions",
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
							namespace=""
							resourceKind="PersistentVolume"
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
function DraggableRow({ row }: { row: Row<z.infer<typeof persistentVolumeSchema>> }) {
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

export function PersistentVolumesDataTable() {
	const { data: persistentVolumes, loading, error, refetch, isConnected } = usePersistentVolumesWithWebSocket(true)

	const [sorting, setSorting] = React.useState<SortingState>([])
	const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
	const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({})
	const [rowSelection, setRowSelection] = React.useState({})
	const [globalFilter, setGlobalFilter] = React.useState("")
	const [statusFilter, setStatusFilter] = React.useState<string>("all")
	const [detailDrawerOpen, setDetailDrawerOpen] = React.useState(false)
	const [selectedPVForDetails, setSelectedPVForDetails] = React.useState<z.infer<typeof persistentVolumeSchema> | null>(null)

	// Handle opening detail drawer
	const handleViewDetails = React.useCallback((pv: z.infer<typeof persistentVolumeSchema>) => {
		setSelectedPVForDetails(pv)
		setDetailDrawerOpen(true)
	}, [])

	// Create columns with the onViewDetails callback
	const columns = React.useMemo(
		() => createColumns(handleViewDetails),
		[handleViewDetails]
	)

	// Filter options for PV statuses
	const pvStatuses: FilterOption[] = React.useMemo(() => {
		const statuses = new Set(persistentVolumes.map(pv => pv.status))
		return Array.from(statuses).sort().map(status => ({
			value: status,
			label: status,
			badge: getStatusBadge(status)
		}))
	}, [persistentVolumes])

	// Filter data based on global filter and status filter
	const filteredData = React.useMemo(() => {
		let filtered = persistentVolumes

		// Apply status filter
		if (statusFilter !== "all") {
			filtered = filtered.filter(pv => pv.status === statusFilter)
		}

		// Apply global filter (search)
		if (globalFilter) {
			const searchTerm = globalFilter.toLowerCase()
			filtered = filtered.filter(pv =>
				pv.name.toLowerCase().includes(searchTerm) ||
				pv.capacity.toLowerCase().includes(searchTerm) ||
				pv.status.toLowerCase().includes(searchTerm) ||
				pv.accessModesDisplay.toLowerCase().includes(searchTerm) ||
				pv.reclaimPolicy.toLowerCase().includes(searchTerm) ||
				(pv.claim && pv.claim.toLowerCase().includes(searchTerm)) ||
				pv.storageClass.toLowerCase().includes(searchTerm) ||
				pv.volumeSource.toLowerCase().includes(searchTerm)
			)
		}

		return filtered
	}, [persistentVolumes, statusFilter, globalFilter])

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

	// Bulk actions for persistent volumes
	const pvBulkActions: BulkAction[] = React.useMemo(() => [
		{
			id: "export-yaml",
			label: "Export Selected as YAML",
			icon: <IconDownload className="size-4" />,
			action: () => {
				const selectedPVs = table.getFilteredSelectedRowModel().rows.map(row => row.original)
				console.log('Export YAML for PVs:', selectedPVs.map(pv => pv.name))
				// TODO: Implement bulk YAML export
			},
			requiresSelection: true,
		},
		{
			id: "copy-names",
			label: "Copy PV Names",
			icon: <IconCopy className="size-4" />,
			action: () => {
				const selectedPVs = table.getFilteredSelectedRowModel().rows.map(row => row.original)
				const names = selectedPVs.map(pv => pv.name).join('\n')
				navigator.clipboard.writeText(names)
				console.log('Copied PV names:', names)
			},
			requiresSelection: true,
		},
		{
			id: "delete-pvs",
			label: "Delete Selected PVs",
			icon: <IconTrash className="size-4" />,
			action: () => {
				const selectedPVs = table.getFilteredSelectedRowModel().rows.map(row => row.original)
				console.log('Delete PVs:', selectedPVs.map(pv => pv.name))
				// TODO: Implement bulk PV deletion with confirmation
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
		filteredData.map((pv) => pv.id)
	)

	React.useEffect(() => {
		setSortableIds(filteredData.map((pv) => pv.id))
	}, [filteredData])

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
					<span className="ml-2">Loading persistent volumes...</span>
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
				searchPlaceholder="Search PVs by name, capacity, status, access modes, reclaim policy, claim, storage class, or volume source... (Press '/' to focus)"
				categoryFilter={statusFilter}
				onCategoryFilterChange={setStatusFilter}
				categoryLabel="Filter by status"
				categoryOptions={pvStatuses}
				selectedCount={table.getFilteredSelectedRowModel().rows.length}
				totalCount={table.getFilteredRowModel().rows.length}
				bulkActions={pvBulkActions}
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
													No persistent volumes found.
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
						{isConnected && (
							<div className="inline-flex items-center space-x-1 ml-4 text-xs text-green-600">
								<div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
								<span>Real-time updates enabled</span>
							</div>
						)}
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

			{/* Controlled detail drawer for full PV details */}
			{selectedPVForDetails && (
				<PersistentVolumeDetailDrawer
					item={selectedPVForDetails}
					open={detailDrawerOpen}
					onOpenChange={(open) => {
						setDetailDrawerOpen(open)
						if (!open) {
							setSelectedPVForDetails(null)
						}
					}}
				/>
			)}
		</div>
	)
}

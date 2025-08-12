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
import { ResourceQuotaDetailDrawer } from "@/components/viewers/ResourceQuotaDetailDrawer"
import { ResourceYamlEditor } from "@/components/ResourceYamlEditor"
import { DataTableFilters, type FilterOption, type BulkAction } from "@/components/ui/data-table-filters"
import { useResourceQuotasWithWebSocket } from "@/hooks/useResourceQuotasWithWebSocket"
import { useNamespace } from "@/contexts/namespace-context"
import { type DashboardResourceQuota } from "@/lib/k8s-cluster"

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

// Column definitions for resource quotas table
const createColumns = (
	onViewDetails: (resourceQuota: DashboardResourceQuota) => void,
	onDelete?: (resourceQuota: DashboardResourceQuota) => void
): ColumnDef<DashboardResourceQuota>[] => [
		{
			id: "rq-drag",
			header: () => null,
			cell: ({ row }) => <DragHandle id={row.original.id} />,
		},
		{
			id: "rq-select",
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
			id: "rq-name",
			accessorKey: "name",
			header: "Resource Quota Name",
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
			id: "rq-namespace",
			accessorKey: "namespace",
			header: "Namespace",
			cell: ({ row }) => (
				<Badge variant="outline" className="bg-transparent px-1.5">
					{row.original.namespace}
				</Badge>
			),
		},
		{
			id: "rq-age",
			accessorKey: "age",
			header: "Age",
		},
		{
			id: "rq-hard-limits",
			accessorKey: "hardLimits",
			header: "Hard Limits",
			cell: ({ row }) => (
				<div className="text-sm">
					{row.original.hardLimits.length} limits
				</div>
			),
		},
		{
			id: "rq-used-resources",
			accessorKey: "usedResources",
			header: "Used Resources",
			cell: ({ row }) => (
				<div className="text-sm">
					{row.original.usedResources.length} resources
				</div>
			),
		},
		{
			id: "rq-actions",
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
							resourceKind="ResourceQuota"
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
						<DropdownMenuItem
							className="text-red-600"
							onClick={() => onDelete?.(row.original)}
						>
							<IconTrash className="size-4 mr-2" />
							Delete
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			),
		},
	]

// Draggable row component
function DraggableRow({ row }: { row: Row<DashboardResourceQuota> }) {
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
		opacity: isDragging ? 0.8 : 1,
	}

	return (
		<TableRow
			key={row.id}
			ref={setNodeRef}
			style={style}
			data-state={row.getIsSelected() && "selected"}
		>
			{row.getVisibleCells().map((cell) => (
				<TableCell key={cell.id}>
					{flexRender(cell.column.columnDef.cell, cell.getContext())}
				</TableCell>
			))}
		</TableRow>
	)
}

export function ResourceQuotasDataTable() {
	// Use WebSocket-enabled hook instead of regular hook
	const { data: resourceQuotas, loading, error, refetch, isConnected } = useResourceQuotasWithWebSocket()
	const { selectedNamespace } = useNamespace()

	const [sorting, setSorting] = React.useState<SortingState>([])
	const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
	const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({})
	const [rowSelection, setRowSelection] = React.useState({})
	const [globalFilter, setGlobalFilter] = React.useState("")
	const [resourceTypeFilter, setResourceTypeFilter] = React.useState<string>("all")
	const [detailDrawerOpen, setDetailDrawerOpen] = React.useState(false)
	const [selectedResourceQuotaForDetails, setSelectedResourceQuotaForDetails] = React.useState<DashboardResourceQuota | null>(null)

	// Handle opening detail drawer
	const handleViewDetails = React.useCallback((resourceQuota: DashboardResourceQuota) => {
		setSelectedResourceQuotaForDetails(resourceQuota)
		setDetailDrawerOpen(true)
	}, [])

	// Handle delete resource quota
	const handleDelete = React.useCallback((resourceQuota: DashboardResourceQuota) => {
		// TODO: Implement delete functionality
		console.log('Delete resource quota:', resourceQuota.name, 'in namespace:', resourceQuota.namespace)
	}, [])

	// Create columns with the callbacks
	const columns = React.useMemo(
		() => createColumns(handleViewDetails, handleDelete),
		[handleViewDetails, handleDelete]
	)

	// Filter options for resource types based on hard limits
	const resourceTypeFilters: FilterOption[] = React.useMemo(() => {
		const resourceTypes = new Set<string>()
		resourceQuotas.forEach(quota => {
			quota.hardLimits.forEach(limit => {
				// Extract resource type from limit name (e.g. "requests.cpu" -> "CPU", "limits.memory" -> "Memory")
				const resourceName = limit.name.replace(/^(requests\.|limits\.)/, '')
				const displayName = resourceName.charAt(0).toUpperCase() + resourceName.slice(1)
				resourceTypes.add(displayName)
			})
		})
		return Array.from(resourceTypes).sort().map(type => ({
			value: type,
			label: type,
		}))
	}, [resourceQuotas])

	// Filter data based on global filter and resource type filter
	const filteredData = React.useMemo(() => {
		let filtered = resourceQuotas

		// Apply resource type filter
		if (resourceTypeFilter !== "all") {
			filtered = filtered.filter(quota => {
				return quota.hardLimits.some(limit => {
					const resourceName = limit.name.replace(/^(requests\.|limits\.)/, '')
					const displayName = resourceName.charAt(0).toUpperCase() + resourceName.slice(1)
					return displayName === resourceTypeFilter
				})
			})
		}

		// Apply global filter (search)
		if (globalFilter) {
			const searchTerm = globalFilter.toLowerCase()
			filtered = filtered.filter(quota =>
				quota.name.toLowerCase().includes(searchTerm) ||
				quota.namespace.toLowerCase().includes(searchTerm) ||
				quota.hardLimits.some(limit =>
					limit.name.toLowerCase().includes(searchTerm) ||
					limit.limit.toLowerCase().includes(searchTerm) ||
					limit.used.toLowerCase().includes(searchTerm)
				) ||
				quota.usedResources.some(resource =>
					resource.name.toLowerCase().includes(searchTerm) ||
					resource.quantity.toLowerCase().includes(searchTerm)
				)
			)
		}

		return filtered
	}, [resourceQuotas, resourceTypeFilter, globalFilter])

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

	// Bulk actions for resource quotas
	const resourceQuotaBulkActions: BulkAction[] = React.useMemo(() => [
		{
			id: "export-yaml",
			label: "Export Selected as YAML",
			icon: <IconDownload className="size-4" />,
			action: () => {
				const selectedResourceQuotas = table.getFilteredSelectedRowModel().rows.map(row => row.original)
				console.log('Export YAML for ResourceQuotas:', selectedResourceQuotas.map(rq => rq.name))
				// TODO: Implement bulk YAML export
			},
			requiresSelection: true,
		},
		{
			id: "copy-names",
			label: "Copy ResourceQuota Names",
			icon: <IconCopy className="size-4" />,
			action: () => {
				const selectedResourceQuotas = table.getFilteredSelectedRowModel().rows.map(row => row.original)
				const names = selectedResourceQuotas.map(rq => rq.name).join('\n')
				navigator.clipboard.writeText(names)
				console.log('Copied ResourceQuota names:', names)
			},
			requiresSelection: true,
		},
		{
			id: "delete-resource-quotas",
			label: "Delete Selected ResourceQuotas",
			icon: <IconTrash className="size-4" />,
			action: () => {
				const selectedResourceQuotas = table.getFilteredSelectedRowModel().rows.map(row => row.original)
				console.log('Delete ResourceQuotas:', selectedResourceQuotas.map(rq => `${rq.name} in ${rq.namespace}`))
				// TODO: Implement bulk ResourceQuota deletion with confirmation
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
		filteredData.map((resourceQuota) => resourceQuota.id)
	)

	React.useEffect(() => {
		setSortableIds(filteredData.map((resourceQuota) => resourceQuota.id))
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
					<span className="ml-2">Loading resource quotas...</span>
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
					searchPlaceholder="Search ResourceQuotas by name, namespace, limits, or usage... (Press '/' to focus)"
					categoryFilter={resourceTypeFilter}
					onCategoryFilterChange={setResourceTypeFilter}
					categoryLabel="Filter by resource type"
					categoryOptions={resourceTypeFilters}
					selectedCount={table.getFilteredSelectedRowModel().rows.length}
					totalCount={table.getFilteredRowModel().rows.length}
					bulkActions={resourceQuotaBulkActions}
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
													No resource quotas found in {selectedNamespace === 'all' ? 'any namespace' : `namespace "${selectedNamespace}"`}.
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

			{/* Controlled detail drawer for full resource quota details */}
			{selectedResourceQuotaForDetails && (
				<ResourceQuotaDetailDrawer
					item={selectedResourceQuotaForDetails}
					open={detailDrawerOpen}
					onOpenChange={(open: boolean) => {
						setDetailDrawerOpen(open)
						if (!open) {
							setSelectedResourceQuotaForDetails(null)
						}
					}}
				/>
			)}
		</div>
	)
}

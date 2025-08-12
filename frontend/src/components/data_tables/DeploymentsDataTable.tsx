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
	IconRefresh,
	IconTrash,
	IconEdit,
	IconEye,
	IconDownload,
	IconCopy,
	IconScale,
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
import { DeploymentDetailDrawer } from "@/components/viewers/DeploymentDetailDrawer"
import { ResourceYamlEditor } from "@/components/ResourceYamlEditor"
import { useDeploymentsWithWebSocket } from "@/hooks/useDeploymentsWithWebSocket"
import { useNamespace } from "@/contexts/namespace-context"
import { z } from "zod"

// Deployment schema from kubernetes-dashboard.tsx
export const deploymentSchema = z.object({
	id: z.number(),
	name: z.string(),
	namespace: z.string(),
	ready: z.string(),
	upToDate: z.number(),
	available: z.number(),
	age: z.string(),
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

// Column definitions for deployments table
const createColumns = (
	onViewDetails: (deployment: z.infer<typeof deploymentSchema>) => void
): ColumnDef<z.infer<typeof deploymentSchema>>[] => [
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
			header: "Deployment Name",
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
			cell: ({ row }) => (
				<div className="font-mono text-sm">{row.original.ready}</div>
			),
		},
		{
			accessorKey: "upToDate",
			header: "Up-to-date",
			cell: ({ row }) => (
				<div className="font-mono text-sm">{row.original.upToDate}</div>
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
			accessorKey: "age",
			header: "Age",
			cell: ({ row }) => (
				<div className="font-mono text-sm">{row.original.age}</div>
			),
		},
		{
			accessorKey: "image",
			header: "Image",
			cell: ({ row }) => (
				<div className="font-mono text-sm truncate max-w-48">{row.original.image}</div>
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
							resourceKind="Deployment"
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
function DraggableRow({ row }: { row: Row<z.infer<typeof deploymentSchema>> }) {
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

export function DeploymentsDataTable() {
	const { data: deployments, loading, error, refetch, isConnected } = useDeploymentsWithWebSocket(true)
	const { selectedNamespace } = useNamespace()

	const [sorting, setSorting] = React.useState<SortingState>([])
	const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
	const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({})
	const [rowSelection, setRowSelection] = React.useState({})
	const [globalFilter, setGlobalFilter] = React.useState("")
	const [statusFilter, setStatusFilter] = React.useState<string>("all")
	const [detailDrawerOpen, setDetailDrawerOpen] = React.useState(false)
	const [selectedDeploymentForDetails, setSelectedDeploymentForDetails] = React.useState<z.infer<typeof deploymentSchema> | null>(null)

	// Handle opening detail drawer
	const handleViewDetails = React.useCallback((deployment: z.infer<typeof deploymentSchema>) => {
		setSelectedDeploymentForDetails(deployment)
		setDetailDrawerOpen(true)
	}, [])

	// Create columns with the onViewDetails callback
	const columns = React.useMemo(
		() => createColumns(handleViewDetails),
		[handleViewDetails]
	)

	// For deployments, we can create status filters based on the ready/available status
	const deploymentStatuses: FilterOption[] = React.useMemo(() => {
		const statuses = new Set<string>()
		deployments.forEach(deployment => {
			// Create status based on availability
			if (deployment.available > 0) {
				statuses.add("Available")
			} else {
				statuses.add("Unavailable")
			}
		})
		return Array.from(statuses).sort().map(status => ({
			value: status,
			label: status,
			badge: (
				<Badge variant="outline" className={status === "Available" ? "text-green-600 border-border bg-transparent px-1.5" : "text-red-600 border-border bg-transparent px-1.5"}>
					{status}
				</Badge>
			)
		}))
	}, [deployments])

	// Filter data based on global filter and status filter
	const filteredData = React.useMemo(() => {
		let filtered = deployments

		// Apply status filter
		if (statusFilter !== "all") {
			filtered = filtered.filter(deployment => {
				const isAvailable = deployment.available > 0
				const status = isAvailable ? "Available" : "Unavailable"
				return status === statusFilter
			})
		}

		// Apply global filter (search)
		if (globalFilter) {
			const searchTerm = globalFilter.toLowerCase()
			filtered = filtered.filter(deployment =>
				deployment.name.toLowerCase().includes(searchTerm) ||
				deployment.namespace.toLowerCase().includes(searchTerm) ||
				deployment.image.toLowerCase().includes(searchTerm)
			)
		}

		return filtered
	}, [deployments, statusFilter, globalFilter])

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

	// Bulk actions for deployments
	const deploymentBulkActions: BulkAction[] = React.useMemo(() => [
		{
			id: "scale-deployments",
			label: "Scale Selected Deployments",
			icon: <IconScale className="size-4" />,
			action: () => {
				const selectedDeployments = table.getFilteredSelectedRowModel().rows.map(row => row.original)
				console.log('Scale deployments:', selectedDeployments.map(d => `${d.name} in ${d.namespace}`))
				// TODO: Implement bulk deployment scaling
			},
			requiresSelection: true,
		},
		{
			id: "restart-deployments",
			label: "Restart Selected Deployments",
			icon: <IconRefresh className="size-4" />,
			action: () => {
				const selectedDeployments = table.getFilteredSelectedRowModel().rows.map(row => row.original)
				console.log('Restart deployments:', selectedDeployments.map(d => `${d.name} in ${d.namespace}`))
				// TODO: Implement bulk deployment restart
			},
			requiresSelection: true,
		},
		{
			id: "export-yaml",
			label: "Export Selected as YAML",
			icon: <IconDownload className="size-4" />,
			action: () => {
				const selectedDeployments = table.getFilteredSelectedRowModel().rows.map(row => row.original)
				console.log('Export YAML for deployments:', selectedDeployments.map(d => d.name))
				// TODO: Implement bulk YAML export
			},
			requiresSelection: true,
		},
		{
			id: "copy-names",
			label: "Copy Deployment Names",
			icon: <IconCopy className="size-4" />,
			action: () => {
				const selectedDeployments = table.getFilteredSelectedRowModel().rows.map(row => row.original)
				const names = selectedDeployments.map(d => d.name).join('\n')
				navigator.clipboard.writeText(names)
				console.log('Copied deployment names:', names)
			},
			requiresSelection: true,
		},
		{
			id: "delete-deployments",
			label: "Delete Selected Deployments",
			icon: <IconTrash className="size-4" />,
			action: () => {
				const selectedDeployments = table.getFilteredSelectedRowModel().rows.map(row => row.original)
				console.log('Delete deployments:', selectedDeployments.map(d => `${d.name} in ${d.namespace}`))
				// TODO: Implement bulk deployment deletion with confirmation
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
		deployments.map((deployment: z.infer<typeof deploymentSchema>) => deployment.id)
	)

	React.useEffect(() => {
		setSortableIds(deployments.map((deployment: z.infer<typeof deploymentSchema>) => deployment.id))
	}, [deployments])

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
					<span className="ml-2">Loading deployments...</span>
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
					searchPlaceholder="Search deployments by name, namespace, or image... (Press '/' to focus)"
					categoryFilter={statusFilter}
					onCategoryFilterChange={setStatusFilter}
					categoryLabel="Filter by status"
					categoryOptions={deploymentStatuses}
					selectedCount={table.getFilteredSelectedRowModel().rows.length}
					totalCount={table.getFilteredRowModel().rows.length}
					bulkActions={deploymentBulkActions}
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
													No deployments found in {selectedNamespace === 'all' ? 'any namespace' : `namespace "${selectedNamespace}"`}.
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

			{/* Controlled detail drawer for full deployment details */}
			{selectedDeploymentForDetails && (
				<DeploymentDetailDrawer
					item={selectedDeploymentForDetails}
					open={detailDrawerOpen}
					onOpenChange={(open) => {
						setDetailDrawerOpen(open)
						if (!open) {
							setSelectedDeploymentForDetails(null)
						}
					}}
				/>
			)}
		</div>
	)
}

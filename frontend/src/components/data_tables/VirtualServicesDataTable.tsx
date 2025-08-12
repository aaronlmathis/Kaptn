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
import { DataTableFilters, type FilterOption, type BulkAction } from "@/components/ui/data-table-filters"
import { VirtualServiceDetailDrawer } from "@/components/viewers/VirtualServiceDetailDrawer"
import { ResourceYamlEditor } from "@/components/ResourceYamlEditor"
import { useVirtualServicesWithWebSocket } from "@/hooks/useVirtualServicesWithWebSocket"
import { useNamespace } from "@/contexts/namespace-context"
import { virtualServiceSchema } from "@/types/virtual-service"
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

// Helper function to get virtual service type string
function getVirtualServiceType(hosts: string[], gateways: string[]): string {
	if (hosts.length === 0 && gateways.length === 0) {
		return "No Routes"
	}

	const hasExternalHost = hosts.some(h => !h.includes('.local') && !h.includes('.cluster.local'))
	const hasGateway = gateways.length > 0

	if (hasExternalHost && hasGateway) {
		return "External"
	}
	if (hasGateway) {
		return "Gateway"
	}
	if (hosts.length > 0) {
		return "Internal"
	}

	return "Unknown"
}

// Virtual Service type badge helper
function getVirtualServiceTypeBadge(hosts: string[], gateways: string[]) {
	if (hosts.length === 0 && gateways.length === 0) {
		return (
			<Badge variant="outline" className="text-muted-foreground border-border bg-transparent px-1.5">
				<IconCircleCheckFilled className="size-3 fill-muted-foreground mr-1" />
				No Routes
			</Badge>
		)
	}

	const hasExternalHost = hosts.some(h => !h.includes('.local') && !h.includes('.cluster.local'))
	const hasGateway = gateways.length > 0

	if (hasExternalHost && hasGateway) {
		return (
			<Badge variant="outline" className="text-green-600 border-border bg-transparent px-1.5">
				<IconCircleCheckFilled className="size-3 fill-green-600 mr-1" />
				External
			</Badge>
		)
	}
	if (hasGateway) {
		return (
			<Badge variant="outline" className="text-blue-600 border-border bg-transparent px-1.5">
				<IconCircleCheckFilled className="size-3 fill-blue-600 mr-1" />
				Gateway
			</Badge>
		)
	}
	if (hosts.length > 0) {
		return (
			<Badge variant="outline" className="text-purple-600 border-border bg-transparent px-1.5">
				<IconCircleCheckFilled className="size-3 fill-purple-600 mr-1" />
				Internal
			</Badge>
		)
	}

	return (
		<Badge variant="outline" className="text-muted-foreground border-border bg-transparent px-1.5">
			Unknown
		</Badge>
	)
}

// Column definitions for virtual services table
const createColumns = (
	onViewDetails: (virtualService: z.infer<typeof virtualServiceSchema>) => void
): ColumnDef<z.infer<typeof virtualServiceSchema>>[] => [
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
			header: "Virtual Service Name",
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
			cell: ({ row }) => getVirtualServiceTypeBadge(row.original.hosts, row.original.gateways),
		},
		{
			accessorKey: "hosts",
			header: "Hosts",
			cell: ({ row }) => {
				const hosts = row.original.hosts
				if (!hosts || hosts.length === 0) {
					return <span className="text-muted-foreground">None</span>
				}
				return (
					<div className="flex flex-wrap gap-1">
						{hosts.map((host, index) => (
							<Badge key={index} variant="secondary" className="text-xs">
								{host}
							</Badge>
						))}
					</div>
				)
			},
		},
		{
			accessorKey: "gateways",
			header: "Gateways",
			cell: ({ row }) => {
				const gateways = row.original.gateways
				if (!gateways || gateways.length === 0) {
					return <span className="text-muted-foreground">None</span>
				}
				return (
					<div className="font-mono text-sm">{gateways.join(", ")}</div>
				)
			},
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
							resourceKind="VirtualService"
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
						<DropdownMenuItem onClick={() => {
							// TODO: Implement virtual service restart functionality
							console.log('Restart virtual service:', row.original.name, 'in namespace:', row.original.namespace)
						}}>
							<IconRefresh className="size-4 mr-2" />
							Restart Virtual Service
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
function DraggableRow({ row }: { row: Row<z.infer<typeof virtualServiceSchema>> }) {
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

export function VirtualServicesDataTable() {
	const { data: virtualServices, loading, error, refetch, isConnected } = useVirtualServicesWithWebSocket(true)
	const { selectedNamespace } = useNamespace()

	const [sorting, setSorting] = React.useState<SortingState>([])
	const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
	const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({})
	const [rowSelection, setRowSelection] = React.useState({})
	const [globalFilter, setGlobalFilter] = React.useState("")
	const [statusFilter, setStatusFilter] = React.useState<string>("all")
	const [detailDrawerOpen, setDetailDrawerOpen] = React.useState(false)
	const [selectedVirtualServiceForDetails, setSelectedVirtualServiceForDetails] = React.useState<z.infer<typeof virtualServiceSchema> | null>(null)

	// Handle opening detail drawer
	const handleViewDetails = React.useCallback((virtualService: z.infer<typeof virtualServiceSchema>) => {
		setSelectedVirtualServiceForDetails(virtualService)
		setDetailDrawerOpen(true)
	}, [])

	// Create filter options based on virtual service types
	const virtualServiceStatuses: FilterOption[] = React.useMemo(() => {
		const types = new Set<string>()
		virtualServices.forEach(vs => {
			const type = getVirtualServiceType(vs.hosts, vs.gateways)
			types.add(type)
		})
		return Array.from(types).sort().map(type => ({
			value: type,
			label: type,
			badge: getVirtualServiceTypeBadge(
				type === "External" ? ["external.example.com"] :
					type === "Gateway" ? ["gateway"] :
						type === "Internal" ? ["internal"] : [],
				type === "External" || type === "Gateway" ? ["gateway"] : []
			)
		}))
	}, [virtualServices])

	// Filter data based on global filter and status filter
	const filteredData = React.useMemo(() => {
		let filtered = virtualServices

		// Apply type filter
		if (statusFilter !== "all") {
			filtered = filtered.filter(virtualService => {
				const type = getVirtualServiceType(virtualService.hosts, virtualService.gateways)
				return type === statusFilter
			})
		}

		// Apply global filter (search)
		if (globalFilter) {
			const searchTerm = globalFilter.toLowerCase()
			filtered = filtered.filter(virtualService =>
				virtualService.name.toLowerCase().includes(searchTerm) ||
				virtualService.namespace.toLowerCase().includes(searchTerm) ||
				virtualService.hosts.some(host => host.toLowerCase().includes(searchTerm)) ||
				virtualService.gateways.some(gateway => gateway.toLowerCase().includes(searchTerm))
			)
		}

		return filtered
	}, [virtualServices, statusFilter, globalFilter])

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

	// Create bulk actions for VirtualServices (moved after table creation)
	const virtualServiceBulkActions: BulkAction[] = React.useMemo(() => [
		{
			id: "export-yaml",
			label: "Export Selected as YAML",
			icon: <IconDownload className="size-4" />,
			action: () => {
				const selectedVirtualServices = table.getFilteredSelectedRowModel().rows.map(row => row.original)
				console.log('Export YAML for VirtualServices:', selectedVirtualServices.map(vs => vs.name))
				// TODO: Implement bulk YAML export
			},
			requiresSelection: true,
		},
		{
			id: "copy-names",
			label: "Copy VirtualService Names",
			icon: <IconCopy className="size-4" />,
			action: () => {
				const selectedVirtualServices = table.getFilteredSelectedRowModel().rows.map(row => row.original)
				const names = selectedVirtualServices.map(vs => vs.name).join('\n')
				navigator.clipboard.writeText(names)
				console.log('Copied VirtualService names:', names)
			},
			requiresSelection: true,
		},
		{
			id: "copy-hosts",
			label: "Copy Host Names",
			icon: <IconNetwork className="size-4" />,
			action: () => {
				const selectedVirtualServices = table.getFilteredSelectedRowModel().rows.map(row => row.original)
				const hosts = selectedVirtualServices.flatMap(vs => vs.hosts).join('\n')
				navigator.clipboard.writeText(hosts)
				console.log('Copied host names:', hosts)
			},
			requiresSelection: true,
		},
		{
			id: "restart-virtualservices",
			label: "Restart Selected VirtualServices",
			icon: <IconRefresh className="size-4" />,
			action: () => {
				const selectedVirtualServices = table.getFilteredSelectedRowModel().rows.map(row => row.original)
				console.log('Restart VirtualServices:', selectedVirtualServices.map(vs => `${vs.name} in ${vs.namespace}`))
				// TODO: Implement bulk restart
			},
			requiresSelection: true,
		},
		{
			id: "delete-virtualservices",
			label: "Delete Selected VirtualServices",
			icon: <IconTrash className="size-4" />,
			action: () => {
				const selectedVirtualServices = table.getFilteredSelectedRowModel().rows.map(row => row.original)
				console.log('Delete VirtualServices:', selectedVirtualServices.map(vs => `${vs.name} in ${vs.namespace}`))
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
		virtualServices.map((virtualService: z.infer<typeof virtualServiceSchema>) => virtualService.id)
	)

	React.useEffect(() => {
		setSortableIds(virtualServices.map((virtualService: z.infer<typeof virtualServiceSchema>) => virtualService.id))
	}, [virtualServices])

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
					<span className="ml-2">Loading virtual services...</span>
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
					searchPlaceholder="Search virtual services by name, namespace, hosts, or gateways... (Press '/' to focus)"
					categoryFilter={statusFilter}
					onCategoryFilterChange={setStatusFilter}
					categoryLabel="Filter by type"
					categoryOptions={virtualServiceStatuses}
					selectedCount={table.getFilteredSelectedRowModel().rows.length}
					totalCount={table.getFilteredRowModel().rows.length}
					bulkActions={virtualServiceBulkActions}
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
													No virtual services found in {selectedNamespace === 'all' ? 'any namespace' : `namespace "${selectedNamespace}"`}.
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

			{/* Controlled detail drawer for full virtual service details */}
			{selectedVirtualServiceForDetails && (
				<VirtualServiceDetailDrawer
					item={selectedVirtualServiceForDetails}
					open={detailDrawerOpen}
					onOpenChange={(open) => {
						setDetailDrawerOpen(open)
						if (!open) {
							setSelectedVirtualServiceForDetails(null)
						}
					}}
				/>
			)}
		</div>
	)
}

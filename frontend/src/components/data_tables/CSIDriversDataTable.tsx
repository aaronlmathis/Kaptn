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
import { CSIDriverDetailDrawer } from "@/components/viewers/CSIDriverDetailDrawer"
import { ResourceYamlEditor } from "@/components/ResourceYamlEditor"
import { useCSIDrivers } from "@/hooks/use-k8s-data"
import { csiDriverSchema } from "@/lib/schemas/csi-driver"
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

// Status badge helpers
function getAttachRequiredBadge(attachRequired: boolean) {
	return attachRequired ? (
		<Badge variant="outline" className="text-orange-600 border-border bg-transparent px-1.5">
			Required
		</Badge>
	) : (
		<Badge variant="outline" className="text-green-600 border-border bg-transparent px-1.5">
			Not Required
		</Badge>
	)
}

function getPodInfoOnMountBadge(podInfoOnMount: boolean) {
	return podInfoOnMount ? (
		<Badge variant="outline" className="text-blue-600 border-border bg-transparent px-1.5">
			Enabled
		</Badge>
	) : (
		<Badge variant="outline" className="text-muted-foreground border-border bg-transparent px-1.5">
			Disabled
		</Badge>
	)
}

function getStorageCapacityBadge(storageCapacity: boolean) {
	return storageCapacity ? (
		<Badge variant="outline" className="text-green-600 border-border bg-transparent px-1.5">
			Supported
		</Badge>
	) : (
		<Badge variant="outline" className="text-muted-foreground border-border bg-transparent px-1.5">
			Not Supported
		</Badge>
	)
}

function getFSGroupPolicyBadge(fsGroupPolicy: string) {
	switch (fsGroupPolicy) {
		case "File":
			return (
				<Badge variant="outline" className="text-blue-600 border-border bg-transparent px-1.5">
					File
				</Badge>
			)
		case "ReadWriteOnceWithFSType":
			return (
				<Badge variant="outline" className="text-green-600 border-border bg-transparent px-1.5">
					RWO+FSType
				</Badge>
			)
		default:
			return (
				<Badge variant="outline" className="text-muted-foreground border-border bg-transparent px-1.5">
					{fsGroupPolicy || "None"}
				</Badge>
			)
	}
}

// Column definitions for CSI drivers table
const createColumns = (
	onViewDetails: (csiDriver: z.infer<typeof csiDriverSchema>) => void
): ColumnDef<z.infer<typeof csiDriverSchema>>[] => [
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
			header: "CSI Driver Name",
			cell: ({ row }) => {
				return (
					<div className="flex items-center gap-2">
						<button
							onClick={() => onViewDetails(row.original)}
							className="text-left hover:underline focus:underline focus:outline-none"
						>
							{row.original.name}
						</button>
					</div>
				)
			},
			enableHiding: false,
		},
		{
			accessorKey: "attachRequired",
			header: "Attach Required",
			cell: ({ row }) => getAttachRequiredBadge(row.original.attachRequired),
		},
		{
			accessorKey: "podInfoOnMount",
			header: "Pod Info on Mount",
			cell: ({ row }) => getPodInfoOnMountBadge(row.original.podInfoOnMount),
		},
		{
			accessorKey: "storageCapacity",
			header: "Storage Capacity",
			cell: ({ row }) => getStorageCapacityBadge(row.original.storageCapacity),
		},
		{
			accessorKey: "fsGroupPolicy",
			header: "FS Group Policy",
			cell: ({ row }) => getFSGroupPolicyBadge(row.original.fsGroupPolicy),
		},
		{
			accessorKey: "volumeLifecycleModes",
			header: "Lifecycle Modes",
			cell: ({ row }) => (
				<div className="font-mono text-sm">{row.original.volumeLifecycleModes}</div>
			),
		},
		{
			accessorKey: "tokenRequests",
			header: "Token Requests",
			cell: ({ row }) => (
				<div className="font-mono text-sm">{row.original.tokenRequests}</div>
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
							namespace=""
							resourceKind="CSIDriver"
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
						<DropdownMenuItem className="text-red-600 hover:text-red-700 hover:bg-red-50">
							<IconTrash className="size-4 mr-2" />
							Delete
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			),
		},
	]

// Draggable row component
function DraggableRow({ row }: { row: Row<z.infer<typeof csiDriverSchema>> }) {
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

export function CSIDriversDataTable() {
	const { data: csiDrivers, loading, error, refetch } = useCSIDrivers()

	const [sorting, setSorting] = React.useState<SortingState>([])
	const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
	const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({})
	const [rowSelection, setRowSelection] = React.useState({})
	const [globalFilter, setGlobalFilter] = React.useState("")
	const [statusFilter, setStatusFilter] = React.useState<string>("all")
	const [detailDrawerOpen, setDetailDrawerOpen] = React.useState(false)
	const [selectedCSIDriverForDetails, setSelectedCSIDriverForDetails] = React.useState<z.infer<typeof csiDriverSchema> | null>(null)

	// Handle opening detail drawer
	const handleViewDetails = React.useCallback((csiDriver: z.infer<typeof csiDriverSchema>) => {
		setSelectedCSIDriverForDetails(csiDriver)
		setDetailDrawerOpen(true)
	}, [])

	// Create columns with the onViewDetails callback
	const columns = React.useMemo(
		() => createColumns(handleViewDetails),
		[handleViewDetails]
	)

	// Create filter options for CSI drivers based on storage capacity support
	const csiDriverCapabilities: FilterOption[] = React.useMemo(() => {
		const capabilities = new Set<string>()
		csiDrivers.forEach(driver => {
			// Create capability categories based on storage capacity
			if (driver.storageCapacity) {
				capabilities.add("Storage Capacity Supported")
			} else {
				capabilities.add("Storage Capacity Not Supported")
			}
		})
		return Array.from(capabilities).sort().map(capability => ({
			value: capability,
			label: capability,
			badge: (
				<Badge variant="outline" className={capability.includes("Supported") ? "text-green-600 border-border bg-transparent px-1.5" : "text-muted-foreground border-border bg-transparent px-1.5"}>
					{capability.replace("Storage Capacity ", "")}
				</Badge>
			)
		}))
	}, [csiDrivers])

	// Filter data based on global filter and status filter
	const filteredData = React.useMemo(() => {
		let filtered = csiDrivers

		// Apply category filter (storage capacity capabilities)
		if (statusFilter !== "all") {
			filtered = filtered.filter(driver => {
				// Determine capability for this driver
				const capability = driver.storageCapacity
					? "Storage Capacity Supported"
					: "Storage Capacity Not Supported"
				return capability === statusFilter
			})
		}

		// Apply global filter (search)
		if (globalFilter) {
			const searchTerm = globalFilter.toLowerCase()
			filtered = filtered.filter(driver =>
				driver.name.toLowerCase().includes(searchTerm) ||
				driver.fsGroupPolicy.toLowerCase().includes(searchTerm) ||
				driver.volumeLifecycleModes.toString().includes(searchTerm) ||
				driver.tokenRequests.toString().includes(searchTerm) ||
				driver.age.toLowerCase().includes(searchTerm)
			)
		}

		return filtered
	}, [csiDrivers, statusFilter, globalFilter])

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

	// Create bulk actions for CSI drivers
	const csiDriverBulkActions: BulkAction[] = React.useMemo(() => [
		{
			id: "export-yaml",
			label: "Export Selected as YAML",
			icon: <IconDownload className="size-4" />,
			action: () => {
				const selectedDrivers = table.getFilteredSelectedRowModel().rows.map(row => row.original)
				console.log('Export YAML for CSI drivers:', selectedDrivers.map(d => d.name))
				// TODO: Implement bulk YAML export
			},
			requiresSelection: true,
		},
		{
			id: "copy-names",
			label: "Copy Driver Names",
			icon: <IconCopy className="size-4" />,
			action: () => {
				const selectedDrivers = table.getFilteredSelectedRowModel().rows.map(row => row.original)
				const names = selectedDrivers.map(d => d.name).join('\n')
				navigator.clipboard.writeText(names)
				console.log('Copied CSI driver names:', names)
			},
			requiresSelection: true,
		},
		{
			id: "show-capabilities",
			label: "Show Driver Capabilities",
			icon: <IconDatabase className="size-4" />,
			action: () => {
				const selectedDrivers = table.getFilteredSelectedRowModel().rows.map(row => row.original)
				console.log('Show capabilities for CSI drivers:', selectedDrivers.map(d => d.name))
				// TODO: Implement capabilities overview
			},
			requiresSelection: true,
		},
		{
			id: "delete-drivers",
			label: "Delete Selected Drivers",
			icon: <IconTrash className="size-4" />,
			action: () => {
				const selectedDrivers = table.getFilteredSelectedRowModel().rows.map(row => row.original)
				console.log('Delete CSI drivers:', selectedDrivers.map(d => d.name))
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
		csiDrivers.map((csiDriver) => csiDriver.id)
	)

	React.useEffect(() => {
		setSortableIds(csiDrivers.map((csiDriver) => csiDriver.id))
	}, [csiDrivers])

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
					<span className="ml-2">Loading CSI drivers...</span>
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
					searchPlaceholder="Search CSI drivers by name, FS group policy, lifecycle modes, or age... (Press '/' to focus)"
					categoryFilter={statusFilter}
					onCategoryFilterChange={setStatusFilter}
					categoryLabel="Filter by capability"
					categoryOptions={csiDriverCapabilities}
					selectedCount={table.getFilteredSelectedRowModel().rows.length}
					totalCount={table.getFilteredRowModel().rows.length}
					bulkActions={csiDriverBulkActions}
					bulkActionsLabel="Actions"
					table={table}
					showColumnToggle={true}
					onRefresh={refetch}
					isRefreshing={loading}
				/>

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
													No CSI drivers found.
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

			{/* Controlled detail drawer for full CSI driver details */}
			{selectedCSIDriverForDetails && (
				<CSIDriverDetailDrawer
					item={selectedCSIDriverForDetails}
					open={detailDrawerOpen}
					onOpenChange={(open: boolean) => {
						setDetailDrawerOpen(open)
						if (!open) {
							setSelectedCSIDriverForDetails(null)
						}
					}}
				/>
			)}
		</div>
	)
}

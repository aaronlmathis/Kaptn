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
import { DataTableFilters, type FilterOption, type BulkAction } from "@/components/ui/data-table-filters"

import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { ApiResourceDetailDrawer } from "@/components/viewers/ApiResourceDetailDrawer"
import { ResourceYamlEditor } from "@/components/ResourceYamlEditor"
import { useAPIResources } from "@/hooks/use-k8s-data"
import { z } from "zod"

// API Resource schema
export const apiResourceSchema = z.object({
	id: z.number(),
	name: z.string(),
	singularName: z.string(),
	shortNames: z.string(),
	kind: z.string(),
	group: z.string(),
	version: z.string(),
	apiVersion: z.string(),
	namespaced: z.string(),
	categories: z.string(),
	verbs: z.string(),
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

// Namespaced badge helper
function getNamespacedBadge(namespaced: string) {
	if (namespaced === "Yes") {
		return (
			<Badge variant="outline" className="text-blue-600 border-border bg-transparent px-1.5">
				<IconCircleCheckFilled className="size-3 fill-blue-600 mr-1" />
				{namespaced}
			</Badge>
		)
	} else {
		return (
			<Badge variant="outline" className="text-gray-600 border-border bg-transparent px-1.5">
				{namespaced}
			</Badge>
		)
	}
}

// Column definitions for API resources table
const createColumns = (
	onViewDetails: (apiResource: z.infer<typeof apiResourceSchema>) => void
): ColumnDef<z.infer<typeof apiResourceSchema>>[] => [
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
			accessorKey: "shortNames",
			header: "Short Names",
			cell: ({ row }) => (
				<div className="font-mono text-sm">
					{row.original.shortNames || '<none>'}
				</div>
			),
		},
		{
			accessorKey: "kind",
			header: "Kind",
			cell: ({ row }) => (
				<Badge variant="outline" className="text-muted-foreground px-1.5">
					{row.original.kind}
				</Badge>
			),
		},
		{
			accessorKey: "group",
			header: "Group",
			cell: ({ row }) => (
				<div className="text-sm">{row.original.group}</div>
			),
		},
		{
			accessorKey: "version",
			header: "Version",
			cell: ({ row }) => (
				<div className="font-mono text-sm">{row.original.version}</div>
			),
		},
		{
			accessorKey: "apiVersion",
			header: "API Version",
			cell: ({ row }) => (
				<div className="font-mono text-sm">{row.original.apiVersion}</div>
			),
		},
		{
			accessorKey: "namespaced",
			header: "Namespaced",
			cell: ({ row }) => getNamespacedBadge(row.original.namespaced),
		},
		{
			accessorKey: "categories",
			header: "Categories",
			cell: ({ row }) => (
				<div className="text-sm">
					{row.original.categories || '<none>'}
				</div>
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
							resourceKind="APIResource"
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
function DraggableRow({ row }: { row: Row<z.infer<typeof apiResourceSchema>> }) {
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

export function ApiResourcesDataTable() {
	const { data: apiResources, loading, error, refetch } = useAPIResources()

	const [sorting, setSorting] = React.useState<SortingState>([])
	const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
	const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({})
	const [rowSelection, setRowSelection] = React.useState({})
	const [globalFilter, setGlobalFilter] = React.useState("")
	const [statusFilter, setStatusFilter] = React.useState<string>("all")
	const [detailDrawerOpen, setDetailDrawerOpen] = React.useState(false)
	const [selectedAPIResourceForDetails, setSelectedAPIResourceForDetails] = React.useState<z.infer<typeof apiResourceSchema> | null>(null)

	// Handle opening detail drawer
	const handleViewDetails = React.useCallback((apiResource: z.infer<typeof apiResourceSchema>) => {
		setSelectedAPIResourceForDetails(apiResource)
		setDetailDrawerOpen(true)
	}, [])

	// Create columns with the onViewDetails callback
	const columns = React.useMemo(
		() => createColumns(handleViewDetails),
		[handleViewDetails]
	)

	// Filter options for API resources (namespaced vs cluster-scoped)
	const resourceScopes: FilterOption[] = React.useMemo(() => {
		const scopes = new Set(apiResources.map(resource => resource.namespaced))
		return Array.from(scopes).sort().map(scope => ({
			value: scope,
			label: scope === "Yes" ? "Namespaced" : "Cluster-scoped",
			badge: getNamespacedBadge(scope)
		}))
	}, [apiResources])

	// Filter data based on global filter and scope filter
	const filteredData = React.useMemo(() => {
		let filtered = apiResources

		// Apply scope filter (namespaced vs cluster-scoped)
		if (statusFilter !== "all") {
			filtered = filtered.filter(resource => resource.namespaced === statusFilter)
		}

		// Apply global filter (search)
		if (globalFilter) {
			const searchTerm = globalFilter.toLowerCase()
			filtered = filtered.filter(resource =>
				resource.name.toLowerCase().includes(searchTerm) ||
				resource.singularName.toLowerCase().includes(searchTerm) ||
				resource.kind.toLowerCase().includes(searchTerm) ||
				resource.group.toLowerCase().includes(searchTerm) ||
				resource.version.toLowerCase().includes(searchTerm) ||
				resource.apiVersion.toLowerCase().includes(searchTerm) ||
				resource.categories.toLowerCase().includes(searchTerm) ||
				(resource.shortNames && resource.shortNames.toLowerCase().includes(searchTerm))
			)
		}

		return filtered
	}, [apiResources, statusFilter, globalFilter])

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

	// Bulk actions for API resources
	const apiResourceBulkActions: BulkAction[] = React.useMemo(() => [
		{
			id: "export-yaml",
			label: "Export Selected as YAML",
			icon: <IconDownload className="size-4" />,
			action: () => {
				const selectedResources = table.getFilteredSelectedRowModel().rows.map(row => row.original)
				console.log('Export YAML for API resources:', selectedResources.map(r => r.name))
				// TODO: Implement bulk YAML export
			},
			requiresSelection: true,
		},
		{
			id: "copy-names",
			label: "Copy Resource Names",
			icon: <IconCopy className="size-4" />,
			action: () => {
				const selectedResources = table.getFilteredSelectedRowModel().rows.map(row => row.original)
				const names = selectedResources.map(r => r.name).join('\n')
				navigator.clipboard.writeText(names)
				console.log('Copied API resource names:', names)
			},
			requiresSelection: true,
		},
		{
			id: "copy-kinds",
			label: "Copy Resource Kinds",
			icon: <IconDatabase className="size-4" />,
			action: () => {
				const selectedResources = table.getFilteredSelectedRowModel().rows.map(row => row.original)
				const kinds = selectedResources.map(r => r.kind).join('\n')
				navigator.clipboard.writeText(kinds)
				console.log('Copied API resource kinds:', kinds)
			},
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
		apiResources.map((resource) => resource.id)
	)

	React.useEffect(() => {
		setSortableIds(apiResources.map((resource) => resource.id))
	}, [apiResources])

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
					<span className="ml-2">Loading API resources...</span>
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
					searchPlaceholder="Search API resources by name, kind, group, version, or categories... (Press '/' to focus)"
					categoryFilter={statusFilter}
					onCategoryFilterChange={setStatusFilter}
					categoryLabel="Filter by scope"
					categoryOptions={resourceScopes}
					selectedCount={table.getFilteredSelectedRowModel().rows.length}
					totalCount={table.getFilteredRowModel().rows.length}
					bulkActions={apiResourceBulkActions}
					bulkActionsLabel="Actions"
					table={table}
					showColumnToggle={true}
					onRefresh={refetch}
					isRefreshing={loading}
				/>

				{/* Data table */}
				<div className="overflow-hidden rounded-lg border">
					<ScrollArea className="max-h-[600px] w-full">
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
													No API resources found.
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

			{/* Controlled detail drawer for full API resource details */}
			{selectedAPIResourceForDetails && (
				<ApiResourceDetailDrawer
					item={selectedAPIResourceForDetails}
					open={detailDrawerOpen}
					onOpenChange={(open) => {
						setDetailDrawerOpen(open)
						if (!open) {
							setSelectedAPIResourceForDetails(null)
						}
					}}
				/>
			)}
		</div>
	)
}

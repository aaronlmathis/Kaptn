"use client"

import React from "react"
import {
	closestCenter,
	DndContext,
	KeyboardSensor,
	MouseSensor,
	TouchSensor,
	useSensor,
	useSensors,
	type DragEndEvent,
} from "@dnd-kit/core"
import { restrictToVerticalAxis } from "@dnd-kit/modifiers"
import {
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
	IconEye,
	IconCopy,
	IconAlertCircle,
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
import { EventDetailDrawer } from "@/components/viewers/EventDetailDrawer"
import { DataTableFilters, type FilterOption, type BulkAction } from "@/components/ui/data-table-filters"
import { useEventsWithWebSocket } from "@/hooks/useEventsWithWebSocket"
import { useNamespace } from "@/contexts/namespace-context"
import { z } from "zod"

// Event schema for TypeScript types
const eventSchema = z.object({
	id: z.number(),
	name: z.string(),
	namespace: z.string(),
	type: z.string(),
	reason: z.string(),
	message: z.string(),
	involvedObject: z.string(),
	source: z.string(),
	count: z.number(),
	age: z.string(),
	level: z.string(),
})

type Event = z.infer<typeof eventSchema>

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

// Event level badge helper
function getEventLevelBadge(level: string, type: string) {
	switch (level) {
		case "Warning":
			return (
				<Badge variant="outline" className="text-orange-600 border-border bg-transparent px-1.5">
					<IconAlertTriangle className="size-3 fill-orange-600 mr-1" />
					{type}
				</Badge>
			)
		case "Error":
			return (
				<Badge variant="outline" className="text-red-600 border-border bg-transparent px-1.5">
					<IconAlertCircle className="size-3 fill-red-600 mr-1" />
					{type}
				</Badge>
			)
		case "Info":
		case "Normal":
		default:
			return (
				<Badge variant="outline" className="text-blue-600 border-border bg-transparent px-1.5">
					<IconInfoCircle className="size-3 fill-blue-600 mr-1" />
					{type}
				</Badge>
			)
	}
}

// Column definitions for events table
const createColumns = (
	onViewDetails: (event: Event) => void
): ColumnDef<Event>[] => [
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
			header: "Event Name",
			cell: ({ row }) => {
				return (
					<button
						onClick={() => onViewDetails(row.original)}
						className="text-left hover:underline focus:underline focus:outline-none"
					>
						<div className="max-w-[200px] truncate">{row.original.name}</div>
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
			cell: ({ row }) => getEventLevelBadge(row.original.level, row.original.type),
		},
		{
			accessorKey: "reason",
			header: "Reason",
			cell: ({ row }) => (
				<div className="font-medium text-sm max-w-[120px] truncate" title={row.original.reason}>
					{row.original.reason}
				</div>
			),
		},
		{
			accessorKey: "message",
			header: "Message",
			cell: ({ row }) => (
				<div className="text-sm max-w-[200px] truncate" title={row.original.message}>
					{row.original.message}
				</div>
			),
		},
		{
			accessorKey: "involvedObject",
			header: "Object",
			cell: ({ row }) => (
				<div className="text-sm max-w-[150px] truncate" title={row.original.involvedObject}>
					{row.original.involvedObject}
				</div>
			),
		},
		{
			accessorKey: "source",
			header: "Source",
			cell: ({ row }) => (
				<div className="text-sm max-w-[120px] truncate" title={row.original.source}>
					{row.original.source}
				</div>
			),
		},
		{
			accessorKey: "count",
			header: "Count",
			cell: ({ row }) => (
				<div className="font-mono text-sm text-center">
					{row.original.count > 1 ? (
						<Badge variant="outline" className="text-orange-600 border-orange-600">
							{row.original.count}
						</Badge>
					) : (
						<span>{row.original.count}</span>
					)}
				</div>
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
						<DropdownMenuSeparator />
						<DropdownMenuItem onClick={() => {
							// Copy event details to clipboard
							const eventData = `Event: ${row.original.name}\nNamespace: ${row.original.namespace}\nType: ${row.original.type}\nReason: ${row.original.reason}\nMessage: ${row.original.message}\nObject: ${row.original.involvedObject}\nSource: ${row.original.source}\nCount: ${row.original.count}\nAge: ${row.original.age}`;
							navigator.clipboard.writeText(eventData);
						}}>
							<IconCopy className="size-4 mr-2" />
							Copy Details
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			),
		},
	]// Draggable row component
function DraggableRow({ row }: { row: Row<Event> }) {
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
			className={isDragging ? "opacity-50" : ""}
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

export function EventsDataTable() {
	const { selectedNamespace } = useNamespace()
	const {
		data: events,
		loading: isLoading,
		error,
		refetch: refresh,
		isConnected: wsConnected
	} = useEventsWithWebSocket(true)

	const [sorting, setSorting] = React.useState<SortingState>([])
	const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
	const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({})
	const [rowSelection, setRowSelection] = React.useState({})
	const [selectedEvent, setSelectedEvent] = React.useState<Event | null>(null)
	const [isDetailDrawerOpen, setIsDetailDrawerOpen] = React.useState(false)

	const columns = React.useMemo(
		() => createColumns((event) => {
			setSelectedEvent(event)
			setIsDetailDrawerOpen(true)
		}),
		[]
	)

	const table = useReactTable({
		data: events || [],
		columns,
		state: {
			sorting,
			columnVisibility,
			rowSelection,
			columnFilters,
		},
		enableRowSelection: true,
		onRowSelectionChange: setRowSelection,
		onSortingChange: setSorting,
		onColumnFiltersChange: setColumnFilters,
		onColumnVisibilityChange: setColumnVisibility,
		getCoreRowModel: getCoreRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getFacetedRowModel: getFacetedRowModel(),
		getFacetedUniqueValues: getFacetedUniqueValues(),
	})

	const sensors = useSensors(
		useSensor(MouseSensor, {}),
		useSensor(TouchSensor, {}),
		useSensor(KeyboardSensor, {})
	)

	function handleDragEnd(event: DragEndEvent) {
		const { active, over } = event
		if (active.id !== over?.id) {
			// TODO: Implement row reordering logic if needed
		}
	}

	// Filter options for the data table
	const typeOptions: FilterOption[] = [
		{ label: "Normal", value: "Normal" },
		{ label: "Warning", value: "Warning" },
		{ label: "Error", value: "Error" },
	]

	const reasonOptions: FilterOption[] = React.useMemo(() => {
		const uniqueReasons = Array.from(new Set(events?.map(e => e.reason) || []))
		return uniqueReasons.map(reason => ({ label: reason, value: reason }))
	}, [events])

	const sourceOptions: FilterOption[] = React.useMemo(() => {
		const uniqueSources = Array.from(new Set(events?.map(e => e.source) || []))
		return uniqueSources.map(source => ({ label: source, value: source }))
	}, [events])

	// Bulk actions for selected events
	const bulkActions: BulkAction[] = [
		{
			id: "copy-selected",
			label: "Copy Selected",
			icon: <IconCopy className="size-4" />,
			action: () => {
				const selectedRows = table.getFilteredSelectedRowModel().rows;
				const eventDetails = selectedRows.map((row: Row<Event>) =>
					`Event: ${row.original.name}\nNamespace: ${row.original.namespace}\nType: ${row.original.type}\nReason: ${row.original.reason}\nMessage: ${row.original.message}`
				).join('\n\n---\n\n');
				navigator.clipboard.writeText(eventDetails);
			},
			requiresSelection: true,
		},
	]

	if (error) {
		return (
			<div className="flex flex-col items-center justify-center p-8 text-center">
				<IconAlertTriangle className="size-12 text-red-500 mb-4" />
				<h3 className="text-lg font-semibold mb-2">Error Loading Events</h3>
				<p className="text-muted-foreground mb-4">{error}</p>
				<Button onClick={refresh}>
					<IconRefresh className="size-4 mr-2" />
					Try Again
				</Button>
			</div>
		)
	}

	return (
		<div className="px-4 lg:px-6">
			<div className="space-y-4">
				<DataTableFilters
					globalFilter={table.getState().globalFilter ?? ""}
					onGlobalFilterChange={table.setGlobalFilter}
					searchPlaceholder="Search events..."
					selectedCount={table.getFilteredSelectedRowModel().rows.length}
					totalCount={table.getFilteredRowModel().rows.length}
					bulkActions={bulkActions}
					table={table}
					showColumnToggle={true}
					onRefresh={refresh}
					isRefreshing={isLoading}
				/>

				{/* Data table */}
				<div className="overflow-hidden rounded-lg border">
					<ScrollArea className="w-full">
						<DndContext
							sensors={sensors}
							collisionDetection={closestCenter}
							modifiers={[restrictToVerticalAxis]}
							onDragEnd={handleDragEnd}
						>
							<Table>
								<TableHeader className="bg-muted sticky top-0 z-10">
									{table.getHeaderGroups().map((headerGroup) => (
										<TableRow key={headerGroup.id}>
											{headerGroup.headers.map((header) => (
												<TableHead key={header.id}>
													{header.isPlaceholder
														? null
														: flexRender(
															header.column.columnDef.header,
															header.getContext()
														)}
												</TableHead>
											))}
										</TableRow>
									))}
								</TableHeader>
								<TableBody>
									{isLoading ? (
										<TableRow>
											<TableCell
												colSpan={columns.length}
												className="h-24 text-center"
											>
												<div className="flex items-center justify-center">
													<IconLoader className="size-6 animate-spin mr-2" />
													Loading events...
												</div>
											</TableCell>
										</TableRow>
									) : table.getRowModel().rows?.length ? (
										<SortableContext
											items={table.getRowModel().rows.map((row) => row.original.id)}
											strategy={verticalListSortingStrategy}
										>
											{table.getRowModel().rows.map((row) => (
												<DraggableRow key={row.id} row={row} />
											))}
										</SortableContext>
									) : (
										<TableRow>
											<TableCell
												colSpan={columns.length}
												className="h-24 text-center"
											>
												No events found.
											</TableCell>
										</TableRow>
									)}
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

			{/* Event Detail Drawer */}
			<EventDetailDrawer
				event={selectedEvent}
				open={isDetailDrawerOpen}
				onOpenChange={setIsDetailDrawerOpen}
			/>
		</div>
	)
}

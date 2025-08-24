/* ---------------------------------------------
 * components/ui/UniversalDataTable.tsx
 * --------------------------------------------- */

"use client"

import * as React from "react"
import {
	DndContext,
	closestCenter,
	KeyboardSensor,
	MouseSensor,
	TouchSensor,
	useSensor,
	useSensors,
	type DragEndEvent,
	type UniqueIdentifier,
} from "@dnd-kit/core"
import { restrictToVerticalAxis } from "@dnd-kit/modifiers"
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

import {
	useReactTable,
	getCoreRowModel,
	getSortedRowModel,
	getFilteredRowModel,
	getPaginationRowModel,
	getFacetedRowModel,
	getFacetedUniqueValues,
	flexRender,
	type ColumnDef,
	type VisibilityState,
	type SortingState,
	type ColumnFiltersState,
	type Row,
} from "@/lib/table"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"

import {
	IconChevronLeft,
	IconChevronRight,
	IconChevronsLeft,
	IconChevronsRight,
	IconGripVertical,
	IconLoader,
	IconAlertTriangle,
} from "@tabler/icons-react"

export type BulkAction<TData> = {
	id: string
	label: string
	icon?: React.ReactNode
	variant?: "default" | "destructive" | "secondary" | "outline" | "ghost"
	requiresSelection?: boolean
	action: (rows: TData[]) => void | Promise<void>
}

type RenderFilters<TData> = (args: {
	table: ReturnType<typeof useReactTable<TData>>
	selectedCount: number
	totalCount: number
}) => React.ReactNode

type RenderRowActions<TData> = (args: { row: Row<TData> }) => React.ReactNode

type EmptyStateRenderer = () => React.ReactNode

type DetailRenderer<TData> = (args: {
	item: TData
	open: boolean
	onOpenChange: (open: boolean) => void
}) => React.ReactNode

export type UniversalDataTableProps<TData> = {
	data: TData[]
	columns: ColumnDef<TData, unknown>[]

	// Identity & DnD
	getRowId?: (original: TData, index: number) => UniqueIdentifier
	enableReorder?: boolean

	// Selection
	enableRowSelection?: boolean

	// States
	loading?: boolean
	error?: string | null
	onRefresh?: () => void
	isRefreshing?: boolean

	// External header/filters (e.g., your DataTableFilters)
	renderFilters?: RenderFilters<TData>

	// Bulk actions (resource-specific)
	bulkActions?: BulkAction<TData>[]

	// Row action menu (resource-specific)
	renderRowActions?: RenderRowActions<TData>

	// Row click (e.g., open details)
	onRowClick?: (row: TData) => void

	// Optional detail drawer controlled by the table
	renderDetailDrawer?: DetailRenderer<TData>

	// Empty state renderer
	renderEmptyState?: EmptyStateRenderer

	// Table initial state
	initialPageSize?: number
	initialSorting?: SortingState
	initialColumnVisibility?: VisibilityState

	// ClassNames
	className?: string
}

function DragHandle({ id }: { id: UniqueIdentifier }) {
	const { attributes, listeners } = useSortable({ id })
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

function DraggableRow<TData>({ row, onRowClick }: { row: Row<TData>, onRowClick?: (data: TData) => void }) {
	const { transform, transition, setNodeRef, isDragging } = useSortable({
		id: (row.original as any).__uid as UniqueIdentifier,
	})

	const style: React.CSSProperties = {
		transform: CSS.Transform.toString(transform),
		transition,
	}

	return (
		<TableRow
			ref={setNodeRef}
			style={style}
			data-state={row.getIsSelected() && "selected"}
			className={isDragging ? "opacity-50" : ""}
			onDoubleClick={() => onRowClick?.(row.original)}
		>
			{row.getVisibleCells().map((cell) => (
				<TableCell key={cell.id} className="align-middle">
					{flexRender(cell.column.columnDef.cell, cell.getContext())}
				</TableCell>
			))}
		</TableRow>
	)
}

export function UniversalDataTable<TData>(props: UniversalDataTableProps<TData>) {
	const {
		data,
		columns,
		getRowId,
		enableReorder = false,
		enableRowSelection = true,
		loading,
		error,
		onRefresh,
		isRefreshing,
		renderFilters,
		bulkActions = [],
		renderRowActions,
		onRowClick,
		renderDetailDrawer,
		renderEmptyState,
		initialPageSize = 20,
		initialSorting = [],
		initialColumnVisibility = {},
		className,
	} = props

	// attach stable uid for DnD
	const rowsWithId = React.useMemo(() => {
		return data.map((item, idx) => ({
			...item,
			__uid: getRowId ? getRowId(item, idx) : (idx as unknown as UniqueIdentifier),
		}))
	}, [data, getRowId])

	const [sorting, setSorting] = React.useState<SortingState>(initialSorting)
	const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
	const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>(initialColumnVisibility)
	const [rowSelection, setRowSelection] = React.useState({})
	const [detailOpen, setDetailOpen] = React.useState(false)
	const [selectedItem, setSelectedItem] = React.useState<TData | null>(null)

	const table = useReactTable({
		data: rowsWithId as unknown as TData[],
		columns: React.useMemo(() => {
			// Check if columns already include drag/select/actions columns
			const hasSelectColumn = columns.some(col => col.id === 'select' || col.id === '__select')
			const hasDragColumn = columns.some(col => col.id === 'drag' || col.id === '__drag')
			const hasActionsColumn = columns.some(col => col.id === 'actions' || col.id === '__actions')

			const base: ColumnDef<TData, unknown>[] = []

			// Reorder handle column (only add if not already present)
			if (enableReorder && !hasDragColumn) {
				base.push({
					id: "__drag",
					header: () => null,
					cell: ({ row }) => <DragHandle id={(row.original as any).__uid} />,
					enableSorting: false,
					enableHiding: false,
				})
			}

			// Selection column (only add if not already present)
			if (enableRowSelection && !hasSelectColumn) {
				base.push({
					id: "__select",
					header: ({ table }) => (
						<div className="flex items-center justify-center">
							<Checkbox
								checked={
									table.getIsAllPageRowsSelected() ||
									(table.getIsSomePageRowsSelected() && "indeterminate")
								}
								onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
								aria-label="Select all"
							/>
						</div>
					),
					cell: ({ row }) => (
						<div className="flex items-center justify-center">
							<Checkbox
								checked={row.getIsSelected()}
								onCheckedChange={(v) => row.toggleSelected(!!v)}
								aria-label="Select row"
							/>
						</div>
					),
					enableSorting: false,
					enableHiding: false,
				})
			}

			// User columns
			base.push(...columns)

			// Row actions column (only add if not already present and renderRowActions is provided)
			if (renderRowActions && !hasActionsColumn) {
				base.push({
					id: "__actions",
					header: () => null,
					cell: ({ row }) => renderRowActions({ row }),
					enableSorting: false,
					enableHiding: false,
				})
			}

			return base

		}, [columns, enableReorder, enableRowSelection, renderRowActions]),

		onSortingChange: setSorting,
		onColumnFiltersChange: setColumnFilters,
		onColumnVisibilityChange: setColumnVisibility,
		onRowSelectionChange: setRowSelection,

		getCoreRowModel: getCoreRowModel(),
		getFacetedRowModel: getFacetedRowModel(),
		getFacetedUniqueValues: getFacetedUniqueValues(),
		getFilteredRowModel: getFilteredRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getPaginationRowModel: getPaginationRowModel(),

		initialState: {
			pagination: { pageSize: initialPageSize },
		},

		state: {
			sorting,
			columnFilters,
			columnVisibility,
			rowSelection,
		},
	})

	// Bulk actions trigger
	const runBulk = async (action: BulkAction<TData>) => {
		const selected = table.getFilteredSelectedRowModel().rows.map((r) => r.original)
		await action.action(selected)
	}

	// DnD
	const sensors = useSensors(
		useSensor(MouseSensor, {}),
		useSensor(TouchSensor, {}),
		useSensor(KeyboardSensor, {})
	)

	// Use the table's actual data for sortable IDs, not the original rowsWithId
	const [sortableIds, setSortableIds] = React.useState<UniqueIdentifier[]>([])

	React.useEffect(() => {
		// Use the current table data for sortable IDs
		const ids = table.getRowModel().rows.map((row) => (row.original as any).__uid as UniqueIdentifier)
		setSortableIds(ids)
	}, [table.getRowModel().rows])

	function handleDragEnd(e: DragEndEvent) {
		const { active, over } = e
		if (!over || active.id === over.id) return

		// Find the actual data items to reorder
		const rows = table.getRowModel().rows
		const activeIndex = rows.findIndex(row => (row.original as any).__uid === active.id)
		const overIndex = rows.findIndex(row => (row.original as any).__uid === over.id)

		if (activeIndex !== -1 && overIndex !== -1) {
			setSortableIds((ids) => {
				const oldIndex = ids.indexOf(active.id)
				const newIndex = ids.indexOf(over.id)
				return arrayMove(ids, oldIndex, newIndex)
			})

			// TODO: Call a callback to update the parent component's data order
			// This would need to be passed as a prop if the parent wants to persist the order
		}
	}

	// Detail drawer orchestration
	const openDetails = (item: TData) => {
		setSelectedItem(item)
		setDetailOpen(true)
	}

	// Loading / Error states
	if (loading) {
		return (
			<div className="px-4 lg:px-6">
				<div className="flex items-center justify-center py-10">
					<IconLoader className="size-6 animate-spin" />
					<span className="ml-2">Loading…</span>
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

	const selectedCount = table.getFilteredSelectedRowModel().rows.length
	const totalCount = table.getFilteredRowModel().rows.length

	return (
		<div className={["", className].filter(Boolean).join(" ")}>
			<div className="space-y-4">
				{/* Filters / header (plug your DataTableFilters here) */}
				{renderFilters?.({ table, selectedCount, totalCount })}

				{/* Data table */}
				<div className="overflow-hidden rounded-lg border">
					<ScrollArea className="w-full">
						{enableReorder ? (
							<DndContext
								collisionDetection={closestCenter}
								modifiers={[restrictToVerticalAxis]}
								onDragEnd={handleDragEnd}
								sensors={sensors}
							>
								<Table>
									<TableHeader className="bg-muted sticky top-0 z-10">
										{table.getHeaderGroups().map((hg) => (
											<TableRow key={hg.id}>
												{hg.headers.map((h) => (
													<TableHead key={h.id} className="text-left">
														{h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
													</TableHead>
												))}
											</TableRow>
										))}
									</TableHeader>
									<TableBody>
										<SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
											{table.getRowModel().rows.length ? (
												table.getRowModel().rows.map((row) => (
													<DraggableRow
														key={(row.original as any).__uid as UniqueIdentifier}
														row={row}
														onRowClick={onRowClick ?? openDetails}
													/>
												))
											) : (
												<TableRow>
													<TableCell colSpan={table.getAllColumns().length} className="h-24 text-center">
														{renderEmptyState ? renderEmptyState() : "No data found."}
													</TableCell>
												</TableRow>
											)}
										</SortableContext>
									</TableBody>
								</Table>
							</DndContext>
						) : (
							<Table>
								<TableHeader className="bg-muted sticky top-0 z-10">
									{table.getHeaderGroups().map((hg) => (
										<TableRow key={hg.id}>
											{hg.headers.map((h) => (
												<TableHead key={h.id} className="text-left">
													{h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
												</TableHead>
											))}
										</TableRow>
									))}
								</TableHeader>
								<TableBody>
									{table.getRowModel().rows.length ? (
										table.getRowModel().rows.map((row) => (
											<TableRow
												key={(row.original as any).__uid as UniqueIdentifier}
												data-state={row.getIsSelected() && "selected"}
												onDoubleClick={() => (onRowClick ?? openDetails)(row.original)}
											>
												{row.getVisibleCells().map((cell) => (
													<TableCell key={cell.id} className="align-middle">
														{flexRender(cell.column.columnDef.cell, cell.getContext())}
													</TableCell>
												))}
											</TableRow>
										))
									) : (
										<TableRow>
											<TableCell colSpan={table.getAllColumns().length} className="h-24 text-center">
												{renderEmptyState ? renderEmptyState() : "No data found."}
											</TableCell>
										</TableRow>
									)}
								</TableBody>
							</Table>
						)}
						<ScrollBar orientation="vertical" />
						<ScrollBar orientation="horizontal" />
					</ScrollArea>
				</div>

				{/* Footer / pagination */}
				<div className="flex flex-col gap-4 px-2 sm:flex-row sm:items-center sm:justify-between">
					<div className="text-sm text-muted-foreground">
						{selectedCount} of {totalCount} row(s) selected.
					</div>

					<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6 lg:gap-8">
						{/* Bulk actions (only show if no renderFilters provided, since filters handle bulk actions) */}
						{!renderFilters && (
							<div className="flex items-center gap-2">
								{bulkActions.map((a) => {
									const disabled = a.requiresSelection ? selectedCount === 0 : false
									return (
										<Button
											key={a.id}
											variant={a.variant ?? "outline"}
											size="sm"
											disabled={disabled}
											onClick={() => runBulk(a)}
										>
											{a.icon ? <span className="mr-2">{a.icon}</span> : null}
											{a.label}
										</Button>
									)
								})}
								{onRefresh && (
									<Button variant="outline" size="sm" onClick={onRefresh} disabled={!!isRefreshing}>
										{isRefreshing ? <IconLoader className="mr-2 size-4 animate-spin" /> : null}
										Refresh
									</Button>
								)}
							</div>
						)}

						{/* Pager */}
						<div className="flex items-center space-x-2">
							<p className="text-sm font-medium">Rows per page</p>
							<Select
								value={`${table.getState().pagination.pageSize}`}
								onValueChange={(value) => {
									table.setPageSize(Number(value))
								}}
							>
								<SelectTrigger className="h-8 w-[70px] bg-muted rounded border border-input bg-background px-3 py-1 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
									<SelectValue placeholder={table.getState().pagination.pageSize} />
								</SelectTrigger>
								<SelectContent side="top">
									{[10, 20, 30, 40, 50].map((pageSize) => (
										<SelectItem key={pageSize} value={`${pageSize}`}>
											{pageSize}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="flex items-center justify-between sm:justify-center sm:gap-6 lg:gap-8">
							<div className="flex w-[100px] items-center justify-center text-sm font-medium">
								Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
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

			{/* Optional detail drawer */}
			{renderDetailDrawer && selectedItem
				? renderDetailDrawer({
					item: selectedItem, open: detailOpen, onOpenChange: (o) => {
						setDetailOpen(o)
						if (!o) setSelectedItem(null)
					}
				})
				: null}
		</div>
	)
}

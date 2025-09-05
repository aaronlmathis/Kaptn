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
	IconPlayerPause,
	IconPlayerPlay,
	IconDownload,
	IconCopy,
	IconClock,
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
import { CronJobDetailDrawer } from "@/components/viewers/CronJobDetailDrawer"
import { ResourceYamlEditor } from "@/components/ResourceYamlEditor"
import { useCronJobsWithWebSocket } from "@/hooks/useCronJobsWithWebSocket"
import { useNamespace } from "@/contexts/namespace-context"
import { cronJobSchema } from "@/lib/schemas/cronjob"
import { z } from "zod"
import { IfAllowed } from "@/components/authz/IfAllowed"
import { useAuthzCapabilitiesInContext } from "@/hooks/useAuthzCapabilitiesSimple"
import { useCluster } from "@/hooks/useCluster"

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

// Status badge helper for CronJob
function getSuspendBadge(suspend: boolean) {
	if (suspend) {
		return (
			<Badge variant="outline" className="text-yellow-600 border-border bg-transparent px-1.5">
				<IconPlayerPause className="size-3 text-yellow-600 mr-1" />
				Suspended
			</Badge>
		)
	} else {
		return (
			<Badge variant="outline" className="text-green-600 border-border bg-transparent px-1.5">
				<IconPlayerPlay className="size-3 text-green-600 mr-1" />
				Active
			</Badge>
		)
	}
}

// Column definitions for cronjobs table
const createColumns = (
    onViewDetails: (cronJob: z.infer<typeof cronJobSchema>) => void,
    clusterId: string
): ColumnDef<z.infer<typeof cronJobSchema>>[] => [
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
        header: "CronJob Name",
        cell: ({ row }) => {
            return (
                <IfAllowed
                    feature="cronjobs.get"
                    cluster={clusterId}
                    namespace={row.original.namespace}
                    resourceName={row.original.name}
                    fallback={<span>{row.original.name}</span>}
                >
                    <button
                        onClick={() => onViewDetails(row.original)}
                        className="text-left hover:underline focus:underline focus:outline-none"
                    >
                        {row.original.name}
                    </button>
                </IfAllowed>
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
			accessorKey: "schedule",
			header: "Schedule",
			cell: ({ row }) => (
				<div className="font-mono text-sm">{row.original.schedule}</div>
			),
		},
		{
			accessorKey: "suspend",
			header: "Status",
			cell: ({ row }) => getSuspendBadge(row.original.suspend),
		},
		{
			accessorKey: "active",
			header: "Active",
			cell: ({ row }) => (
				<div className="font-mono text-sm">{row.original.active}</div>
			),
		},
		{
			accessorKey: "lastSchedule",
			header: "Last Schedule",
			cell: ({ row }) => (
				<div className="text-sm">{row.original.lastSchedule}</div>
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
				<div className="text-sm truncate max-w-32" title={row.original.image}>
					{row.original.image}
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
                    <IfAllowed feature="cronjobs.get" cluster={clusterId} namespace={row.original.namespace} resourceName={row.original.name}>
                        <DropdownMenuItem onClick={() => onViewDetails(row.original)}>
                            <IconEye className="size-4 mr-2" />
                            View Details
                        </DropdownMenuItem>
                    </IfAllowed>
                    <IfAllowed feature="cronjobs.patch" cluster={clusterId} namespace={row.original.namespace} resourceName={row.original.name}>
                        <ResourceYamlEditor resourceName={row.original.name} namespace={row.original.namespace} resourceKind="CronJob">
                            <button className="flex w-full items-center gap-2 px-2 py-1.5 text-sm hover:bg-accent rounded-sm cursor-pointer" style={{ background: 'transparent', border: 'none', textAlign: 'left' }}>
                                <IconEdit className="size-4" />
                                Edit YAML
                            </button>
                        </ResourceYamlEditor>
                    </IfAllowed>
                    <IfAllowed feature="cronjobs.patch" cluster={clusterId} namespace={row.original.namespace} resourceName={row.original.name} fallback={<DropdownMenuItem disabled>{row.original.suspend ? (<><IconPlayerPlay className="size-4 mr-2" />Resume</>) : (<><IconPlayerPause className="size-4 mr-2" />Suspend</>)}</DropdownMenuItem>}>
                        <DropdownMenuItem>
                            {row.original.suspend ? (
                                <>
                                    <IconPlayerPlay className="size-4 mr-2" />
                                    Resume
                                </>
                            ) : (
                                <>
                                    <IconPlayerPause className="size-4 mr-2" />
                                    Suspend
                                </>
                            )}
                        </DropdownMenuItem>
                    </IfAllowed>
                    <IfAllowed feature="jobs.create" cluster={clusterId} namespace={row.original.namespace} resourceName={row.original.name} fallback={<DropdownMenuItem disabled><IconRefresh className="size-4 mr-2" />Trigger Job</DropdownMenuItem>}>
                        <DropdownMenuItem>
                            <IconRefresh className="size-4 mr-2" />
                            Trigger Job
                        </DropdownMenuItem>
                    </IfAllowed>
                    <IfAllowed feature="cronjobs.get" cluster={clusterId} namespace={row.original.namespace} resourceName={row.original.name}>
                        <DropdownMenuItem onClick={() => { const cj = row.original; console.log('Export YAML for CronJob:', `${cj.name} in ${cj.namespace}`) }}>
                            <IconDownload className="size-4 mr-2" />
                            Export YAML
                        </DropdownMenuItem>
                    </IfAllowed>
                    <DropdownMenuSeparator />
                    <IfAllowed feature="cronjobs.delete" cluster={clusterId} namespace={row.original.namespace} resourceName={row.original.name} fallback={<DropdownMenuItem disabled className="text-muted-foreground"><IconTrash className="size-4 mr-2" />Delete</DropdownMenuItem>}>
                        <DropdownMenuItem className="text-red-600">
                            <IconTrash className="size-4 mr-2" />
                            Delete
                        </DropdownMenuItem>
                    </IfAllowed>
                </DropdownMenuContent>
            </DropdownMenu>
        ),
    },
	]

// Draggable row component
function DraggableRow({ row }: { row: Row<z.infer<typeof cronJobSchema>> }) {
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

export function CronJobsDataTable() {
    const { data: cronJobs, loading, error, refetch, isConnected } = useCronJobsWithWebSocket()
    const { selectedNamespace } = useNamespace()
    const { clusterId } = useCluster()

	const [sorting, setSorting] = React.useState<SortingState>([])
	const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
	const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({})
	const [rowSelection, setRowSelection] = React.useState({})
	const [globalFilter, setGlobalFilter] = React.useState("")
	const [statusFilter, setStatusFilter] = React.useState<string>("all")
	const [detailDrawerOpen, setDetailDrawerOpen] = React.useState(false)
	const [selectedCronJobForDetails, setSelectedCronJobForDetails] = React.useState<z.infer<typeof cronJobSchema> | null>(null)

	// Handle opening detail drawer
	const handleViewDetails = React.useCallback((cronJob: z.infer<typeof cronJobSchema>) => {
		setSelectedCronJobForDetails(cronJob)
		setDetailDrawerOpen(true)
	}, [])

	// Create columns with the onViewDetails callback
    const columns = React.useMemo(
        () => createColumns(handleViewDetails, clusterId),
        [handleViewDetails, clusterId]
    )

    // Capability-aware bulk actions (depends on table, so declare after table)

    // Create filter options for cronjobs based on suspend status
    const cronJobStatuses: FilterOption[] = React.useMemo(() => {
		const statuses = new Set<string>()
		cronJobs.forEach(cronJob => {
			// Create status based on suspend field
			if (cronJob.suspend) {
				statuses.add("Suspended")
			} else {
				statuses.add("Active")
			}
		})
		return Array.from(statuses).sort().map(status => ({
			value: status,
			label: status,
			badge: (
				<Badge variant="outline" className={status === "Active" ? "text-green-600 border-border bg-transparent px-1.5" : "text-yellow-600 border-border bg-transparent px-1.5"}>
					{status === "Active" ? <IconPlayerPlay className="size-3 mr-1" /> : <IconPlayerPause className="size-3 mr-1" />}
					{status}
				</Badge>
			)
		}))
	}, [cronJobs])

	// Filter data based on global filter and status filter
	const filteredData = React.useMemo(() => {
		let filtered = cronJobs

		// Apply category filter (status)
		if (statusFilter !== "all") {
			filtered = filtered.filter(cronJob => {
				// Determine status for this cronjob
				const status = cronJob.suspend ? "Suspended" : "Active"
				return status === statusFilter
			})
		}

		// Apply global filter (search)
		if (globalFilter) {
			const searchTerm = globalFilter.toLowerCase()
			filtered = filtered.filter(cronJob =>
				cronJob.name.toLowerCase().includes(searchTerm) ||
				cronJob.namespace.toLowerCase().includes(searchTerm) ||
				cronJob.schedule.toLowerCase().includes(searchTerm) ||
				cronJob.image.toLowerCase().includes(searchTerm) ||
				cronJob.age.toLowerCase().includes(searchTerm)
			)
		}

		return filtered
	}, [cronJobs, statusFilter, globalFilter])

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

    // Capability-aware bulk actions
    const { isAllowed } = useAuthzCapabilitiesInContext(['cronjobs.get','cronjobs.patch','cronjobs.delete','jobs.create'])

    const cronJobBulkActions: BulkAction[] = React.useMemo(() => {
        const actions: BulkAction[] = []
        if (isAllowed('cronjobs.get')) {
            actions.push({
                id: 'export-yaml',
                label: 'Export Selected as YAML',
                icon: <IconDownload className="size-4" />,
                action: () => {
                    const selected = table.getFilteredSelectedRowModel().rows.map(r => r.original)
                    console.log('Export YAML for CronJobs:', selected.map(cj => cj.name))
                },
                requiresSelection: true,
            })
        }
        actions.push({
            id: 'copy-names',
            label: 'Copy CronJob Names',
            icon: <IconCopy className="size-4" />,
            action: () => {
                const selected = table.getFilteredSelectedRowModel().rows.map(r => r.original)
                const names = selected.map(cj => cj.name).join('\n')
                navigator.clipboard.writeText(names)
            },
            requiresSelection: true,
        })
        if (isAllowed('cronjobs.patch')) {
            actions.push({
                id: 'resume-cronjobs',
                label: 'Resume Selected CronJobs',
                icon: <IconPlayerPlay className="size-4" />,
                action: () => {
                    const selected = table.getFilteredSelectedRowModel().rows.map(r => r.original)
                    console.log('Resume cronjobs:', selected.map(cj => `${cj.name} in ${cj.namespace}`))
                },
                requiresSelection: true,
            })
            actions.push({
                id: 'suspend-cronjobs',
                label: 'Suspend Selected CronJobs',
                icon: <IconPlayerPause className="size-4" />,
                action: () => {
                    const selected = table.getFilteredSelectedRowModel().rows.map(r => r.original)
                    console.log('Suspend cronjobs:', selected.map(cj => `${cj.name} in ${cj.namespace}`))
                },
                requiresSelection: true,
            })
        }
        if (isAllowed('jobs.create')) {
            actions.push({
                id: 'trigger-jobs',
                label: 'Trigger Jobs For Selected',
                icon: <IconRefresh className="size-4" />,
                action: () => {
                    const selected = table.getFilteredSelectedRowModel().rows.map(r => r.original)
                    console.log('Trigger jobs for cronjobs:', selected.map(cj => `${cj.name} in ${cj.namespace}`))
                },
                requiresSelection: true,
            })
        }
        if (isAllowed('cronjobs.delete')) {
            actions.push({
                id: 'delete-cronjobs',
                label: 'Delete Selected CronJobs',
                icon: <IconTrash className="size-4" />,
                action: () => {
                    const selected = table.getFilteredSelectedRowModel().rows.map(r => r.original)
                    console.log('Delete cronjobs:', selected.map(cj => `${cj.name} in ${cj.namespace}`))
                },
                variant: 'destructive' as const,
                requiresSelection: true,
            })
        }
        return actions
    }, [table, isAllowed])



	// Drag and drop setup
	const sensors = useSensors(
		useSensor(MouseSensor, {}),
		useSensor(TouchSensor, {}),
		useSensor(KeyboardSensor, {})
	)

	const [sortableIds, setSortableIds] = React.useState<UniqueIdentifier[]>(
		cronJobs.map((cronJob) => cronJob.id)
	)

	React.useEffect(() => {
		setSortableIds(cronJobs.map((cronJob) => cronJob.id))
	}, [cronJobs])

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

    if (loading && cronJobs.length === 0) {
        return (
            <div className="px-4 lg:px-6">
                <div className="flex items-center justify-center py-10">
                    <IconLoader className="size-6 animate-spin" />
                    <span className="ml-2">Loading cronjobs...</span>
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
					searchPlaceholder="Search cronjobs by name, namespace, schedule, image, or age... (Press '/' to focus)"
					categoryFilter={statusFilter}
					onCategoryFilterChange={setStatusFilter}
					categoryLabel="Filter by status"
					categoryOptions={cronJobStatuses}
					selectedCount={table.getFilteredSelectedRowModel().rows.length}
                    totalCount={table.getFilteredRowModel().rows.length}
                    bulkActions={cronJobBulkActions}
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
													No cronjobs found in {selectedNamespace === 'all' ? 'any namespace' : `namespace "${selectedNamespace}"`}.
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

			{/* Controlled detail drawer for full cronjob details */}
			{selectedCronJobForDetails && (
				<CronJobDetailDrawer
					item={selectedCronJobForDetails}
					open={detailDrawerOpen}
					onOpenChange={(open: boolean) => {
						setDetailDrawerOpen(open)
						if (!open) {
							setSelectedCronJobForDetails(null)
						}
					}}
				/>
			)}
		</div>
	)
}

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
	IconChevronDown,
	IconChevronLeft,
	IconChevronRight,
	IconChevronsLeft,
	IconChevronsRight,
	IconDotsVertical,
	IconGripVertical,
	IconLayoutColumns,
	IconLoader,
	IconAlertTriangle,
	IconRefresh,
	IconTrash,
	IconEdit,
	IconEye,
	IconCopy,
	IconShieldLock,
	IconPlus,
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
import { Input } from "@/components/ui/input"
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { SecretDetailDrawer } from "@/components/secrets/SecretDetailDrawer"
import { SecretFormDrawer } from "@/components/secrets/SecretFormDrawer"
import { ResourceYamlEditor } from "@/components/ResourceYamlEditor"
import { useSecretsWithWebSocket } from "@/hooks/useSecretsWithWebSocket"
import { type DashboardSecret, deleteSecret } from "@/lib/k8s-storage"
import { toast } from "sonner"
import { useNamespace } from "@/contexts/namespace-context"

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

// Helper function to copy text to clipboard
const copyToClipboard = async (text: string) => {
	try {
		await navigator.clipboard.writeText(text)
	} catch (err) {
		console.error('Failed to copy text: ', err)
	}
}

// Helper function to get secret type badge
function getSecretTypeBadge(type: string) {
	switch (type.toLowerCase()) {
		case 'opaque':
			return <Badge variant="secondary" className="text-xs">Opaque</Badge>
		case 'kubernetes.io/tls':
			return <Badge variant="outline" className="text-xs bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800">TLS</Badge>
		case 'kubernetes.io/dockerconfigjson':
			return <Badge variant="outline" className="text-xs bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800">Docker</Badge>
		case 'kubernetes.io/service-account-token':
			return <Badge variant="outline" className="text-xs bg-purple-50 dark:bg-purple-950/20 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-800">ServiceAccount</Badge>
		case 'kubernetes.io/basic-auth':
			return <Badge variant="outline" className="text-xs bg-orange-50 dark:bg-orange-950/20 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-800">BasicAuth</Badge>
		case 'kubernetes.io/ssh-auth':
			return <Badge variant="outline" className="text-xs bg-indigo-50 dark:bg-indigo-950/20 text-indigo-700 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800">SSH</Badge>
		default:
			return <Badge variant="outline" className="text-xs">{type}</Badge>
	}
}

// Column definitions for secrets table
const createColumns = (
	onViewDetails: (secret: DashboardSecret) => void,
	onEditSecret: (secret: DashboardSecret) => void,
	onDeleteSecret: (secret: DashboardSecret) => void
): ColumnDef<DashboardSecret>[] => [
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
					<div className="flex items-center gap-2">
						<button
							onClick={() => onViewDetails(row.original)}
							className="text-left hover:underline focus:underline focus:outline-none font-mono text-sm"
						>
							{row.original.name}
						</button>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant="ghost"
									size="icon"
									className="size-6 text-muted-foreground hover:text-foreground"
									onClick={() => copyToClipboard(row.original.name)}
								>
									<IconCopy className="size-3" />
								</Button>
							</TooltipTrigger>
							<TooltipContent>Copy name</TooltipContent>
						</Tooltip>
					</div>
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
			cell: ({ row }) => getSecretTypeBadge(row.original.type),
		},
		{
			accessorKey: "keysCount",
			header: "Keys",
			cell: ({ row }) => (
				<div className="flex items-center gap-2">
					<div className="font-mono text-sm">{row.original.keysCount}</div>
					{row.original.keys.length > 0 && (
						<div className="flex gap-1 max-w-32 overflow-hidden">
							{row.original.keys.slice(0, 2).map((key: string, index: number) => (
								<Badge key={index} variant="outline" className="text-xs text-muted-foreground">
									{key.length > 10 ? `${key.slice(0, 10)}...` : key}
								</Badge>
							))}
							{row.original.keys.length > 2 && (
								<Badge variant="outline" className="text-xs text-muted-foreground">
									+{row.original.keys.length - 2}
								</Badge>
							)}
						</div>
					)}
				</div>
			),
		},
		{
			accessorKey: "dataSize",
			header: "Size",
			cell: ({ row }) => (
				<div className="font-mono text-sm">{row.original.dataSize}</div>
			),
		},
		{
			accessorKey: "age",
			header: "Age",
			cell: ({ row }) => (
				<Tooltip>
					<TooltipTrigger>
						<div className="font-mono text-sm">{row.original.age}</div>
					</TooltipTrigger>
					<TooltipContent>
						Created {row.original.age} ago
					</TooltipContent>
				</Tooltip>
			),
		},
		{
			accessorKey: "labelsCount",
			header: "Labels",
			cell: ({ row }) => (
				<div className="flex items-center gap-1">
					<div className="font-mono text-sm">{row.original.labelsCount}</div>
					{row.original.labelsCount > 0 && (
						<Badge variant="outline" className="text-xs text-blue-600">
							{row.original.labelsCount}
						</Badge>
					)}
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
						<DropdownMenuItem
							onClick={() => onEditSecret(row.original)}
						>
							<IconEdit className="size-4 mr-2" />
							Edit Secret
						</DropdownMenuItem>
						<ResourceYamlEditor
							resourceName={row.original.name}
							namespace={row.original.namespace}
							resourceKind="Secret"
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
						<AlertDialog>
							<AlertDialogTrigger asChild>
								<DropdownMenuItem className="text-red-600" onSelect={(e) => e.preventDefault()}>
									<IconTrash className="size-4 mr-2" />
									Delete
								</DropdownMenuItem>
							</AlertDialogTrigger>
							<AlertDialogContent>
								<AlertDialogHeader>
									<AlertDialogTitle>Delete Secret</AlertDialogTitle>
									<AlertDialogDescription>
										Are you sure you want to delete the secret "{row.original.name}" in namespace "{row.original.namespace}"? 
										This action cannot be undone and will permanently remove the secret and all its data.
									</AlertDialogDescription>
								</AlertDialogHeader>
								<AlertDialogFooter>
									<AlertDialogCancel>Cancel</AlertDialogCancel>
									<AlertDialogAction 
										onClick={() => onDeleteSecret(row.original)}
										className="bg-red-600 hover:bg-red-700 text-white"
									>
										Delete Secret
									</AlertDialogAction>
								</AlertDialogFooter>
							</AlertDialogContent>
						</AlertDialog>
					</DropdownMenuContent>
				</DropdownMenu>
			),
		},
	]

// Draggable row component
function DraggableRow({ row }: { row: Row<DashboardSecret> }) {
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

export function SecretsDataTable() {
	const { data: secrets, loading, error, refetch, isConnected } = useSecretsWithWebSocket(true)
	const { selectedNamespace } = useNamespace()

	const [sorting, setSorting] = React.useState<SortingState>([])
	const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
	const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({})
	const [rowSelection, setRowSelection] = React.useState({})
	const [globalFilter, setGlobalFilter] = React.useState("")
	const [typeFilter, setTypeFilter] = React.useState<string>("all")

	// Drag and drop state
	const [sortableIds, setSortableIds] = React.useState<UniqueIdentifier[]>([])

	const sensors = useSensors(
		useSensor(MouseSensor, {
			activationConstraint: {
				distance: 10,
			},
		}),
		useSensor(TouchSensor),
		useSensor(KeyboardSensor)
	)

	// Detail drawer state
	const [detailDrawerOpen, setDetailDrawerOpen] = React.useState(false)
	const [selectedSecretForDetails, setSelectedSecretForDetails] = React.useState<DashboardSecret | null>(null)

	// Form drawer state
	const [formDrawerOpen, setFormDrawerOpen] = React.useState(false)
	const [selectedSecretForEdit, setSelectedSecretForEdit] = React.useState<DashboardSecret | null>(null)

	// Handle opening detail drawer
	const handleViewDetails = React.useCallback((secret: DashboardSecret) => {
		setSelectedSecretForDetails(secret)
		setDetailDrawerOpen(true)
	}, [])

	// Handle opening form drawer for new secret
	const handleNewSecret = React.useCallback(() => {
		setSelectedSecretForEdit(null)
		setFormDrawerOpen(true)
	}, [])

	// Handle single secret deletion
	const handleDeleteSecret = React.useCallback(async (secret: DashboardSecret) => {
		try {
			await deleteSecret(secret.namespace, secret.name)
			toast.success("Secret deleted", {
				description: `Secret "${secret.name}" has been deleted successfully`,
				duration: 3000,
			})
			refetch() // Refresh the data
		} catch (error) {
			toast.error("Failed to delete secret", {
				description: error instanceof Error ? error.message : "An unexpected error occurred",
				duration: 4000,
			})
		}
	}, [refetch])

	// Handle bulk deletion
	const handleBulkDelete = React.useCallback(async (tableInstance: any) => {
		const selectedRows = tableInstance.getFilteredSelectedRowModel().rows
		const secretsToDelete = selectedRows.map((row: any) => row.original)
		
		try {
			// Delete all selected secrets
			await Promise.all(
				secretsToDelete.map((secret: DashboardSecret) => deleteSecret(secret.namespace, secret.name))
			)
			
			toast.success("Secrets deleted", {
				description: `${secretsToDelete.length} secret(s) have been deleted successfully`,
				duration: 3000,
			})
			
			// Clear selection and refresh data
			setRowSelection({})
			refetch()
		} catch (error) {
			toast.error("Failed to delete secrets", {
				description: error instanceof Error ? error.message : "An unexpected error occurred",
				duration: 4000,
			})
		}
	}, [refetch, setRowSelection])

	// Handle opening form drawer for editing
	const handleEditSecret = React.useCallback((secret: DashboardSecret) => {
		setSelectedSecretForEdit(secret)
		setFormDrawerOpen(true)
	}, [])

	// Handle form save
	const handleFormSave = React.useCallback(() => {
		refetch() // Refresh the data
	}, [refetch])

	// Create columns with the callbacks
	const columns = React.useMemo(
		() => createColumns(handleViewDetails, handleEditSecret, handleDeleteSecret),
		[handleViewDetails, handleEditSecret, handleDeleteSecret]
	)

	// Filter data based on global filter and type filter
	const filteredData = React.useMemo(() => {
		let filtered = secrets

		// Apply type filter
		if (typeFilter !== "all") {
			filtered = filtered.filter(secret => secret.type === typeFilter)
		}

		// Apply global filter (search)
		if (globalFilter) {
			const searchTerm = globalFilter.toLowerCase()
			filtered = filtered.filter(secret =>
				secret.name.toLowerCase().includes(searchTerm) ||
				secret.namespace.toLowerCase().includes(searchTerm) ||
				secret.type.toLowerCase().includes(searchTerm) ||
				secret.keys.some(key => key.toLowerCase().includes(searchTerm))
			)
		}

		return filtered
	}, [secrets, typeFilter, globalFilter])

	// Get unique secret types for filter dropdown
	const secretTypes = React.useMemo(() => {
		const types = new Set(secrets.map(secret => secret.type))
		return Array.from(types).sort()
	}, [secrets])

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

	React.useEffect(() => {
		setSortableIds(secrets.map((secret) => secret.id))
	}, [secrets])

	// Handle keyboard events for delete functionality
	React.useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			// Only handle delete key if we have selected rows and no modal is open
			if (event.key === 'Delete' && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
				const selectedRows = table.getFilteredSelectedRowModel().rows
				if (selectedRows.length > 0) {
					event.preventDefault()
					// Trigger the bulk delete dialog
					const deleteButton = document.querySelector('[data-delete-trigger]') as HTMLButtonElement
					if (deleteButton && !deleteButton.disabled) {
						deleteButton.click()
					}
				}
			}
		}

		document.addEventListener('keydown', handleKeyDown)
		return () => {
			document.removeEventListener('keydown', handleKeyDown)
		}
	}, [table])

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

	// Drag and drop setup - removed for now, can be added back later

	// Keyboard shortcuts
	React.useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			// Focus search on '/' key
			if (event.key === '/' && !event.ctrlKey && !event.metaKey) {
				event.preventDefault()
				const searchInput = document.querySelector('input[placeholder*="Search"]') as HTMLInputElement
				searchInput?.focus()
			}
			// Close drawer on Escape
			if (event.key === 'Escape') {
				setDetailDrawerOpen(false)
			}
		}

		document.addEventListener('keydown', handleKeyDown)
		return () => document.removeEventListener('keydown', handleKeyDown)
	}, [])

	if (loading) {
		return (
			<div className="px-4 lg:px-6">
				<div className="flex items-center justify-center py-10">
					<IconLoader className="size-6 animate-spin" />
					<span className="ml-2">Loading secrets...</span>
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

	const selectedRowsCount = table.getFilteredSelectedRowModel().rows.length
	const totalRowsCount = table.getFilteredRowModel().rows.length

	return (
		<div className="px-4 lg:px-6">
			<div className="space-y-4">
				{/* Search and filter controls */}
				<div className="flex flex-col sm:flex-row gap-4">
					<div className="flex-1">
						<Input
							placeholder="Search secrets by name, namespace, type, or keys... (Press '/' to focus)"
							value={globalFilter}
							onChange={(e) => setGlobalFilter(e.target.value)}
							className="max-w-sm"
						/>
					</div>
					<div className="flex gap-2">
						<Select value={typeFilter} onValueChange={setTypeFilter}>
							<SelectTrigger className="w-48">
								<SelectValue placeholder="Filter by type" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">All Types</SelectItem>
								{secretTypes.map((type) => (
									<SelectItem key={type} value={type}>
										<div className="flex items-center gap-2">
											{getSecretTypeBadge(type)}
											<span>{type}</span>
										</div>
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<Button onClick={handleNewSecret} className="gap-2">
							<IconPlus className="size-4" />
							<span className="hidden sm:inline">New Secret</span>
						</Button>
						<AlertDialog>
							<AlertDialogTrigger asChild>
								<Button
									variant="outline"
									disabled={selectedRowsCount === 0}
									className="gap-2 text-red-600"
									data-delete-trigger
								>
									<IconTrash className="size-4" />
									<span className="hidden sm:inline">Delete ({selectedRowsCount})</span>
								</Button>
							</AlertDialogTrigger>
							<AlertDialogContent>
								<AlertDialogHeader>
									<AlertDialogTitle>Delete {selectedRowsCount} Secret{selectedRowsCount > 1 ? 's' : ''}</AlertDialogTitle>
									<AlertDialogDescription>
										Are you sure you want to delete {selectedRowsCount} secret{selectedRowsCount > 1 ? 's' : ''}? 
										This action cannot be undone and will permanently remove {selectedRowsCount > 1 ? 'these secrets' : 'this secret'} and all {selectedRowsCount > 1 ? 'their' : 'its'} data.
									</AlertDialogDescription>
								</AlertDialogHeader>
								<AlertDialogFooter>
									<AlertDialogCancel>Cancel</AlertDialogCancel>
									<AlertDialogAction 
										onClick={() => handleBulkDelete(table)}
										className="bg-red-600 hover:bg-red-700 text-white"
									>
										Delete Secret{selectedRowsCount > 1 ? 's' : ''}
									</AlertDialogAction>
								</AlertDialogFooter>
							</AlertDialogContent>
						</AlertDialog>
					</div>
				</div>

				{/* Table controls */}
				<div className="flex items-center justify-between">
					<div className="flex items-center space-x-2">
						<p className="text-sm text-muted-foreground">
							{selectedRowsCount} of {totalRowsCount} row(s) selected.
						</p>
						{isConnected && (
							<div className="flex items-center space-x-1 text-xs text-green-600">
								<div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
								<span>Real-time updates enabled</span>
							</div>
						)}
					</div>
					<div className="flex items-center space-x-2">
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button variant="outline" size="sm">
									<IconLayoutColumns />
									<span className="hidden lg:inline">Customize Columns</span>
									<span className="lg:hidden">Columns</span>
									<IconChevronDown />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end" className="w-56">
								{table
									.getAllColumns()
									.filter(
										(column) =>
											typeof column.accessorFn !== "undefined" &&
											column.getCanHide()
									)
									.map((column) => {
										return (
											<DropdownMenuCheckboxItem
												key={column.id}
												className="capitalize"
												checked={column.getIsVisible()}
												onCheckedChange={(value) =>
													column.toggleVisibility(!!value)
												}
											>
												{column.id}
											</DropdownMenuCheckboxItem>
										)
									})}
							</DropdownMenuContent>
						</DropdownMenu>
						<Button variant="outline" size="sm" onClick={refetch} disabled={loading}>
							<IconRefresh className={loading ? "animate-spin" : ""} />
						</Button>
					</div>
				</div>

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
													<div className="flex flex-col items-center gap-2">
														<IconShieldLock className="size-12 text-muted-foreground" />
														<div>
															<p className="text-sm font-medium">No secrets found</p>
															<p className="text-xs text-muted-foreground">
																{selectedNamespace === 'all'
																	? 'No secrets in any namespace'
																	: `No secrets in namespace "${selectedNamespace}"`
																}
															</p>
														</div>
													</div>
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
						{selectedRowsCount} of {totalRowsCount} row(s) selected.
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

			{/* Controlled detail drawer for full secret details */}
			{selectedSecretForDetails && (
				<SecretDetailDrawer
					item={selectedSecretForDetails}
					open={detailDrawerOpen}
					onOpenChange={(open: boolean) => {
						setDetailDrawerOpen(open)
						if (!open) {
							setSelectedSecretForDetails(null)
						}
					}}
				/>
			)}

			{/* Controlled form drawer for creating/editing secrets */}
			<SecretFormDrawer
				secret={selectedSecretForEdit}
				open={formDrawerOpen}
				onOpenChange={(open: boolean) => {
					setFormDrawerOpen(open)
					if (!open) {
						setSelectedSecretForEdit(null)
					}
				}}
				onSave={handleFormSave}
			/>
		</div>
	)
}

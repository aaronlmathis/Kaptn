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
	IconCircleCheckFilled,
	IconDotsVertical,
	IconGripVertical,
	IconLayoutColumns,
	IconLoader,
	IconAlertTriangle,
	IconRefresh,
	IconTerminal,
	IconTrash,
	IconEdit,
	IconEye,
} from "@tabler/icons-react"
import { PodDetailViewer } from "@/components/viewers/PodDetailViewer"
import { NodeDetailViewer } from "@/components/viewers/NodeDetailViewer"
import { ServiceDetailViewer } from "@/components/viewers/ServiceDetailViewer"
import { DeploymentDetailViewer } from "@/components/viewers/DeploymentDetailViewer"
import { PodDetailDrawer } from "@/components/viewers/PodDetailDrawer"
import { DeploymentDetailDrawer } from "@/components/viewers/DeploymentDetailDrawer"
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
import { z } from "zod"

import { usePods, useNodes, useServices, useDeployments } from "@/hooks/use-k8s-data"
import { useNamespace } from "@/contexts/namespace-context"
import { useShell } from "@/hooks/use-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"


import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

import { Label } from "@/components/ui/label"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table"
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@/components/ui/tabs"

/**
 * RESOURCE DETAIL DRAWER ARCHITECTURE
 * 
 * This dashboard implements a modular resource detail drawer system:
 * 
 * 1. ResourceDetailDrawer: Generic drawer component providing consistent UI/UX
 * 2. Specific Viewers: PodDetailViewer, NodeDetailViewer, ServiceDetailViewer, DeploymentDetailViewer
 *    - Each wraps ResourceDetailDrawer with resource-specific data and actions
 *    - Support both name cell triggers and dropdown menu triggers
 * 3. ResourceYamlEditor: Generic YAML editor for all resource types
 * 
 * To add new resource types:
 * 1. Create a new viewer component (e.g., ConfigMapDetailViewer.tsx)
 * 2. Add the resource schema export from this file
 * 3. Update the column definition to use the new viewer
 * 4. Add the viewer to dropdown actions
 * 
 * Each viewer shows comprehensive resource details and provides relevant actions
 * like YAML editing, scaling, restarting, etc. based on the resource type.
 */

export const podSchema = z.object({
	id: z.number(),
	name: z.string(),
	namespace: z.string(),
	node: z.string(),
	status: z.string(),
	ready: z.string(),
	restarts: z.number(),
	age: z.string(),
	cpu: z.string(),
	memory: z.string(),
	image: z.string(),
})

export const nodeSchema = z.object({
	id: z.number(),
	name: z.string(),
	status: z.string(),
	roles: z.string(),
	version: z.string(),
	cpu: z.string(),
	memory: z.string(),
	age: z.string(),
})

export const serviceSchema = z.object({
	id: z.number(),
	name: z.string(),
	namespace: z.string(),
	type: z.string(),
	clusterIP: z.string(),
	externalIP: z.string(),
	ports: z.string(),
	age: z.string(),
})

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

// Create a separate component for the drag handle
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

function getStatusBadge(status: string) {
	switch (status) {
		case "Running":
			return (
				<Badge variant="outline" className="text-green-600 border-border bg-transparent px-1.5">
					<IconCircleCheckFilled className="size-3 fill-green-600 mr-1" />
					{status}
				</Badge>
			)
		case "Pending":
			return (
				<Badge variant="outline" className="text-yellow-600 border-border bg-transparent px-1.5">
					<IconLoader className="size-3 text-yellow-600 mr-1" />
					{status}
				</Badge>
			)
		case "CrashLoopBackOff":
		case "Failed":
			return (
				<Badge variant="outline" className="text-red-600 border-border bg-transparent px-1.5">
					<IconAlertTriangle className="size-3 text-red-600 mr-1" />
					{status}
				</Badge>
			)
		default:
			return (
				<Badge variant="outline" className="text-muted-foreground border-border bg-transparent px-1.5">
					{status}
				</Badge>
			)
	}
}

function getNodeStatusBadge(status: string) {
	switch (status) {
		case "Ready":
			return (
				<Badge variant="outline" className="text-green-600 border-border bg-transparent px-1.5">
					<IconCircleCheckFilled className="size-3 fill-green-600 mr-1" />
					{status}
				</Badge>
			)
		case "NotReady":
			return (
				<Badge variant="outline" className="text-red-600 border-border bg-transparent px-1.5">
					<IconAlertTriangle className="size-3 text-red-600 mr-1" />
					{status}
				</Badge>
			)
		default:
			return (
				<Badge variant="outline" className="text-muted-foreground border-border bg-transparent px-1.5">
					{status}
				</Badge>
			)
	}
}

const createPodColumns = (
	onViewDetails?: (pod: z.infer<typeof podSchema>) => void,
	onExecShell?: (pod: z.infer<typeof podSchema>) => void
): ColumnDef<z.infer<typeof podSchema>>[] => [
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
			header: "Pod Name",
			cell: ({ row }) => {
				return <PodDetailViewer item={row.original} />
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
			accessorKey: "status",
			header: "Status",
			cell: ({ row }) => getStatusBadge(row.original.status),
		},
		{
			accessorKey: "ready",
			header: "Ready",
			cell: ({ row }) => (
				<div className="font-mono text-sm">{row.original.ready}</div>
			),
		},
		{
			accessorKey: "restarts",
			header: "Restarts",
			cell: ({ row }) => (
				<div className="font-mono text-sm">{row.original.restarts}</div>
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
			accessorKey: "node",
			header: "Node",
			cell: ({ row }) => (
				<div className="text-sm">{row.original.node}</div>
			),
		},
		{
			accessorKey: "cpu",
			header: "CPU",
			cell: ({ row }) => (
				<div className="font-mono text-sm">{row.original.cpu}</div>
			),
		},
		{
			accessorKey: "memory",
			header: "Memory",
			cell: ({ row }) => (
				<div className="font-mono text-sm">{row.original.memory}</div>
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
						{onViewDetails ? (
							<DropdownMenuItem
								onClick={() => onViewDetails(row.original)}
							>
								<IconEye className="size-4 mr-2" />
								View Details
							</DropdownMenuItem>
						) : (
							<PodDetailViewer
								item={row.original}
								trigger={
									<DropdownMenuItem>
										<IconEye className="size-4 mr-2" />
										View Details
									</DropdownMenuItem>
								}
							/>
						)}
						<DropdownMenuItem
							onClick={() => onExecShell?.(row.original)}
							disabled={!onExecShell}
						>
							<IconTerminal className="size-4 mr-2" />
							Exec Shell
						</DropdownMenuItem>
						<DropdownMenuItem>
							<IconEdit className="size-4 mr-2" />
							Edit YAML
						</DropdownMenuItem>
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

const createNodeColumns = (): ColumnDef<z.infer<typeof nodeSchema>>[] => [
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
		header: "Node Name",
		cell: ({ row }) => {
			return <NodeDetailViewer item={row.original} />
		},
		enableHiding: false,
	},
	{
		accessorKey: "status",
		header: "Status",
		cell: ({ row }) => getNodeStatusBadge(row.original.status),
	},
	{
		accessorKey: "roles",
		header: "Roles",
		cell: ({ row }) => (
			<Badge variant="outline" className="text-muted-foreground px-1.5">
				{row.original.roles}
			</Badge>
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
		accessorKey: "cpu",
		header: "CPU",
		cell: ({ row }) => (
			<div className="font-mono text-sm">{row.original.cpu}</div>
		),
	},
	{
		accessorKey: "memory",
		header: "Memory",
		cell: ({ row }) => (
			<div className="font-mono text-sm">{row.original.memory}</div>
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
					<NodeDetailViewer
						item={row.original}
						trigger={
							<DropdownMenuItem>
								<IconEye className="size-4 mr-2" />
								View Details
							</DropdownMenuItem>
						}
					/>
					<DropdownMenuItem>
						<IconEdit className="size-4 mr-2" />
						Cordon
					</DropdownMenuItem>
					<DropdownMenuItem>
						<IconEdit className="size-4 mr-2" />
						Drain
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

const createServiceColumns = (): ColumnDef<z.infer<typeof serviceSchema>>[] => [
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
		header: "Service Name",
		cell: ({ row }) => {
			return <ServiceDetailViewer item={row.original} />
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
		cell: ({ row }) => (
			<Badge variant="outline" className="text-blue-600 border-border bg-transparent px-1.5">
				{row.original.type}
			</Badge>
		),
	},
	{
		accessorKey: "clusterIP",
		header: "Cluster IP",
		cell: ({ row }) => (
			<div className="font-mono text-sm">{row.original.clusterIP}</div>
		),
	},
	{
		accessorKey: "externalIP",
		header: "External IP",
		cell: ({ row }) => (
			<div className="font-mono text-sm">{row.original.externalIP}</div>
		),
	},
	{
		accessorKey: "ports",
		header: "Ports",
		cell: ({ row }) => (
			<div className="font-mono text-sm">{row.original.ports}</div>
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
					<ServiceDetailViewer
						item={row.original}
						trigger={
							<DropdownMenuItem>
								<IconEye className="size-4 mr-2" />
								View Details
							</DropdownMenuItem>
						}
					/>
					<DropdownMenuItem>
						<IconEdit className="size-4 mr-2" />
						Edit YAML
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

const createDeploymentColumns = (
	onViewDetails?: (item: z.infer<typeof deploymentSchema>) => void
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
				return <DeploymentDetailViewer item={row.original} />
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
						<DropdownMenuItem onClick={() => onViewDetails?.(row.original)}>
							<IconEye className="size-4 mr-2" />
							View Details
						</DropdownMenuItem>
						<DropdownMenuItem>
							<IconEdit className="size-4 mr-2" />
							Edit YAML
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

function DraggableRow({ row }: { row: Row<z.infer<typeof podSchema>> }) {
	const { transform, transition, setNodeRef, isDragging } = useSortable({
		id: row.original.id,
	})

	return (
		<TableRow
			data-state={row.getIsSelected() && "selected"}
			data-dragging={isDragging}
			ref={setNodeRef}
			className="relative z-0 data-[dragging=true]:z-10 data-[dragging=true]:opacity-80"
			style={{
				transform: CSS.Transform.toString(transform),
				transition: transition,
			}}
		>
			{row.getVisibleCells().map((cell) => (
				<TableCell key={cell.id}>
					{flexRender(cell.column.columnDef.cell, cell.getContext())}
				</TableCell>
			))}
		</TableRow>
	)
}

export function KubernetesDashboard() {
	const { selectedNamespace } = useNamespace()
	const { openShell } = useShell()

	// Fetch live data using hooks
	const { data: podsData, loading: podsLoading, error: podsError, refetch: refetchPods } = usePods()
	const { data: nodesData, loading: nodesLoading, error: nodesError, refetch: refetchNodes } = useNodes()
	const { data: servicesData, loading: servicesLoading, error: servicesError, refetch: refetchServices } = useServices()
	const { data: deploymentsData, loading: deploymentsLoading, error: deploymentsError, refetch: refetchDeployments } = useDeployments()

	// Tab state management
	const [activeTab, setActiveTab] = React.useState("pods")

	// Check if we should show namespace columns
	const showNamespaceColumn = selectedNamespace === 'all'

	// Callbacks for opening detailed views
	const handleViewPodDetails = React.useCallback((item: z.infer<typeof podSchema>) => {
		setSelectedItem(item)
		setDrawerOpen(true)
	}, [])

	const handleViewDeploymentDetails = React.useCallback((item: z.infer<typeof deploymentSchema>) => {
		setSelectedItem(item)
		setDrawerOpen(true)
	}, [])

	// Handle exec shell
	const handleExecShell = React.useCallback((item: z.infer<typeof podSchema>) => {
		openShell(item.name, item.namespace)
	}, [openShell])

	// Create columns for each resource type with callbacks
	const podColumns = React.useMemo(() => createPodColumns(handleViewPodDetails, handleExecShell), [handleViewPodDetails, handleExecShell])
	const nodeColumns = React.useMemo(() => createNodeColumns(), [])
	const serviceColumns = React.useMemo(() => createServiceColumns(), [])
	const deploymentColumns = React.useMemo(() => createDeploymentColumns(handleViewDeploymentDetails), [handleViewDeploymentDetails])

	// Get current data and columns based on active tab
	const getCurrentData = () => {
		switch (activeTab) {
			case "nodes":
				return { data: nodesData, columns: nodeColumns, loading: nodesLoading, error: nodesError, refetch: refetchNodes }
			case "services":
				return { data: servicesData, columns: serviceColumns, loading: servicesLoading, error: servicesError, refetch: refetchServices }
			case "deployments":
				return { data: deploymentsData, columns: deploymentColumns, loading: deploymentsLoading, error: deploymentsError, refetch: refetchDeployments }
			default:
				return { data: podsData, columns: podColumns, loading: podsLoading, error: podsError, refetch: refetchPods }
		}
	}

	const currentData = getCurrentData()

	// Drawer state for detailed views
	const [drawerOpen, setDrawerOpen] = React.useState(false)
	const [selectedItem, setSelectedItem] = React.useState<any>(null)

	const [data, setData] = React.useState<any[]>(() => currentData.data)
	const [rowSelection, setRowSelection] = React.useState({})
	const [columnVisibility, setColumnVisibility] =
		React.useState<VisibilityState>({
			namespace: showNamespaceColumn
		})
	const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
		[]
	)
	const [sorting, setSorting] = React.useState<SortingState>([])
	const [pagination, setPagination] = React.useState({
		pageIndex: 0,
		pageSize: 10,
	})

	// Update local data when current data changes
	React.useEffect(() => {
		setData(currentData.data)
		// Reset table state when switching tabs
		setRowSelection({})
		setColumnFilters([])
		setSorting([])
		setPagination({ pageIndex: 0, pageSize: 10 })
		// Update namespace column visibility
		setColumnVisibility({
			namespace: showNamespaceColumn
		})
	}, [currentData.data, activeTab, showNamespaceColumn])
	const sortableId = React.useId()
	const sensors = useSensors(
		useSensor(MouseSensor, {}),
		useSensor(TouchSensor, {}),
		useSensor(KeyboardSensor, {})
	)

	const dataIds = React.useMemo<UniqueIdentifier[]>(
		() => data?.map(({ id }) => id) || [],
		[data]
	)

	const table = useReactTable({
		data: data as any,
		columns: currentData.columns as any,
		state: {
			sorting,
			columnVisibility,
			rowSelection,
			columnFilters,
			pagination,
		},
		getRowId: (row: any) => row.id.toString(),
		enableRowSelection: true,
		onRowSelectionChange: setRowSelection,
		onSortingChange: setSorting,
		onColumnFiltersChange: setColumnFilters,
		onColumnVisibilityChange: setColumnVisibility,
		onPaginationChange: setPagination,
		getCoreRowModel: getCoreRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getFacetedRowModel: getFacetedRowModel(),
		getFacetedUniqueValues: getFacetedUniqueValues(),
	})

	function handleDragEnd(event: DragEndEvent) {
		const { active, over } = event
		if (active && over && active.id !== over.id) {
			setData((data: any) => {
				const oldIndex = dataIds.indexOf(active.id)
				const newIndex = dataIds.indexOf(over.id)
				return arrayMove(data, oldIndex, newIndex)
			})
		}
	}

	const runningCount = React.useMemo(() => {
		if (activeTab === "pods") {
			return (data as any[]).filter(item => item.status === "Running").length
		}
		if (activeTab === "nodes") {
			return (data as any[]).filter(item => item.status === "Ready").length
		}
		return 0
	}, [data, activeTab])

	const totalCount = data.length

	const failedCount = React.useMemo(() => {
		if (activeTab === "pods") {
			return (data as any[]).filter(item => item.status === "CrashLoopBackOff" || item.status === "Failed").length
		}
		if (activeTab === "nodes") {
			return (data as any[]).filter(item => item.status === "NotReady").length
		}
		return 0
	}, [data, activeTab])

	const getResourceName = () => {
		switch (activeTab) {
			case "nodes": return "node"
			case "services": return "service"
			case "deployments": return "deployment"
			default: return "pod"
		}
	}

	return (
		<>
			<Tabs
				value={activeTab}
				onValueChange={setActiveTab}
				className="w-full flex-col justify-start gap-6"
			>
				<div className="flex items-center justify-between px-4 lg:px-6">
					<Label htmlFor="view-selector" className="sr-only">
						View
					</Label>
					<Select defaultValue="pods">
						<SelectTrigger
							className="flex w-fit @4xl/main:hidden"
							size="sm"
							id="view-selector"
						>
							<SelectValue placeholder="Select a view" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="pods">Pods</SelectItem>
							<SelectItem value="deployments">Deployments</SelectItem>
							<SelectItem value="services">Services</SelectItem>
							<SelectItem value="nodes">Nodes</SelectItem>
						</SelectContent>
					</Select>
					<TabsList className="**:data-[slot=badge]:bg-muted-foreground/30 hidden **:data-[slot=badge]:size-5 **:data-[slot=badge]:rounded-full **:data-[slot=badge]:px-1 @4xl/main:flex">
						<TabsTrigger value="pods">
							Pods <Badge variant="secondary">{podsData.length}</Badge>
						</TabsTrigger>
						<TabsTrigger value="deployments">
							Deployments <Badge variant="secondary">{deploymentsData.length}</Badge>
						</TabsTrigger>
						<TabsTrigger value="services">
							Services <Badge variant="secondary">{servicesData.length}</Badge>
						</TabsTrigger>
						<TabsTrigger value="nodes">
							Nodes <Badge variant="secondary">{nodesData.length}</Badge>
						</TabsTrigger>
					</TabsList>
					<div className="flex items-center gap-2">
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
						<Button variant="outline" size="sm" onClick={currentData.refetch} disabled={currentData.loading}>
							<IconRefresh className={currentData.loading ? "animate-spin" : ""} />
							<span className="hidden lg:inline">Refresh</span>
						</Button>
					</div>
				</div>
				<TabsContent
					value="pods"
					className="relative flex flex-col gap-4 overflow-auto px-4 lg:px-6"
				>
					<div className="overflow-hidden rounded-lg border">
						<DndContext
							collisionDetection={closestCenter}
							modifiers={[restrictToVerticalAxis]}
							onDragEnd={handleDragEnd}
							sensors={sensors}
							id={sortableId}
						>
							<Table>
								<TableHeader className="bg-muted sticky top-0 z-10">
									{table.getHeaderGroups().map((headerGroup) => (
										<TableRow key={headerGroup.id}>
											{headerGroup.headers.map((header) => {
												return (
													<TableHead key={header.id} colSpan={header.colSpan}>
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
								<TableBody className="**:data-[slot=table-cell]:first:w-8">
									{table.getRowModel().rows?.length ? (
										<SortableContext
											items={dataIds}
											strategy={verticalListSortingStrategy}
										>
											{table.getRowModel().rows.map((row) => (
												<DraggableRow key={row.id} row={row} />
											))}
										</SortableContext>
									) : podsLoading ? (
										<TableRow>
											<TableCell
												colSpan={currentData.columns.length}
												className="h-24 text-center"
											>
												<div className="flex items-center justify-center gap-2">
													<IconLoader className="h-4 w-4 animate-spin" />
													Loading pods...
												</div>
											</TableCell>
										</TableRow>
									) : podsError ? (
										<TableRow>
											<TableCell
												colSpan={currentData.columns.length}
												className="h-24 text-center text-red-600"
											>
												Error loading pods: {podsError}
											</TableCell>
										</TableRow>
									) : (
										<TableRow>
											<TableCell
												colSpan={currentData.columns.length}
												className="h-24 text-center"
											>
												No pods found.
											</TableCell>
										</TableRow>
									)}
								</TableBody>
							</Table>
						</DndContext>
					</div>
					<div className="flex items-center justify-between px-4">
						<div className="text-muted-foreground hidden flex-1 text-sm lg:flex">
							{table.getFilteredSelectedRowModel().rows.length} of{" "}
							{table.getFilteredRowModel().rows.length} pod(s) selected.
						</div>
						<div className="flex w-full items-center gap-8 lg:w-fit">
							<div className="hidden items-center gap-2 lg:flex">
								<Label htmlFor="rows-per-page" className="text-sm font-medium">
									Rows per page
								</Label>
								<Select
									value={`${table.getState().pagination.pageSize}`}
									onValueChange={(value) => {
										table.setPageSize(Number(value))
									}}
								>
									<SelectTrigger size="sm" className="w-20" id="rows-per-page">
										<SelectValue
											placeholder={table.getState().pagination.pageSize}
										/>
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
							<div className="flex w-fit items-center justify-center text-sm font-medium">
								Page {table.getState().pagination.pageIndex + 1} of{" "}
								{table.getPageCount()}
							</div>
							<div className="ml-auto flex items-center gap-2 lg:ml-0">
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
				</TabsContent>
				<TabsContent
					value="deployments"
					className="relative flex flex-col gap-4 overflow-auto px-4 lg:px-6"
				>
					<div className="overflow-hidden rounded-lg border">
						<DndContext
							collisionDetection={closestCenter}
							modifiers={[restrictToVerticalAxis]}
							onDragEnd={handleDragEnd}
							sensors={sensors}
							id={sortableId}
						>
							<Table>
								<TableHeader className="bg-muted sticky top-0 z-10">
									{table.getHeaderGroups().map((headerGroup) => (
										<TableRow key={headerGroup.id}>
											{headerGroup.headers.map((header) => {
												return (
													<TableHead key={header.id} colSpan={header.colSpan}>
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
								<TableBody className="**:data-[slot=table-cell]:first:w-8">
									{table.getRowModel().rows?.length ? (
										<SortableContext
											items={dataIds}
											strategy={verticalListSortingStrategy}
										>
											{table.getRowModel().rows.map((row) => (
												<DraggableRow key={row.id} row={row} />
											))}
										</SortableContext>
									) : deploymentsLoading ? (
										<TableRow>
											<TableCell
												colSpan={currentData.columns.length}
												className="h-24 text-center"
											>
												<div className="flex items-center justify-center gap-2">
													<IconLoader className="h-4 w-4 animate-spin" />
													Loading deployments...
												</div>
											</TableCell>
										</TableRow>
									) : deploymentsError ? (
										<TableRow>
											<TableCell
												colSpan={currentData.columns.length}
												className="h-24 text-center text-red-600"
											>
												Error loading deployments: {deploymentsError}
											</TableCell>
										</TableRow>
									) : (
										<TableRow>
											<TableCell
												colSpan={currentData.columns.length}
												className="h-24 text-center"
											>
												No deployments found.
											</TableCell>
										</TableRow>
									)}
								</TableBody>
							</Table>
						</DndContext>
					</div>
					<div className="flex items-center justify-between px-4">
						<div className="text-muted-foreground hidden flex-1 text-sm lg:flex">
							{table.getFilteredSelectedRowModel().rows.length} of{" "}
							{table.getFilteredRowModel().rows.length} deployment(s) selected.
						</div>
						<div className="flex w-full items-center gap-8 lg:w-fit">
							<div className="hidden items-center gap-2 lg:flex">
								<Label htmlFor="rows-per-page" className="text-sm font-medium">
									Rows per page
								</Label>
								<Select
									value={`${table.getState().pagination.pageSize}`}
									onValueChange={(value) => {
										table.setPageSize(Number(value))
									}}
								>
									<SelectTrigger size="sm" className="w-20" id="rows-per-page">
										<SelectValue
											placeholder={table.getState().pagination.pageSize}
										/>
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
							<div className="flex w-fit items-center justify-center text-sm font-medium">
								Page {table.getState().pagination.pageIndex + 1} of{" "}
								{table.getPageCount()}
							</div>
							<div className="ml-auto flex items-center gap-2 lg:ml-0">
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
				</TabsContent>
				<TabsContent value="services" className="relative flex flex-col gap-4 overflow-auto px-4 lg:px-6">
					<div className="overflow-hidden rounded-lg border">
						<DndContext
							collisionDetection={closestCenter}
							modifiers={[restrictToVerticalAxis]}
							onDragEnd={handleDragEnd}
							sensors={sensors}
							id={sortableId}
						>
							<Table>
								<TableHeader className="bg-muted sticky top-0 z-10">
									{table.getHeaderGroups().map((headerGroup) => (
										<TableRow key={headerGroup.id}>
											{headerGroup.headers.map((header) => {
												return (
													<TableHead key={header.id} colSpan={header.colSpan}>
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
								<TableBody className="**:data-[slot=table-cell]:first:w-8">
									{table.getRowModel().rows?.length ? (
										<SortableContext
											items={dataIds}
											strategy={verticalListSortingStrategy}
										>
											{table.getRowModel().rows.map((row) => (
												<DraggableRow key={row.id} row={row} />
											))}
										</SortableContext>
									) : servicesLoading ? (
										<TableRow>
											<TableCell
												colSpan={currentData.columns.length}
												className="h-24 text-center"
											>
												<div className="flex items-center justify-center gap-2">
													<IconLoader className="h-4 w-4 animate-spin" />
													Loading services...
												</div>
											</TableCell>
										</TableRow>
									) : servicesError ? (
										<TableRow>
											<TableCell
												colSpan={currentData.columns.length}
												className="h-24 text-center text-red-600"
											>
												Error loading services: {servicesError}
											</TableCell>
										</TableRow>
									) : (
										<TableRow>
											<TableCell
												colSpan={currentData.columns.length}
												className="h-24 text-center"
											>
												No services found.
											</TableCell>
										</TableRow>
									)}
								</TableBody>
							</Table>
						</DndContext>
					</div>
					<div className="flex items-center justify-between px-4">
						<div className="text-muted-foreground hidden flex-1 text-sm lg:flex">
							{table.getFilteredSelectedRowModel().rows.length} of{" "}
							{table.getFilteredRowModel().rows.length} service(s) selected.
						</div>
						<div className="flex w-full items-center gap-8 lg:w-fit">
							<div className="hidden items-center gap-2 lg:flex">
								<Label htmlFor="rows-per-page" className="text-sm font-medium">
									Rows per page
								</Label>
								<Select
									value={`${table.getState().pagination.pageSize}`}
									onValueChange={(value) => {
										table.setPageSize(Number(value))
									}}
								>
									<SelectTrigger size="sm" className="w-20" id="rows-per-page">
										<SelectValue
											placeholder={table.getState().pagination.pageSize}
										/>
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
							<div className="flex w-fit items-center justify-center text-sm font-medium">
								Page {table.getState().pagination.pageIndex + 1} of{" "}
								{table.getPageCount()}
							</div>
							<div className="ml-auto flex items-center gap-2 lg:ml-0">
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
				</TabsContent>
				<TabsContent
					value="nodes"
					className="relative flex flex-col gap-4 overflow-auto px-4 lg:px-6"
				>
					<div className="overflow-hidden rounded-lg border">
						<DndContext
							collisionDetection={closestCenter}
							modifiers={[restrictToVerticalAxis]}
							onDragEnd={handleDragEnd}
							sensors={sensors}
							id={sortableId}
						>
							<Table>
								<TableHeader className="bg-muted sticky top-0 z-10">
									{table.getHeaderGroups().map((headerGroup) => (
										<TableRow key={headerGroup.id}>
											{headerGroup.headers.map((header) => {
												return (
													<TableHead key={header.id} colSpan={header.colSpan}>
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
								<TableBody className="**:data-[slot=table-cell]:first:w-8">
									{table.getRowModel().rows?.length ? (
										<SortableContext
											items={dataIds}
											strategy={verticalListSortingStrategy}
										>
											{table.getRowModel().rows.map((row) => (
												<DraggableRow key={row.id} row={row} />
											))}
										</SortableContext>
									) : nodesLoading ? (
										<TableRow>
											<TableCell
												colSpan={currentData.columns.length}
												className="h-24 text-center"
											>
												<div className="flex items-center justify-center gap-2">
													<IconLoader className="h-4 w-4 animate-spin" />
													Loading nodes...
												</div>
											</TableCell>
										</TableRow>
									) : nodesError ? (
										<TableRow>
											<TableCell
												colSpan={currentData.columns.length}
												className="h-24 text-center text-red-600"
											>
												Error loading nodes: {nodesError}
											</TableCell>
										</TableRow>
									) : (
										<TableRow>
											<TableCell
												colSpan={currentData.columns.length}
												className="h-24 text-center"
											>
												No nodes found.
											</TableCell>
										</TableRow>
									)}
								</TableBody>
							</Table>
						</DndContext>
					</div>
					<div className="flex items-center justify-between px-4">
						<div className="text-muted-foreground hidden flex-1 text-sm lg:flex">
							{table.getFilteredSelectedRowModel().rows.length} of{" "}
							{table.getFilteredRowModel().rows.length} node(s) selected.
						</div>
						<div className="flex w-full items-center gap-8 lg:w-fit">
							<div className="hidden items-center gap-2 lg:flex">
								<Label htmlFor="rows-per-page" className="text-sm font-medium">
									Rows per page
								</Label>
								<Select
									value={`${table.getState().pagination.pageSize}`}
									onValueChange={(value) => {
										table.setPageSize(Number(value))
									}}
								>
									<SelectTrigger size="sm" className="w-20" id="rows-per-page">
										<SelectValue
											placeholder={table.getState().pagination.pageSize}
										/>
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
							<div className="flex w-fit items-center justify-center text-sm font-medium">
								Page {table.getState().pagination.pageIndex + 1} of{" "}
								{table.getPageCount()}
							</div>
							<div className="ml-auto flex items-center gap-2 lg:ml-0">
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
				</TabsContent>
			</Tabs>

			{/* Detailed view drawers */}
			{selectedItem && activeTab === "pods" && (
				<PodDetailDrawer
					item={selectedItem}
					open={drawerOpen}
					onOpenChange={(open) => {
						setDrawerOpen(open)
						if (!open) {
							setSelectedItem(null)
						}
					}}
				/>
			)}

			{selectedItem && activeTab === "deployments" && (
				<DeploymentDetailDrawer
					item={selectedItem}
					open={drawerOpen}
					onOpenChange={(open) => {
						setDrawerOpen(open)
						if (!open) {
							setSelectedItem(null)
						}
					}}
				/>
			)}
		</>
	)
}
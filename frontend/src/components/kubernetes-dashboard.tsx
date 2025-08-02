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
	IconPlus,
	IconAlertTriangle,
	IconRefresh,
	IconTerminal,
	IconTrash,
	IconEdit,
	IconEye,
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
import { toast } from "sonner"
import { z } from "zod"

import { useIsMobile } from "@/hooks/use-mobile"
import { usePods, useNodes, useServices, useDeployments } from "@/hooks/use-k8s-data"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
	Drawer,
	DrawerClose,
	DrawerContent,
	DrawerDescription,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
	DrawerTrigger,
} from "@/components/ui/drawer"
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
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

const columns: ColumnDef<z.infer<typeof podSchema>>[] = [
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
					<DropdownMenuItem>
						<IconEye className="size-4 mr-2" />
						View Details
					</DropdownMenuItem>
					<DropdownMenuItem>
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

const nodeColumns: ColumnDef<z.infer<typeof nodeSchema>>[] = [
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
		cell: ({ row }) => (
			<div className="font-medium">{row.original.name}</div>
		),
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
					<DropdownMenuItem>
						<IconEye className="size-4 mr-2" />
						View Details
					</DropdownMenuItem>
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

const serviceColumns: ColumnDef<z.infer<typeof serviceSchema>>[] = [
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
		cell: ({ row }) => (
			<div className="font-medium">{row.original.name}</div>
		),
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
					<DropdownMenuItem>
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

const deploymentColumns: ColumnDef<z.infer<typeof deploymentSchema>>[] = [
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
		cell: ({ row }) => (
			<div className="font-medium">{row.original.name}</div>
		),
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
					<DropdownMenuItem>
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
	// Fetch live data using hooks
	const { data: podsData, loading: podsLoading, error: podsError, refetch: refetchPods } = usePods()
	const { data: nodesData, loading: nodesLoading, error: nodesError, refetch: refetchNodes } = useNodes()
	const { data: servicesData, loading: servicesLoading, error: servicesError, refetch: refetchServices } = useServices()
	const { data: deploymentsData, loading: deploymentsLoading, error: deploymentsError, refetch: refetchDeployments } = useDeployments()

	// Tab state management
	const [activeTab, setActiveTab] = React.useState("pods")

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
				return { data: podsData, columns: columns, loading: podsLoading, error: podsError, refetch: refetchPods }
		}
	}

	const currentData = getCurrentData()

	const [data, setData] = React.useState<any[]>(() => currentData.data)
	const [rowSelection, setRowSelection] = React.useState({})
	const [columnVisibility, setColumnVisibility] =
		React.useState<VisibilityState>({})
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
	}, [currentData.data, activeTab])
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
					<Button variant="outline" size="sm" onClick={refetchPods} disabled={podsLoading}>
						<IconRefresh className={podsLoading ? "animate-spin" : ""} />
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
											colSpan={columns.length}
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
											colSpan={columns.length}
											className="h-24 text-center text-red-600"
										>
											Error loading pods: {podsError}
										</TableCell>
									</TableRow>
								) : (
									<TableRow>
										<TableCell
											colSpan={columns.length}
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
											colSpan={deploymentColumns.length}
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
											colSpan={deploymentColumns.length}
											className="h-24 text-center text-red-600"
										>
											Error loading deployments: {deploymentsError}
										</TableCell>
									</TableRow>
								) : (
									<TableRow>
										<TableCell
											colSpan={deploymentColumns.length}
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
											colSpan={serviceColumns.length}
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
											colSpan={serviceColumns.length}
											className="h-24 text-center text-red-600"
										>
											Error loading services: {servicesError}
										</TableCell>
									</TableRow>
								) : (
									<TableRow>
										<TableCell
											colSpan={serviceColumns.length}
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
											colSpan={nodeColumns.length}
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
											colSpan={nodeColumns.length}
											className="h-24 text-center text-red-600"
										>
											Error loading nodes: {nodesError}
										</TableCell>
									</TableRow>
								) : (
									<TableRow>
										<TableCell
											colSpan={nodeColumns.length}
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
	)
}

function PodDetailViewer({ item }: { item: z.infer<typeof podSchema> }) {
	const isMobile = useIsMobile()

	return (
		<Drawer direction={isMobile ? "bottom" : "right"}>
			<DrawerTrigger asChild>
				<Button variant="link" className="text-foreground w-fit px-0 text-left">
					{item.name}
				</Button>
			</DrawerTrigger>
			<DrawerContent>
				<DrawerHeader className="gap-1">
					<DrawerTitle>{item.name}</DrawerTitle>
					<DrawerDescription>
						Pod details and configuration
					</DrawerDescription>
				</DrawerHeader>
				<div className="flex flex-col gap-4 overflow-y-auto px-4 text-sm">
					<div className="grid gap-4">
						<div className="grid grid-cols-2 gap-4">
							<div className="flex flex-col gap-3">
								<Label htmlFor="name">Pod Name</Label>
								<Input id="name" value={item.name} readOnly />
							</div>
							<div className="flex flex-col gap-3">
								<Label htmlFor="namespace">Namespace</Label>
								<Input id="namespace" value={item.namespace} readOnly />
							</div>
						</div>
						<div className="grid grid-cols-2 gap-4">
							<div className="flex flex-col gap-3">
								<Label htmlFor="status">Status</Label>
								<div className="flex items-center gap-2">
									{getStatusBadge(item.status)}
								</div>
							</div>
							<div className="flex flex-col gap-3">
								<Label htmlFor="node">Node</Label>
								<Input id="node" value={item.node} readOnly />
							</div>
						</div>
						<div className="grid grid-cols-3 gap-4">
							<div className="flex flex-col gap-3">
								<Label htmlFor="ready">Ready</Label>
								<Input id="ready" value={item.ready} readOnly className="font-mono" />
							</div>
							<div className="flex flex-col gap-3">
								<Label htmlFor="restarts">Restarts</Label>
								<Input id="restarts" value={item.restarts.toString()} readOnly className="font-mono" />
							</div>
							<div className="flex flex-col gap-3">
								<Label htmlFor="age">Age</Label>
								<Input id="age" value={item.age} readOnly className="font-mono" />
							</div>
						</div>
						<div className="grid grid-cols-2 gap-4">
							<div className="flex flex-col gap-3">
								<Label htmlFor="cpu">CPU Usage</Label>
								<Input id="cpu" value={item.cpu} readOnly className="font-mono" />
							</div>
							<div className="flex flex-col gap-3">
								<Label htmlFor="memory">Memory Usage</Label>
								<Input id="memory" value={item.memory} readOnly className="font-mono" />
							</div>
						</div>
						<div className="flex flex-col gap-3">
							<Label htmlFor="image">Container Image</Label>
							<Input id="image" value={item.image} readOnly className="font-mono text-sm" />
						</div>
					</div>
				</div>
				<DrawerFooter>
					<div className="flex gap-2">
						<Button size="sm">
							<IconTerminal className="size-4 mr-2" />
							Exec Shell
						</Button>
						<Button variant="outline" size="sm">
							<IconEdit className="size-4 mr-2" />
							Edit YAML
						</Button>
					</div>
					<DrawerClose asChild>
						<Button variant="outline">Close</Button>
					</DrawerClose>
				</DrawerFooter>
			</DrawerContent>
		</Drawer>
	)
}

"use client"

import * as React from "react"
import {
	flexRender,
	getCoreRowModel,
	getFilteredRowModel,
	getPaginationRowModel,
	getSortedRowModel,
	useReactTable,
	type ColumnDef,
	type SortingState,
	type ColumnFiltersState,
} from "@/lib/table"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { IconAlertTriangle, IconLoader, IconClock, IconCpu, IconDatabase, IconRefresh } from "@tabler/icons-react"

// Types for unschedulable pods
interface UnschedulablePod {
	id: number
	name: string
	namespace: string
	age: string
	reason: string
	requestedCpu: string
	requestedMemory: string
	schedulerMessage?: string
}

// Helper function to get reason badge
function getReasonBadge(reason: string) {
	const reasonLower = reason.toLowerCase()

	if (reasonLower.includes("insufficient") || reasonLower.includes("resource")) {
		return (
			<Badge variant="outline" className="text-orange-600 border-border bg-transparent px-1.5">
				<IconCpu className="size-3 text-orange-600 mr-1" />
				{reason}
			</Badge>
		)
	}

	if (reasonLower.includes("nodeaffinity") || reasonLower.includes("affinity")) {
		return (
			<Badge variant="outline" className="text-purple-600 border-border bg-transparent px-1.5">
				<IconDatabase className="size-3 text-purple-600 mr-1" />
				{reason}
			</Badge>
		)
	}

	if (reasonLower.includes("taint") || reasonLower.includes("toleration")) {
		return (
			<Badge variant="outline" className="text-blue-600 border-border bg-transparent px-1.5">
				<IconAlertTriangle className="size-3 text-blue-600 mr-1" />
				{reason}
			</Badge>
		)
	}

	// Default case
	return (
		<Badge variant="outline" className="text-red-600 border-border bg-transparent px-1.5">
			<IconAlertTriangle className="size-3 text-red-600 mr-1" />
			{reason}
		</Badge>
	)
}

// Column definitions
const columns: ColumnDef<UnschedulablePod>[] = [
	{
		accessorKey: "namespace",
		header: "Namespace",
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		cell: ({ row }: { row: any }) => (
			<Badge variant="outline" className="text-muted-foreground px-1.5">
				{row.original.namespace}
			</Badge>
		),
	},
	{
		accessorKey: "name",
		header: "Pod",
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		cell: ({ row }: { row: any }) => (
			<div className="font-medium text-sm">{row.original.name}</div>
		),
	},
	{
		accessorKey: "age",
		header: "Age",
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		cell: ({ row }: { row: any }) => (
			<div className="flex items-center gap-1.5 font-mono text-sm">
				<IconClock className="size-3 text-muted-foreground" />
				{row.original.age}
			</div>
		),
	},
	{
		accessorKey: "reason",
		header: "Reason",
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		cell: ({ row }: { row: any }) => getReasonBadge(row.original.reason),
	},
	{
		id: "resources",
		header: "Requested CPU/Mem",
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		cell: ({ row }: { row: any }) => (
			<div className="space-y-1">
				<div className="flex items-center gap-1.5 text-xs">
					<IconCpu className="size-3 text-muted-foreground" />
					<span className="font-mono">{row.original.requestedCpu}</span>
				</div>
				<div className="flex items-center gap-1.5 text-xs">
					<IconDatabase className="size-3 text-muted-foreground" />
					<span className="font-mono">{row.original.requestedMemory}</span>
				</div>
			</div>
		),
	},
]

interface UnschedulablePodsTableProps {
	data?: UnschedulablePod[]
	loading?: boolean
	error?: string
	onRefresh?: () => void
}

export function UnschedulablePodsTable({
	data = [],
	loading = false,
	error,
	onRefresh
}: UnschedulablePodsTableProps) {
	const [sorting, setSorting] = React.useState<SortingState>([])
	const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])

	const table = useReactTable({
		data,
		columns,
		onSortingChange: setSorting,
		onColumnFiltersChange: setColumnFilters,
		getCoreRowModel: getCoreRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		state: {
			sorting,
			columnFilters,
		},
		initialState: {
			pagination: {
				pageSize: 10, // Show top 10 unschedulable pods
			},
		},
	})

	if (loading) {
		return (
			<Card>
				<CardHeader className="pb-3">
					<div className="flex items-center justify-between">
						<div>
							<CardTitle className="text-lg">Unschedulable Pods</CardTitle>
							<CardDescription>Pods that cannot be scheduled and why</CardDescription>
						</div>
						{onRefresh && (
							<Button
								variant="outline"
								size="sm"
								onClick={onRefresh}
								disabled={loading}
							>
								<IconRefresh className={`size-4 ${loading ? 'animate-spin' : ''}`} />
							</Button>
						)}
					</div>
				</CardHeader>
				<CardContent>
					<div className="flex items-center justify-center py-8">
						<IconLoader className="size-6 animate-spin mr-2" />
						<span>Loading unschedulable pods...</span>
					</div>
				</CardContent>
			</Card>
		)
	}

	if (error) {
		return (
			<Card>
				<CardHeader className="pb-3">
					<div className="flex items-center justify-between">
						<div>
							<CardTitle className="text-lg">Unschedulable Pods</CardTitle>
							<CardDescription>Pods that cannot be scheduled and why</CardDescription>
						</div>
						{onRefresh && (
							<Button
								variant="outline"
								size="sm"
								onClick={onRefresh}
								disabled={loading}
							>
								<IconRefresh className={`size-4 ${loading ? 'animate-spin' : ''}`} />
							</Button>
						)}
					</div>
				</CardHeader>
				<CardContent>
					<div className="flex items-center justify-center py-8 text-red-600">
						<IconAlertTriangle className="size-6 mr-2" />
						<span>Error: {error}</span>
					</div>
				</CardContent>
			</Card>
		)
	}

	return (
		<Card>
			<CardHeader className="pb-3">
				<div className="flex items-center justify-between">
					<div>
						<CardTitle className="text-lg">Unschedulable Pods</CardTitle>
						<CardDescription>
							{data.length === 0
								? "No unschedulable pods found - all pods are scheduling successfully"
								: `${data.length} pod${data.length === 1 ? '' : 's'} cannot be scheduled`
							}
						</CardDescription>
					</div>
					{onRefresh && (
						<Button
							variant="outline"
							size="sm"
							onClick={onRefresh}
							disabled={loading}
						>
							<IconRefresh className={`size-4 ${loading ? 'animate-spin' : ''}`} />
						</Button>
					)}
				</div>
			</CardHeader>
			<CardContent className="px-0">
				{data.length === 0 ? (
					<div className="flex items-center justify-center py-8 text-muted-foreground">
						<div className="text-center">
							<IconLoader className="size-8 mx-auto mb-2 text-green-600" />
							<div className="text-sm">All pods are scheduling successfully</div>
						</div>
					</div>
				) : (
					<div className="overflow-hidden rounded-lg border border-border/60 mx-6">
						<ScrollArea className="w-full">
							<Table>
								<TableHeader className="bg-muted/50">
									{/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
									{table.getHeaderGroups().map((headerGroup: any) => (
										<TableRow key={headerGroup.id}>
											{/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
											{headerGroup.headers.map((header: any) => (
												<TableHead key={header.id} className="h-12 px-4">
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
									{/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
									{table.getRowModel().rows.map((row: any) => (
										<TableRow
											key={row.id}
											className="hover:bg-muted/30 transition-colors"
										>
											{/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
											{row.getVisibleCells().map((cell: any) => (
												<TableCell key={cell.id} className="px-4">
													{flexRender(
														cell.column.columnDef.cell,
														cell.getContext()
													)}
												</TableCell>
											))}
										</TableRow>
									))}
								</TableBody>
							</Table>
							<ScrollBar orientation="horizontal" />
						</ScrollArea>
					</div>
				)}
			</CardContent>
		</Card>
	)
}

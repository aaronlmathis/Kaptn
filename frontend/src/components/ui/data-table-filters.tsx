"use client"

import * as React from "react"
import { IconPlus, IconTrash, IconLayoutColumns, IconChevronDown, IconDotsVertical } from "@tabler/icons-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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

export interface FilterOption {
	value: string
	label: string
	badge?: React.ReactNode
}

export interface BulkAction {
	id: string
	label: string
	icon: React.ReactNode
	action: () => void
	variant?: "default" | "destructive"
	disabled?: boolean
	requiresSelection?: boolean
}

export interface DataTableFiltersProps {
	// Search functionality
	globalFilter: string
	onGlobalFilterChange: (value: string) => void
	searchPlaceholder?: string

	// Type/category filter
	categoryFilter?: string
	onCategoryFilterChange?: (value: string) => void
	categoryLabel?: string
	categoryOptions?: FilterOption[]

	// Bulk actions
	selectedCount: number
	totalCount: number
	onBulkDelete?: () => void
	deleteLabel?: string

	// Custom bulk actions
	bulkActions?: BulkAction[]
	bulkActionsLabel?: string

	// New item creation
	onCreateNew?: () => void
	createLabel?: string
	createIcon?: React.ReactNode

	// Column visibility (table instance needed for this)
	table?: {
		getAllColumns: () => Array<{
			id: string
			accessorFn?: unknown
			getCanHide: () => boolean
			getIsVisible: () => boolean
			toggleVisibility: (value: boolean) => void
		}>
	}
	showColumnToggle?: boolean

	// Additional custom filters (slot for extra controls)
	children?: React.ReactNode

	// Layout options
	className?: string
}

export function DataTableFilters({
	globalFilter,
	onGlobalFilterChange,
	searchPlaceholder = "Search...",
	categoryFilter,
	onCategoryFilterChange,
	categoryLabel = "Filter by type",
	categoryOptions = [],
	selectedCount = 0,
	totalCount = 0,
	onBulkDelete,
	deleteLabel = "Delete",
	bulkActions = [],
	bulkActionsLabel = "Actions",
	onCreateNew,
	createLabel = "New Item",
	createIcon = <IconPlus className="size-4" />,
	table,
	showColumnToggle = true,
	children,
	className = "",
}: DataTableFiltersProps) {
	// Focus search on '/' key
	React.useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === '/' && !event.ctrlKey && !event.metaKey) {
				event.preventDefault()
				const searchInput = document.querySelector('input[placeholder*="Search"]') as HTMLInputElement
				searchInput?.focus()
			}
		}

		document.addEventListener('keydown', handleKeyDown)
		return () => document.removeEventListener('keydown', handleKeyDown)
	}, [])

	return (
		<div className={`space-y-3 ${className}`}>
			{/* All controls in a single responsive row */}
			<div className="flex flex-wrap flex-col md:flex-row items-start md:items-center justify-between gap-3">
				{/* Left side: Search and filters */}
				<div className="flex flex-wrap flex-col sm:flex-row items-start sm:items-center gap-2 w-full md:w-auto min-w-0">
					{/* Search Input */}
					<div className="w-full sm:w-auto flex-shrink-0">
						<Input
							placeholder={searchPlaceholder}
							value={globalFilter}
							onChange={(e) => onGlobalFilterChange(e.target.value)}
							className="w-full sm:w-56 md:w-64 lg:w-72"
						/>
					</div>

					{/* Category/Type Filter */}
					{categoryOptions.length > 0 && onCategoryFilterChange && (
						<Select value={categoryFilter} onValueChange={onCategoryFilterChange}>
							<SelectTrigger className="w-full sm:w-36 md:w-40 lg:w-44 flex-shrink-0">
								<SelectValue placeholder={categoryLabel} />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">All {categoryLabel.split(' ').pop()}</SelectItem>
								{categoryOptions.map((option) => (
									<SelectItem key={option.value} value={option.value}>
										<div className="flex items-center gap-2">
											{option.badge}
											<span>{option.label}</span>
										</div>
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					)}

					{/* Custom filter slot */}
					{children}
				</div>

				{/* Right side: Action buttons and controls */}
				<div className="flex items-center gap-2 w-full md:w-auto justify-between md:justify-end flex-shrink-0">
					{/* Selection count (mobile only) */}
					<div className="md:hidden">
						<p className="text-xs text-muted-foreground">
							{selectedCount} of {totalCount} selected
						</p>
					</div>

					<div className="flex items-center gap-1.5">
						{/* Custom Bulk Actions Dropdown */}
						{bulkActions.length > 0 && (
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button
										variant="outline"
										size="sm"
										className="gap-1.5 flex-shrink-0"
										disabled={selectedCount === 0 && bulkActions.every(action => action.requiresSelection !== false)}
									>
										<IconDotsVertical className="size-4" />
										<span className="hidden sm:inline">{bulkActionsLabel}</span>
										<IconChevronDown className="size-3" />
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="end" className="w-48">
									{bulkActions.map((action, index) => {
										const isDisabled = action.disabled || (action.requiresSelection !== false && selectedCount === 0)

										return (
											<React.Fragment key={action.id}>
												<DropdownMenuItem
													onClick={action.action}
													disabled={isDisabled}
													className={action.variant === "destructive" ? "text-red-600 focus:text-red-600" : ""}
												>
													{action.icon}
													<span className="ml-2">{action.label}</span>
												</DropdownMenuItem>
												{index < bulkActions.length - 1 && action.variant === "destructive" && (
													<DropdownMenuSeparator />
												)}
											</React.Fragment>
										)
									})}
								</DropdownMenuContent>
							</DropdownMenu>
						)}

						{/* Create New Button */}
						{onCreateNew && (
							<Button onClick={onCreateNew} size="sm" className="gap-1.5 flex-shrink-0">
								{createIcon}
								<span className="hidden sm:inline">{createLabel}</span>
							</Button>
						)}

						{/* Bulk Delete Button */}
						{onBulkDelete && (
							<AlertDialog>
								<AlertDialogTrigger asChild>
									<Button
										variant="outline"
										size="sm"
										disabled={selectedCount === 0}
										className="gap-1.5 text-red-600 flex-shrink-0"
										data-delete-trigger
									>
										<IconTrash className="size-4" />
										<span className="hidden sm:inline">
											{deleteLabel} ({selectedCount})
										</span>
										<span className="sm:hidden">({selectedCount})</span>
									</Button>
								</AlertDialogTrigger>
								<AlertDialogContent>
									<AlertDialogHeader>
										<AlertDialogTitle>
											{deleteLabel} {selectedCount} Item{selectedCount > 1 ? 's' : ''}
										</AlertDialogTitle>
										<AlertDialogDescription>
											Are you sure you want to delete {selectedCount} item{selectedCount > 1 ? 's' : ''}?
											This action cannot be undone and will permanently remove {selectedCount > 1 ? 'these items' : 'this item'}.
										</AlertDialogDescription>
									</AlertDialogHeader>
									<AlertDialogFooter>
										<AlertDialogCancel>Cancel</AlertDialogCancel>
										<AlertDialogAction
											onClick={onBulkDelete}
											className="bg-red-600 hover:bg-red-700 text-white"
										>
											{deleteLabel} Item{selectedCount > 1 ? 's' : ''}
										</AlertDialogAction>
									</AlertDialogFooter>
								</AlertDialogContent>
							</AlertDialog>
						)}

						{/* Column Visibility Toggle */}
						{showColumnToggle && table && (
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button variant="outline" size="sm" className="gap-1.5 flex-shrink-0">
										<IconLayoutColumns className="size-4" />
										<span className="hidden lg:inline">Columns</span>
										<IconChevronDown className="size-3" />
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
						)}
					</div>
				</div>
			</div>

			{/* Selection count (desktop only) */}
			{/* <div className="hidden md:block">
				<p className="text-xs text-muted-foreground">
					{selectedCount} of {totalCount} row(s) selected.
				</p>
			</div> */}
		</div>
	)
}

// Manual type definitions for react-table compatibility
import type { Table } from "@tanstack/react-table"

// Define the state types manually based on usage
export type VisibilityState = Record<string, boolean>
export type SortingState = Array<{
	id: string
	desc: boolean
}>
export type ColumnFiltersState = Array<{
	id: string
	value: unknown
}>

// Re-export other types that should exist
export type { ColumnDef, Row } from "@tanstack/react-table"
export {
	flexRender,
	getCoreRowModel,
	getFacetedRowModel,
	getFacetedUniqueValues,
	getFilteredRowModel,
	getPaginationRowModel,
	getSortedRowModel,
	useReactTable,
} from "@tanstack/react-table"

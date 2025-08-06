import * as React from "react"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { IconEdit, IconCircleCheckFilled, IconLoader, IconAlertTriangle, IconTrash } from "@tabler/icons-react"
import { useIsMobile } from "@/hooks/use-mobile"
import {
	Drawer,
	DrawerClose,
	DrawerContent,
	DrawerDescription,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
} from "@/components/ui/drawer"
import { DetailRows } from "@/components/ResourceDetailDrawer"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { ResourceYamlEditor } from "@/components/ResourceYamlEditor"
import { useNamespaceDetails } from "@/hooks/use-resource-details"

// Import the namespace schema from the main data table component
import { namespaceSchema } from "@/components/pages/NamespacesDataTable"

function getStatusBadge(status: string) {
	switch (status) {
		case "Active":
			return (
				<Badge variant="outline" className="text-green-600 border-border bg-transparent px-1.5">
					<IconCircleCheckFilled className="size-3 fill-green-600 mr-1" />
					{status}
				</Badge>
			)
		case "Terminating":
			return (
				<Badge variant="outline" className="text-yellow-600 border-border bg-transparent px-1.5">
					<IconLoader className="size-3 text-yellow-600 mr-1" />
					{status}
				</Badge>
			)
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

interface NamespaceDetailDrawerProps {
	item: z.infer<typeof namespaceSchema>
	open: boolean
	onOpenChange: (open: boolean) => void
}

// Delete namespace function
async function deleteNamespace(name: string): Promise<boolean> {
	try {
		const response = await fetch(`/api/v1/namespaces/${name}`, {
			method: 'DELETE',
		});
		const result = await response.json();
		return result.success === true;
	} catch (error) {
		console.error('Failed to delete namespace:', error);
		return false;
	}
}

/**
 * Controlled NamespaceDetailDrawer that can be opened programmatically.
 * This shows full namespace details from the detailed API endpoint instead of the condensed version.
 */
export function NamespaceDetailDrawer({ item, open, onOpenChange }: NamespaceDetailDrawerProps) {
	const isMobile = useIsMobile()

	// Fetch detailed namespace information
	const { data: namespaceDetails, loading, error } = useNamespaceDetails(item.name, open)

	const handleDeleteNamespace = async () => {
		if (confirm(`Are you sure you want to delete namespace "${item.name}"? This action cannot be undone.`)) {
			const success = await deleteNamespace(item.name)
			if (success) {
				// Close the drawer and potentially trigger a refresh of parent data
				onOpenChange(false)
				// You may want to add a callback prop to trigger parent data refresh
				window.location.reload() // Simple approach for now
			} else {
				alert('Failed to delete namespace. Please try again.')
			}
		}
	}

	// Basic rows from summary data (available immediately)
	const basicRows: Array<[string, React.ReactNode]> = [
		["Namespace Name", item.name],
		["Status", getStatusBadge(item.status)],
		["Age", <div className="font-mono text-sm">{item.age}</div>],
		["Labels", <div className="text-sm">{item.labelsCount} label(s)</div>],
		["Annotations", <div className="text-sm">{item.annotationsCount} annotation(s)</div>],
	]

	// Additional detailed rows from API (when available)
	const detailedRows: Array<[string, React.ReactNode]> = React.useMemo(() => {
		if (!namespaceDetails) return []

		const additionalRows: Array<[string, React.ReactNode]> = []

		// Add additional details from the full namespace spec and status
		if (namespaceDetails.metadata?.creationTimestamp) {
			additionalRows.push(["Creation Timestamp", <div className="font-mono text-sm">{new Date(namespaceDetails.metadata.creationTimestamp as string).toLocaleString()}</div>])
		}

		if (namespaceDetails.metadata?.uid) {
			additionalRows.push(["UID", <div className="font-mono text-sm break-all">{namespaceDetails.metadata.uid as string}</div>])
		}

		if (namespaceDetails.spec?.finalizers && Array.isArray(namespaceDetails.spec.finalizers)) {
			const finalizersCount = (namespaceDetails.spec.finalizers as string[]).length
			additionalRows.push(["Finalizers", <div className="text-sm">{finalizersCount} finalizer(s)</div>])
		}

		// Show some common labels if they exist
		if (namespaceDetails.summary?.labels) {
			const labels = namespaceDetails.summary.labels as Record<string, string>
			if (labels['kubernetes.io/managed-by']) {
				additionalRows.push(["Managed By", <div className="font-mono text-sm">{labels['kubernetes.io/managed-by']}</div>])
			}
			if (labels['name'] && labels['name'] !== item.name) {
				additionalRows.push(["Display Name", <div className="font-mono text-sm">{labels['name']}</div>])
			}
		}

		return additionalRows
	}, [namespaceDetails, item.name])

	// Combine basic and detailed rows
	const allRows = [...basicRows, ...detailedRows]

	const actions = (
		<>
			<ResourceYamlEditor
				resourceName={item.name}
				namespace=""
				resourceKind="Namespace"
			>
				<Button variant="outline" size="sm" className="w-full">
					<IconEdit className="size-4 mr-2" />
					Edit YAML
				</Button>
			</ResourceYamlEditor>
			<Button
				variant="destructive"
				size="sm"
				className="w-full"
				onClick={handleDeleteNamespace}
			>
				<IconTrash className="size-4 mr-2" />
				Delete Namespace
			</Button>
		</>
	)

	return (
		<Drawer direction={isMobile ? "bottom" : "right"} open={open} onOpenChange={onOpenChange}>
			<DrawerContent className="flex flex-col h-full">
				{/* Header with title/description */}
				<DrawerHeader className="flex justify-between items-start flex-shrink-0">
					<div className="space-y-1">
						<DrawerTitle>{item.name}</DrawerTitle>
						<DrawerDescription>
							{loading ? "Loading detailed namespace information..." : "Full namespace details and configuration"}
						</DrawerDescription>
					</div>
				</DrawerHeader>

				{/* Content area with styled scrolling */}
				<ScrollArea className="flex-1 min-h-0">
					<div className="px-6 text-sm">
						{error ? (
							<div className="text-red-600 p-4 text-sm">
								⚠️ Failed to load detailed information: {error}
								<div className="mt-2 text-muted-foreground">
									Showing basic information from summary data.
								</div>
							</div>
						) : null}

						<DetailRows rows={allRows} />

						{loading && (
							<div className="flex items-center justify-center py-4 text-muted-foreground">
								<IconLoader className="size-4 animate-spin mr-2" />
								Loading detailed information...
							</div>
						)}
					</div>
					<ScrollBar orientation="vertical" />
				</ScrollArea>

				{/* Footer with actions */}
				<DrawerFooter className="flex flex-col gap-2 px-6 pb-6 pt-4 flex-shrink-0">
					{actions}
					<DrawerClose asChild>
						<Button variant="outline" size="sm" className="w-full">
							Close
						</Button>
					</DrawerClose>
				</DrawerFooter>
			</DrawerContent>
		</Drawer>
	)
}

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { IconEdit, IconEye, IconLoader } from "@tabler/icons-react"
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
import { useConfigMapDetails } from "@/hooks/use-resource-details"
import { type DashboardConfigMap } from "@/lib/k8s-storage"

interface ConfigMapDetailDrawerProps {
	item: DashboardConfigMap
	open: boolean
	onOpenChange: (open: boolean) => void
}

/**
 * Controlled ConfigMapDetailDrawer that can be opened programmatically.
 * This shows full ConfigMap details from the detailed API endpoint.
 */
export function ConfigMapDetailDrawer({ item, open, onOpenChange }: ConfigMapDetailDrawerProps) {
	const isMobile = useIsMobile()

	// Fetch detailed config map information
	const { data: configMapDetails, loading, error } = useConfigMapDetails(item.namespace, item.name, open)

	// Basic rows from summary data (available immediately)
	const basicRows: Array<[string, React.ReactNode]> = [
		["ConfigMap Name", item.name],
		["Namespace", (
			<Badge variant="outline" className="text-muted-foreground px-1.5">
				{item.namespace}
			</Badge>
		)],
		["Data Keys", <div className="font-mono text-sm">{item.dataKeysCount}</div>],
		["Data Size", <div className="font-mono text-sm">{item.dataSize}</div>],
		["Labels", <div className="text-sm">{item.labelsCount} label(s)</div>],
		["Annotations", <div className="text-sm">{item.annotationsCount} annotation(s)</div>],
		["Age", <div className="font-mono text-sm">{item.age}</div>],
	]

	// Additional detailed rows from API (when available)
	const detailedRows: Array<[string, React.ReactNode]> = React.useMemo(() => {
		if (!configMapDetails) return []

		const additionalRows: Array<[string, React.ReactNode]> = []

		// Add additional details from the full config map metadata
		if (configMapDetails.metadata && typeof configMapDetails.metadata === 'object') {
			const metadata = configMapDetails.metadata as Record<string, unknown>

			if (metadata.uid) {
				additionalRows.push(["UID", <div className="font-mono text-xs">{String(metadata.uid)}</div>])
			}

			if (metadata.resourceVersion) {
				additionalRows.push(["Resource Version", <div className="font-mono text-xs">{String(metadata.resourceVersion)}</div>])
			}
		}

		// Add details from the config map data
		if (configMapDetails.spec && typeof configMapDetails.spec === 'object') {
			const dataSpec = configMapDetails.spec as Record<string, unknown>

			// Show individual data keys and their sizes
			Object.entries(dataSpec).forEach(([key, value], index) => {
				if (typeof value === 'string') {
					const valueSize = value.length
					let sizeStr = `${valueSize} B`
					if (valueSize > 1024) {
						sizeStr = `${(valueSize / 1024).toFixed(1)} KB`
					}
					additionalRows.push([`Data Key ${index + 1}`, (
						<div className="space-y-1">
							<div className="font-mono text-sm font-medium">{key}</div>
							<div className="text-xs text-muted-foreground">{sizeStr}</div>
						</div>
					)])
				}
			})
		}

		// Add details from the summary data
		if (configMapDetails.summary && typeof configMapDetails.summary === 'object') {
			const summary = configMapDetails.summary as Record<string, unknown>

			if (summary.dataKeys && Array.isArray(summary.dataKeys)) {
				const dataKeys = summary.dataKeys as string[]
				if (dataKeys.length > 0) {
					additionalRows.push(["All Data Keys", (
						<div className="space-y-1">
							{dataKeys.map((key, index) => (
								<div key={index} className="font-mono text-sm">
									{key}
								</div>
							))}
						</div>
					)])
				}
			}
		}

		return additionalRows
	}, [configMapDetails])

	// Combine basic and detailed rows
	const allRows = [...basicRows, ...detailedRows]

	const actions = (
		<>
			<Button
				size="sm"
				className="w-full"
				onClick={() => {
					// TODO: Implement ConfigMap details functionality
					console.log('Show ConfigMap details:', item.name, 'in namespace:', item.namespace)
				}}
			>
				<IconEye className="size-4 mr-2" />
				View Details
			</Button>
			<ResourceYamlEditor
				resourceName={item.name}
				namespace={item.namespace}
				resourceKind="ConfigMap"
			>
				<Button variant="outline" size="sm" className="w-full">
					<IconEdit className="size-4 mr-2" />
					Edit YAML
				</Button>
			</ResourceYamlEditor>
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
							{loading ? "Loading detailed ConfigMap information..." : "Full ConfigMap details and configuration"}
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

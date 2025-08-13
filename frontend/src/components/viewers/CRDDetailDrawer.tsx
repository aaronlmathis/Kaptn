import * as React from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { IconEdit, IconCircleCheckFilled, IconLoader, IconEye, IconCheck, IconCircleX, IconClock } from "@tabler/icons-react"
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
import { useCRDDetails } from "@/hooks/use-resource-details"
import { type CRDTableRow } from "@/types/crd"

function getCRDStatusBadge(status: string) {
	switch (status) {
		case "Established":
			return (
				<Badge variant="outline" className="text-green-600 border-border bg-transparent px-1.5">
					<IconCheck className="size-3 mr-1" />
					{status}
				</Badge>
			)
		case "Not Ready":
			return (
				<Badge variant="outline" className="text-red-600 border-border bg-transparent px-1.5">
					<IconCircleX className="size-3 mr-1" />
					{status}
				</Badge>
			)
		case "Terminating":
			return (
				<Badge variant="outline" className="text-orange-600 border-border bg-transparent px-1.5">
					<IconClock className="size-3 mr-1" />
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

function getCRDScopeBadge(scope: string) {
	switch (scope) {
		case "Namespaced":
			return (
				<Badge variant="outline" className="text-blue-600 border-border bg-transparent px-1.5">
					<IconCircleCheckFilled className="size-3 fill-blue-600 mr-1" />
					{scope}
				</Badge>
			)
		case "Cluster":
			return (
				<Badge variant="outline" className="text-purple-600 border-border bg-transparent px-1.5">
					<IconCircleCheckFilled className="size-3 fill-purple-600 mr-1" />
					{scope}
				</Badge>
			)
		default:
			return (
				<Badge variant="outline" className="text-muted-foreground border-border bg-transparent px-1.5">
					{scope}
				</Badge>
			)
	}
}

interface CRDDetailDrawerProps {
	item: CRDTableRow
	open: boolean
	onOpenChange: (open: boolean) => void
}

/**
 * Controlled CRDDetailDrawer that can be opened programmatically.
 * This shows full CRD details from the detailed API endpoint instead of the condensed version.
 */
export function CRDDetailDrawer({ item, open, onOpenChange }: CRDDetailDrawerProps) {
	const isMobile = useIsMobile()

	// Fetch detailed CRD information
	const { data: crdDetails, loading, error } = useCRDDetails(item.name, open)

	// Basic rows from summary data (available immediately)
	const basicRows: Array<[string, React.ReactNode]> = [
		["Name", item.name],
		["API Group", <div className="font-mono text-sm">{item.group}</div>],
		["Kind", (
			<Badge variant="secondary" className="px-1.5">
				{item.kind}
			</Badge>
		)],
		["Plural", <div className="font-mono text-sm">{item.plural}</div>],
		["Singular", <div className="font-mono text-sm">{item.singular}</div>],
		["Scope", getCRDScopeBadge(item.scope)],
		["Status", getCRDStatusBadge(item.status)],
		["Versions", (
			<div className="font-mono text-sm">
				{item.versions.length > 0 ? item.versions.join(", ") : "None"}
			</div>
		)],
		["Age", <div className="font-mono text-sm">{item.age}</div>],
	]

	// Additional detailed rows from API (when available)
	const detailedRows: Array<[string, React.ReactNode]> = React.useMemo(() => {
		if (!crdDetails) return []

		const additionalRows: Array<[string, React.ReactNode]> = []

		// Add additional details from the full CRD spec and status
		if (crdDetails.metadata?.labels) {
			const labelCount = Object.keys(crdDetails.metadata.labels).length
			additionalRows.push(["Labels", <div className="text-sm">{labelCount} label(s)</div>])
		}

		if (crdDetails.metadata?.annotations) {
			const annotationCount = Object.keys(crdDetails.metadata.annotations).length
			additionalRows.push(["Annotations", <div className="text-sm">{annotationCount} annotation(s)</div>])
		}

		if (crdDetails.spec?.names?.shortNames && crdDetails.spec.names.shortNames.length > 0) {
			additionalRows.push(["Short Names", (
				<div className="font-mono text-sm">
					{crdDetails.spec.names.shortNames.join(", ")}
				</div>
			)])
		}

		if (crdDetails.spec?.names?.categories && crdDetails.spec.names.categories.length > 0) {
			additionalRows.push(["Categories", (
				<div className="font-mono text-sm">
					{crdDetails.spec.names.categories.join(", ")}
				</div>
			)])
		}

		if (crdDetails.spec?.versions) {
			const servedVersions = crdDetails.spec.versions.filter(v => v.served).map(v => v.name)
			const storageVersions = crdDetails.spec.versions.filter(v => v.storage).map(v => v.name)

			if (servedVersions.length > 0) {
				additionalRows.push(["Served Versions", (
					<div className="font-mono text-sm">{servedVersions.join(", ")}</div>
				)])
			}

			if (storageVersions.length > 0) {
				additionalRows.push(["Storage Versions", (
					<div className="font-mono text-sm">{storageVersions.join(", ")}</div>
				)])
			}
		}

		if (crdDetails.status?.conditions) {
			const establishedCondition = crdDetails.status.conditions.find(c => c.type === "Established")
			const namesAcceptedCondition = crdDetails.status.conditions.find(c => c.type === "NamesAccepted")

			if (establishedCondition) {
				additionalRows.push(["Established", (
					<div className="text-sm">
						{establishedCondition.status === "True" ? "✓ Yes" : "✗ No"}
						{establishedCondition.message && (
							<div className="text-xs text-muted-foreground mt-1">
								{establishedCondition.message}
							</div>
						)}
					</div>
				)])
			}

			if (namesAcceptedCondition) {
				additionalRows.push(["Names Accepted", (
					<div className="text-sm">
						{namesAcceptedCondition.status === "True" ? "✓ Yes" : "✗ No"}
						{namesAcceptedCondition.message && (
							<div className="text-xs text-muted-foreground mt-1">
								{namesAcceptedCondition.message}
							</div>
						)}
					</div>
				)])
			}
		}

		if (crdDetails.spec?.conversion) {
			additionalRows.push(["Conversion Strategy", (
				<div className="font-mono text-sm">{crdDetails.spec.conversion.strategy}</div>
			)])
		}

		return additionalRows
	}, [crdDetails])

	// Combine basic and detailed rows
	const allRows = [...basicRows, ...detailedRows]

	const actions = (
		<>
			<Button
				size="sm"
				className="w-full"
				onClick={() => {
					// TODO: Implement view custom resources functionality
					console.log('View custom resources for CRD:', item.name)
				}}
			>
				<IconEye className="size-4 mr-2" />
				View Custom Resources
			</Button>
			<ResourceYamlEditor
				resourceName={item.name}
				namespace=""
				resourceKind="CustomResourceDefinition"
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
							{loading ? "Loading detailed CRD information..." : "Full Custom Resource Definition details and configuration"}
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

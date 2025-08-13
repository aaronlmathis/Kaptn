import * as React from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { IconEdit, IconCircleCheckFilled, IconLoader, IconEye, IconShield } from "@tabler/icons-react"
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
import { type DashboardClusterRole, getClusterRole } from "@/lib/k8s-cluster-rbac"

function getClusterRoleRulesBadge(rulesCount: number) {
	if (rulesCount === 0) {
		return (
			<Badge variant="outline" className="text-gray-600 border-border bg-transparent px-1.5">
				<IconCircleCheckFilled className="size-3 fill-gray-600 mr-1" />
				No rules
			</Badge>
		)
	} else if (rulesCount === 1) {
		return (
			<Badge variant="outline" className="text-blue-600 border-border bg-transparent px-1.5">
				<IconShield className="size-3 mr-1" />
				1 rule
			</Badge>
		)
	} else {
		return (
			<Badge variant="outline" className="text-green-600 border-border bg-transparent px-1.5">
				<IconShield className="size-3 mr-1" />
				{rulesCount} rules
			</Badge>
		)
	}
}

interface ClusterRoleDetailDrawerProps {
	item: DashboardClusterRole
	open: boolean
	onOpenChange: (open: boolean) => void
}

/**
 * Controlled ClusterRoleDetailDrawer that can be opened programmatically.
 * This shows full cluster role details from the detailed API endpoint instead of the condensed version.
 */
export function ClusterRoleDetailDrawer({ item, open, onOpenChange }: ClusterRoleDetailDrawerProps) {
	const isMobile = useIsMobile()
	const [clusterRoleDetails, setClusterRoleDetails] = React.useState<Awaited<ReturnType<typeof getClusterRole>> | null>(null)
	const [loading, setLoading] = React.useState(false)
	const [error, setError] = React.useState<string | null>(null)

	// Fetch detailed cluster role information when drawer opens
	React.useEffect(() => {
		if (!open || !item.name) return

		const fetchClusterRoleDetails = async () => {
			setLoading(true)
			setError(null)
			try {
				const details = await getClusterRole(item.name)
				setClusterRoleDetails(details)
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Failed to load cluster role details')
			} finally {
				setLoading(false)
			}
		}

		fetchClusterRoleDetails()
	}, [open, item.name])

	// Basic rows from summary data (available immediately)
	const basicRows: Array<[string, React.ReactNode]> = [
		["ClusterRole Name", item.name],
		["Scope", (
			<Badge variant="outline" className="text-blue-600 border-border bg-transparent px-1.5">
				Cluster-wide
			</Badge>
		)],
		["Rules", getClusterRoleRulesBadge(item.rules)],
		["Age", <div className="font-mono text-sm">{item.age}</div>],
	]

	// Additional detailed rows from API (when available)
	const detailedRows: Array<[string, React.ReactNode]> = React.useMemo(() => {
		if (!clusterRoleDetails) return []

		const additionalRows: Array<[string, React.ReactNode]> = []

		// Add metadata details
		if (clusterRoleDetails.labels) {
			const labelCount = Object.keys(clusterRoleDetails.labels).length
			additionalRows.push(["Labels", <div className="text-sm">{labelCount} label(s)</div>])
		}

		if (clusterRoleDetails.annotations) {
			const annotationCount = Object.keys(clusterRoleDetails.annotations).length
			additionalRows.push(["Annotations", <div className="text-sm">{annotationCount} annotation(s)</div>])
		}

		if (clusterRoleDetails.uid) {
			additionalRows.push(["UID", <div className="font-mono text-sm text-xs">{clusterRoleDetails.uid}</div>])
		}

		if (clusterRoleDetails.resourceVersion) {
			additionalRows.push(["Resource Version", <div className="font-mono text-sm">{clusterRoleDetails.resourceVersion}</div>])
		}

		if (clusterRoleDetails.creationTimestamp) {
			const createdAt = new Date(clusterRoleDetails.creationTimestamp).toLocaleString()
			additionalRows.push(["Created", <div className="font-mono text-sm">{createdAt}</div>])
		}

		// For cluster roles, we only have basic rule information from the API response
		// The actual rules would need to be fetched from a different endpoint or included in the response
		additionalRows.push(["Rule Count", <div className="text-sm">{clusterRoleDetails.rules} rule(s)</div>])

		return additionalRows
	}, [clusterRoleDetails])

	// Combine basic and detailed rows
	const allRows = [...basicRows, ...detailedRows]

	const actions = (
		<>
			<Button
				size="sm"
				className="w-full"
				onClick={() => {
					// TODO: Implement cluster role permissions view functionality
					console.log('Show cluster role permissions:', item.name)
				}}
			>
				<IconEye className="size-4 mr-2" />
				Show Permissions
			</Button>
			<ResourceYamlEditor
				resourceName={item.name}
				namespace=""
				resourceKind="ClusterRole"
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
							{loading ? "Loading detailed cluster role information..." : "Full cluster role details and permissions"}
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

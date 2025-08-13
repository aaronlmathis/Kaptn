import * as React from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { IconEdit, IconCircleCheckFilled, IconLoader, IconEye, IconUsers, IconLink } from "@tabler/icons-react"
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
import { type DashboardClusterRoleBinding, getClusterRoleBinding } from "@/lib/k8s-cluster-rbac"

function getClusterRoleBindingSubjectsBadge(subjectsCount: number) {
	if (subjectsCount === 0) {
		return (
			<Badge variant="outline" className="text-gray-600 border-border bg-transparent px-1.5">
				<IconCircleCheckFilled className="size-3 fill-gray-600 mr-1" />
				No subjects
			</Badge>
		)
	} else if (subjectsCount === 1) {
		return (
			<Badge variant="outline" className="text-blue-600 border-border bg-transparent px-1.5">
				<IconUsers className="size-3 mr-1" />
				1 subject
			</Badge>
		)
	} else {
		return (
			<Badge variant="outline" className="text-green-600 border-border bg-transparent px-1.5">
				<IconUsers className="size-3 mr-1" />
				{subjectsCount} subjects
			</Badge>
		)
	}
}

interface ClusterRoleBindingDetailDrawerProps {
	item: DashboardClusterRoleBinding
	open: boolean
	onOpenChange: (open: boolean) => void
}

/**
 * Controlled ClusterRoleBindingDetailDrawer that can be opened programmatically.
 * This shows full cluster role binding details from the detailed API endpoint instead of the condensed version.
 */
export function ClusterRoleBindingDetailDrawer({ item, open, onOpenChange }: ClusterRoleBindingDetailDrawerProps) {
	const isMobile = useIsMobile()
	const [clusterRoleBindingDetails, setClusterRoleBindingDetails] = React.useState<Awaited<ReturnType<typeof getClusterRoleBinding>> | null>(null)
	const [loading, setLoading] = React.useState(false)
	const [error, setError] = React.useState<string | null>(null)

	// Fetch detailed cluster role binding information when drawer opens
	React.useEffect(() => {
		if (!open || !item.name) return

		const fetchClusterRoleBindingDetails = async () => {
			setLoading(true)
			setError(null)
			try {
				const details = await getClusterRoleBinding(item.name)
				setClusterRoleBindingDetails(details)
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Failed to load cluster role binding details')
			} finally {
				setLoading(false)
			}
		}

		fetchClusterRoleBindingDetails()
	}, [open, item.name])

	// Basic rows from summary data (available immediately)
	const basicRows: Array<[string, React.ReactNode]> = [
		["ClusterRoleBinding Name", item.name],
		["Scope", (
			<Badge variant="outline" className="text-blue-600 border-border bg-transparent px-1.5">
				Cluster-wide
			</Badge>
		)],
		["Role Reference", (
			<div className="flex items-center gap-1.5">
				<IconLink className="size-3 text-muted-foreground" />
				<div className="font-mono text-sm">{item.roleRef}</div>
			</div>
		)],
		["Subjects", getClusterRoleBindingSubjectsBadge(item.subjects)],
		["Age", <div className="font-mono text-sm">{item.age}</div>],
	]

	// Additional detailed rows from API (when available)
	const detailedRows: Array<[string, React.ReactNode]> = React.useMemo(() => {
		if (!clusterRoleBindingDetails) return []

		const additionalRows: Array<[string, React.ReactNode]> = []

		// Add metadata details
		if (clusterRoleBindingDetails.labels) {
			const labelCount = Object.keys(clusterRoleBindingDetails.labels).length
			additionalRows.push(["Labels", <div className="text-sm">{labelCount} label(s)</div>])
		}

		if (clusterRoleBindingDetails.annotations) {
			const annotationCount = Object.keys(clusterRoleBindingDetails.annotations).length
			additionalRows.push(["Annotations", <div className="text-sm">{annotationCount} annotation(s)</div>])
		}

		if (clusterRoleBindingDetails.uid) {
			additionalRows.push(["UID", <div className="font-mono text-sm text-xs">{clusterRoleBindingDetails.uid}</div>])
		}

		if (clusterRoleBindingDetails.resourceVersion) {
			additionalRows.push(["Resource Version", <div className="font-mono text-sm">{clusterRoleBindingDetails.resourceVersion}</div>])
		}

		if (clusterRoleBindingDetails.creationTimestamp) {
			const createdAt = new Date(clusterRoleBindingDetails.creationTimestamp).toLocaleString()
			additionalRows.push(["Created", <div className="font-mono text-sm">{createdAt}</div>])
		}

		// Add role reference details
		additionalRows.push(["Role Reference", <div className="font-mono text-sm">{clusterRoleBindingDetails.roleRef}</div>])

		// Add subjects details
		additionalRows.push(["Subject Count", <div className="text-sm">{clusterRoleBindingDetails.subjects} subject(s)</div>])

		return additionalRows
	}, [clusterRoleBindingDetails])

	// Combine basic and detailed rows
	const allRows = [...basicRows, ...detailedRows]

	const actions = (
		<>
			<Button
				size="sm"
				className="w-full"
				onClick={() => {
					// TODO: Implement cluster role binding subjects view functionality
					console.log('Show cluster role binding subjects:', item.name)
				}}
			>
				<IconEye className="size-4 mr-2" />
				Show Subjects
			</Button>
			<ResourceYamlEditor
				resourceName={item.name}
				namespace=""
				resourceKind="ClusterRoleBinding"
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
							{loading ? "Loading detailed cluster role binding information..." : "Full cluster role binding details and subject mappings"}
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

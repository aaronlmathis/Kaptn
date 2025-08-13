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
import { type DashboardRoleBinding, getRoleBinding } from "@/lib/k8s-rbac"

function getRoleBindingSubjectsBadge(subjectsCount: number) {
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

interface RoleBindingDetailDrawerProps {
	item: DashboardRoleBinding & { namespace: string }
	open: boolean
	onOpenChange: (open: boolean) => void
}

/**
 * Controlled RoleBindingDetailDrawer that can be opened programmatically.
 * This shows full role binding details from the detailed API endpoint instead of the condensed version.
 */
export function RoleBindingDetailDrawer({ item, open, onOpenChange }: RoleBindingDetailDrawerProps) {
	const isMobile = useIsMobile()
	const [roleBindingDetails, setRoleBindingDetails] = React.useState<Awaited<ReturnType<typeof getRoleBinding>> | null>(null)
	const [loading, setLoading] = React.useState(false)
	const [error, setError] = React.useState<string | null>(null)

	// Fetch detailed role binding information when drawer opens
	React.useEffect(() => {
		if (!open || !item.name || !item.namespace) return

		const fetchRoleBindingDetails = async () => {
			setLoading(true)
			setError(null)
			try {
				const details = await getRoleBinding(item.namespace, item.name)
				setRoleBindingDetails(details)
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Failed to load role binding details')
			} finally {
				setLoading(false)
			}
		}

		fetchRoleBindingDetails()
	}, [open, item.name, item.namespace])

	// Basic rows from summary data (available immediately)
	const basicRows: Array<[string, React.ReactNode]> = [
		["RoleBinding Name", item.name],
		["Namespace", (
			<Badge variant="outline" className="text-muted-foreground px-1.5">
				{item.namespace}
			</Badge>
		)],
		["Role Reference", (
			<div className="flex items-center gap-1.5">
				<IconLink className="size-3 text-muted-foreground" />
				<div className="font-mono text-sm">{item.roleRef}</div>
			</div>
		)],
		["Subjects", getRoleBindingSubjectsBadge(item.subjects)],
		["Age", <div className="font-mono text-sm">{item.age}</div>],
	]

	// Additional detailed rows from API (when available)
	const detailedRows: Array<[string, React.ReactNode]> = React.useMemo(() => {
		if (!roleBindingDetails) return []

		const additionalRows: Array<[string, React.ReactNode]> = []

		// Add metadata details
		if (roleBindingDetails.metadata?.labels) {
			const labelCount = Object.keys(roleBindingDetails.metadata.labels as Record<string, unknown>).length
			additionalRows.push(["Labels", <div className="text-sm">{labelCount} label(s)</div>])
		}

		if (roleBindingDetails.metadata?.annotations) {
			const annotationCount = Object.keys(roleBindingDetails.metadata.annotations as Record<string, unknown>).length
			additionalRows.push(["Annotations", <div className="text-sm">{annotationCount} annotation(s)</div>])
		}

		if (roleBindingDetails.metadata?.uid) {
			additionalRows.push(["UID", <div className="font-mono text-sm text-xs">{String(roleBindingDetails.metadata.uid)}</div>])
		}

		if (roleBindingDetails.metadata?.resourceVersion) {
			additionalRows.push(["Resource Version", <div className="font-mono text-sm">{String(roleBindingDetails.metadata.resourceVersion)}</div>])
		}

		if (roleBindingDetails.metadata?.creationTimestamp) {
			const createdAt = new Date(String(roleBindingDetails.metadata.creationTimestamp)).toLocaleString()
			additionalRows.push(["Created", <div className="font-mono text-sm">{createdAt}</div>])
		}

		// Add role reference details
		if (roleBindingDetails.roleRef) {
			const roleRef = roleBindingDetails.roleRef as Record<string, unknown>
			additionalRows.push(["Role Kind", <div className="font-mono text-sm">{String(roleRef.kind || 'Unknown')}</div>])
			additionalRows.push(["Role Name", <div className="font-mono text-sm">{String(roleRef.name || 'Unknown')}</div>])
			if (roleRef.apiGroup) {
				additionalRows.push(["Role API Group", <div className="font-mono text-sm">{String(roleRef.apiGroup)}</div>])
			}
		}

		// Add subjects details
		if (roleBindingDetails.subjects && Array.isArray(roleBindingDetails.subjects)) {
			const subjects = roleBindingDetails.subjects as Array<Record<string, unknown>>
			additionalRows.push(["Subject Count", <div className="text-sm">{subjects.length} subject(s)</div>])

			// Show detailed subject information
			subjects.forEach((subject, index) => {
				additionalRows.push([`Subject ${index + 1}`, <div className="text-sm font-medium text-blue-600">Subject Details</div>])

				const kind = String(subject.kind || 'Unknown')
				const name = String(subject.name || 'Unknown')
				const namespace = subject.namespace ? String(subject.namespace) : null

				additionalRows.push([`  Kind`, <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">{kind}</Badge>])
				additionalRows.push([`  Name`, <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">{name}</Badge>])

				if (namespace) {
					additionalRows.push([`  Namespace`, <Badge variant="outline" className="text-xs bg-orange-50 text-orange-700 border-orange-200">{namespace}</Badge>])
				}

				if (subject.apiGroup) {
					additionalRows.push([`  API Group`, <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200">{String(subject.apiGroup)}</Badge>])
				}

				// Add a separator between subjects if there are multiple
				if (index < subjects.length - 1) {
					additionalRows.push([" ", <hr className="my-2 border-border" />])
				}
			})
		}

		return additionalRows
	}, [roleBindingDetails])

	// Combine basic and detailed rows
	const allRows = [...basicRows, ...detailedRows]

	const actions = (
		<>
			<Button
				size="sm"
				className="w-full"
				onClick={() => {
					// TODO: Implement role binding subjects view functionality
					console.log('Show role binding subjects:', item.name, 'in namespace:', item.namespace)
				}}
			>
				<IconEye className="size-4 mr-2" />
				Show Subjects
			</Button>
			<ResourceYamlEditor
				resourceName={item.name}
				namespace={item.namespace}
				resourceKind="RoleBinding"
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
							{loading ? "Loading detailed role binding information..." : "Full role binding details and subject mappings"}
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

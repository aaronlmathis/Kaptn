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
import { type DashboardRole, getRole } from "@/lib/k8s-rbac"

function getRoleRulesBadge(rulesCount: number) {
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

interface RoleDetailDrawerProps {
	item: DashboardRole & { namespace: string }
	open: boolean
	onOpenChange: (open: boolean) => void
}

/**
 * Controlled RoleDetailDrawer that can be opened programmatically.
 * This shows full role details from the detailed API endpoint instead of the condensed version.
 */
export function RoleDetailDrawer({ item, open, onOpenChange }: RoleDetailDrawerProps) {
	const isMobile = useIsMobile()
	const [roleDetails, setRoleDetails] = React.useState<Awaited<ReturnType<typeof getRole>> | null>(null)
	const [loading, setLoading] = React.useState(false)
	const [error, setError] = React.useState<string | null>(null)

	// Fetch detailed role information when drawer opens
	React.useEffect(() => {
		if (!open || !item.name || !item.namespace) return

		const fetchRoleDetails = async () => {
			setLoading(true)
			setError(null)
			try {
				const details = await getRole(item.namespace, item.name)
				setRoleDetails(details)
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Failed to load role details')
			} finally {
				setLoading(false)
			}
		}

		fetchRoleDetails()
	}, [open, item.name, item.namespace])

	// Basic rows from summary data (available immediately)
	const basicRows: Array<[string, React.ReactNode]> = [
		["Role Name", item.name],
		["Namespace", (
			<Badge variant="outline" className="text-muted-foreground px-1.5">
				{item.namespace}
			</Badge>
		)],
		["Rules", getRoleRulesBadge(item.rules)],
		["Age", <div className="font-mono text-sm">{item.age}</div>],
	]

	// Additional detailed rows from API (when available)
	const detailedRows: Array<[string, React.ReactNode]> = React.useMemo(() => {
		if (!roleDetails) return []

		const additionalRows: Array<[string, React.ReactNode]> = []

		// Add metadata details
		if (roleDetails.metadata?.labels) {
			const labelCount = Object.keys(roleDetails.metadata.labels as Record<string, unknown>).length
			additionalRows.push(["Labels", <div className="text-sm">{labelCount} label(s)</div>])
		}

		if (roleDetails.metadata?.annotations) {
			const annotationCount = Object.keys(roleDetails.metadata.annotations as Record<string, unknown>).length
			additionalRows.push(["Annotations", <div className="text-sm">{annotationCount} annotation(s)</div>])
		}

		if (roleDetails.metadata?.uid) {
			additionalRows.push(["UID", <div className="font-mono text-sm text-xs">{String(roleDetails.metadata.uid)}</div>])
		}

		if (roleDetails.metadata?.resourceVersion) {
			additionalRows.push(["Resource Version", <div className="font-mono text-sm">{String(roleDetails.metadata.resourceVersion)}</div>])
		}

		if (roleDetails.metadata?.creationTimestamp) {
			const createdAt = new Date(String(roleDetails.metadata.creationTimestamp)).toLocaleString()
			additionalRows.push(["Created", <div className="font-mono text-sm">{createdAt}</div>])
		}

		// Add rule details
		if (roleDetails.spec?.rules && Array.isArray(roleDetails.spec.rules)) {
			const rules = roleDetails.spec.rules as Array<Record<string, unknown>>
			additionalRows.push(["Rule Count", <div className="text-sm">{rules.length} rule(s)</div>])

			// Show detailed rule information
			rules.forEach((rule, index) => {
				const apiGroups = Array.isArray(rule.apiGroups) ? (rule.apiGroups as string[]).join(', ') : ''
				const resources = Array.isArray(rule.resources) ? (rule.resources as string[]).join(', ') : ''
				const verbs = Array.isArray(rule.verbs) ? (rule.verbs as string[]).join(', ') : ''

				const ruleDisplay = `${apiGroups || '*'}/${resources || '*'} [${verbs || '*'}]`
				additionalRows.push([`Rule ${index + 1}`, <div className="font-mono text-sm">{ruleDisplay}</div>])

				if (rule.resourceNames && Array.isArray(rule.resourceNames) && rule.resourceNames.length > 0) {
					const resourceNames = (rule.resourceNames as string[]).join(', ')
					additionalRows.push([`  Resource Names`, <div className="font-mono text-sm text-muted-foreground">{resourceNames}</div>])
				}
			})
		}

		return additionalRows
	}, [roleDetails])

	// Combine basic and detailed rows
	const allRows = [...basicRows, ...detailedRows]

	const actions = (
		<>
			<Button
				size="sm"
				className="w-full"
				onClick={() => {
					// TODO: Implement role permissions view functionality
					console.log('Show role permissions:', item.name, 'in namespace:', item.namespace)
				}}
			>
				<IconEye className="size-4 mr-2" />
				Show Permissions
			</Button>
			<ResourceYamlEditor
				resourceName={item.name}
				namespace={item.namespace}
				resourceKind="Role"
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
							{loading ? "Loading detailed role information..." : "Full role details and permissions"}
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

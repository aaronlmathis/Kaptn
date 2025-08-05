import * as React from "react"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { IconEdit, IconCircleCheckFilled, IconLoader, IconAlertTriangle, IconRefresh, IconNetwork, IconEye } from "@tabler/icons-react"
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
import { useServiceDetails } from "@/hooks/use-resource-details"
import { loadBalancerSchema } from "@/lib/schemas/loadbalancer"

function getLoadBalancerStatusBadge(externalIP: string) {
	if (externalIP && externalIP !== '<none>' && externalIP !== '<pending>') {
		return (
			<Badge variant="outline" className="text-green-600 border-border bg-transparent px-1.5">
				<IconCircleCheckFilled className="size-3 fill-green-600 mr-1" />
				Active
			</Badge>
		)
	} else if (externalIP === '<pending>') {
		return (
			<Badge variant="outline" className="text-yellow-600 border-border bg-transparent px-1.5">
				<IconLoader className="size-3 text-yellow-600 mr-1" />
				Pending
			</Badge>
		)
	} else {
		return (
			<Badge variant="outline" className="text-red-600 border-border bg-transparent px-1.5">
				<IconAlertTriangle className="size-3 text-red-600 mr-1" />
				No External IP
			</Badge>
		)
	}
}

function getLoadBalancerTypeBadge() {
	return (
		<Badge variant="outline" className="text-purple-600 border-border bg-transparent px-1.5">
			<IconNetwork className="size-3 mr-1" />
			LoadBalancer
		</Badge>
	)
}

interface LoadBalancerDetailDrawerProps {
	item: z.infer<typeof loadBalancerSchema>
	open: boolean
	onOpenChange: (open: boolean) => void
}

/**
 * Controlled LoadBalancerDetailDrawer that can be opened programmatically.
 * This shows full LoadBalancer service details from the detailed API endpoint.
 */
export function LoadBalancerDetailDrawer({ item, open, onOpenChange }: LoadBalancerDetailDrawerProps) {
	const isMobile = useIsMobile()

	// Fetch detailed service information (LoadBalancers are services with type=LoadBalancer)
	const { data: serviceDetails, loading, error } = useServiceDetails(item.namespace, item.name, open)

	// Basic rows from summary data (available immediately)
	const basicRows: Array<[string, React.ReactNode]> = [
		["Load Balancer Name", item.name],
		["Namespace", (
			<Badge variant="outline" className="text-muted-foreground px-1.5">
				{item.namespace}
			</Badge>
		)],
		["Type", getLoadBalancerTypeBadge()],
		["Status", getLoadBalancerStatusBadge(item.externalIP)],
		["Cluster IP", <div className="font-mono text-sm">{item.clusterIP}</div>],
		["External IP", <div className="font-mono text-sm">{item.externalIP}</div>],
		["Ports", <div className="font-mono text-sm">{item.ports}</div>],
		["Age", <div className="font-mono text-sm">{item.age}</div>],
	]

	// Additional detailed rows from API (when available)
	const detailedRows: Array<[string, React.ReactNode]> = React.useMemo(() => {
		if (!serviceDetails) return []

		const additionalRows: Array<[string, React.ReactNode]> = []

		// Add additional details from the full service spec and status
		if (serviceDetails.metadata?.labels) {
			const labelCount = Object.keys(serviceDetails.metadata.labels as Record<string, unknown>).length
			additionalRows.push(["Labels", <div className="text-sm">{labelCount} label(s)</div>])
		}

		if (serviceDetails.metadata?.annotations) {
			const annotationCount = Object.keys(serviceDetails.metadata.annotations as Record<string, unknown>).length
			additionalRows.push(["Annotations", <div className="text-sm">{annotationCount} annotation(s)</div>])
		}

		if (serviceDetails.spec?.selector) {
			const selectorCount = Object.keys(serviceDetails.spec.selector as Record<string, unknown>).length
			additionalRows.push(["Selector", <div className="text-sm">{selectorCount} selector(s)</div>])
		}

		if (serviceDetails.spec?.sessionAffinity) {
			additionalRows.push(["Session Affinity", <div className="font-mono text-sm">{String(serviceDetails.spec.sessionAffinity)}</div>])
		}

		if (serviceDetails.spec?.loadBalancerSourceRanges) {
			const ranges = serviceDetails.spec.loadBalancerSourceRanges as string[]
			if (ranges && ranges.length > 0) {
				additionalRows.push(["Source Ranges", <div className="font-mono text-sm">{ranges.join(', ')}</div>])
			}
		}

		if (serviceDetails.spec?.ports && Array.isArray(serviceDetails.spec.ports)) {
			const ports = serviceDetails.spec.ports as Array<Record<string, unknown>>
			additionalRows.push(["Port Count", <div className="text-sm">{ports.length} port(s)</div>])

			// Show detailed port information
			ports.forEach((port, index) => {
				const portName = port.name as string || `Port ${index + 1}`
				const portDetails = `${port.port}/${port.protocol}${port.nodePort ? `:${port.nodePort}` : ''} → ${port.targetPort}`
				additionalRows.push([portName, <div className="font-mono text-sm">{portDetails}</div>])
			})
		}

		// LoadBalancer-specific status information
		if ((serviceDetails.status as Record<string, unknown>)?.loadBalancer &&
			typeof (serviceDetails.status as Record<string, unknown>)?.loadBalancer === 'object' &&
			(serviceDetails.status as Record<string, unknown>)?.loadBalancer !== null) {
			const loadBalancer = (serviceDetails.status as Record<string, unknown>).loadBalancer as Record<string, unknown>
			
			if (loadBalancer.ingress && Array.isArray(loadBalancer.ingress)) {
				const ingress = loadBalancer.ingress as Array<Record<string, unknown>>
				if (ingress.length > 0) {
					additionalRows.push(["Ingress Points", <div className="text-sm">{ingress.length} ingress point(s)</div>])
					
					ingress.forEach((ing, index) => {
						const ingressLabel = `Ingress ${index + 1}`
						const ingressDetails = []
						if (ing.ip) ingressDetails.push(`IP: ${ing.ip}`)
						if (ing.hostname) ingressDetails.push(`Hostname: ${ing.hostname}`)
						if (ing.ports && Array.isArray(ing.ports)) {
							const ports = ing.ports as Array<Record<string, unknown>>
							ingressDetails.push(`Ports: ${ports.map(p => `${p.port}/${p.protocol}`).join(', ')}`)
						}
						additionalRows.push([ingressLabel, <div className="font-mono text-sm">{ingressDetails.join(', ') || 'Unknown'}</div>])
					})
				}
			}
		}

		return additionalRows
	}, [serviceDetails])

	// Combine basic and detailed rows
	const allRows = [...basicRows, ...detailedRows]

	const actions = (
		<>
			<Button
				size="sm"
				className="w-full"
				onClick={() => {
					// TODO: Implement LoadBalancer ingress details functionality
					console.log('Show LoadBalancer ingress details:', item.name, 'in namespace:', item.namespace)
				}}
			>
				<IconEye className="size-4 mr-2" />
				View Ingress
			</Button>
			<ResourceYamlEditor
				resourceName={item.name}
				namespace={item.namespace}
				resourceKind="Service"
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
				onClick={() => {
					// TODO: Implement LoadBalancer restart functionality
					console.log('Restart LoadBalancer:', item.name, 'in namespace:', item.namespace)
				}}
			>
				<IconRefresh className="size-4 mr-2" />
				Restart
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
							{loading ? "Loading detailed LoadBalancer information..." : "Full LoadBalancer service details and configuration"}
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

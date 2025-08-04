import * as React from "react"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { IconEdit, IconRefresh } from "@tabler/icons-react"
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
import { useIngressDetails } from "@/hooks/use-resource-details"
import { ingressSchema } from "@/lib/schemas/ingress"

interface IngressDetailDrawerProps {
	item: z.infer<typeof ingressSchema>
	open: boolean
	onOpenChange: (open: boolean) => void
}

/**
 * Controlled IngressDetailDrawer that can be opened programmatically.
 * This shows full ingress details from the detailed API endpoint instead of the condensed version.
 */
export function IngressDetailDrawer({ item, open, onOpenChange }: IngressDetailDrawerProps) {
	const isMobile = useIsMobile()

	// Fetch detailed ingress information
	const { data: ingressDetails, loading, error } = useIngressDetails(item.namespace, item.name, open)

	// Basic rows from summary data (available immediately)
	const basicRows: Array<[string, React.ReactNode]> = [
		["Ingress Name", item.name],
		["Namespace", (
			<Badge variant="outline" className="text-muted-foreground px-1.5">
				{item.namespace}
			</Badge>
		)],
		["Age", <div className="font-mono text-sm">{item.age}</div>],
		["Ingress Class", <div className="text-sm">{item.ingressClass}</div>],
		["Hosts", (
			<div className="text-sm">
				{item.hosts.length > 0 ? (
					<div className="space-y-1">
						{item.hosts.map((host, index) => (
							<div key={index} className="font-mono text-xs">{host}</div>
						))}
					</div>
				) : (
					<span className="text-muted-foreground">No hosts configured</span>
				)}
			</div>
		)],
		["External IPs", (
			<div className="text-sm">
				{item.externalIPs.length > 0 ? (
					<div className="space-y-1">
						{item.externalIPs.map((ip, index) => (
							<div key={index} className="font-mono text-xs">{ip}</div>
						))}
					</div>
				) : (
					<span className="text-muted-foreground">No external IPs assigned</span>
				)}
			</div>
		)],
		["Paths", (
			<div className="text-sm">
				{item.paths.length > 0 ? (
					<div className="space-y-1">
						{item.paths.map((path, index) => (
							<div key={index} className="font-mono text-xs">{path}</div>
						))}
					</div>
				) : (
					<span className="text-muted-foreground">No specific paths configured</span>
				)}
			</div>
		)],
	]

	// Additional detailed rows from API (when available)
	const detailedRows: Array<[string, React.ReactNode]> = React.useMemo(() => {
		if (!ingressDetails) return []

		const additionalRows: Array<[string, React.ReactNode]> = []

		// Add additional details from the full ingress spec and status
		if (ingressDetails.metadata) {
			const metadata = ingressDetails.metadata as Record<string, unknown>

			if (metadata.labels && typeof metadata.labels === 'object') {
				const labels = metadata.labels as Record<string, unknown>
				const labelCount = Object.keys(labels).length
				additionalRows.push(["Labels", <div className="text-sm">{labelCount} label(s)</div>])
			}

			if (metadata.annotations && typeof metadata.annotations === 'object') {
				const annotations = metadata.annotations as Record<string, unknown>
				const annotationCount = Object.keys(annotations).length
				additionalRows.push(["Annotations", <div className="text-sm">{annotationCount} annotation(s)</div>])
			}
		}

		if (ingressDetails.spec) {
			const spec = ingressDetails.spec as Record<string, unknown>

			if (spec.rules && Array.isArray(spec.rules)) {
				const rulesCount = spec.rules.length
				additionalRows.push(["Rules", <div className="text-sm">{rulesCount} rule(s)</div>])
			}

			if (spec.tls && Array.isArray(spec.tls)) {
				const tlsCount = spec.tls.length
				additionalRows.push(["TLS", <div className="text-sm">{tlsCount} TLS configuration(s)</div>])
			}

			if (spec.defaultBackend) {
				additionalRows.push(["Default Backend", <div className="text-sm">Configured</div>])
			}
		}

		if (ingressDetails.status) {
			const status = ingressDetails.status as Record<string, unknown>

			if (status.loadBalancer && typeof status.loadBalancer === 'object') {
				const loadBalancer = status.loadBalancer as Record<string, unknown>
				if (loadBalancer.ingress && Array.isArray(loadBalancer.ingress)) {
					const ingressCount = loadBalancer.ingress.length
					additionalRows.push(["Load Balancer Status", (
						<div className="text-sm">
							{ingressCount > 0 ? `${ingressCount} ingress point(s)` : "No ingress points"}
						</div>
					)])
				}
			}
		}

		return additionalRows
	}, [ingressDetails])

	// Combine basic and detailed rows
	const allRows = [...basicRows, ...detailedRows]

	const actions = (
		<>
			<ResourceYamlEditor
				resourceName={item.name}
				namespace={item.namespace}
				resourceKind="Ingress"
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
					// TODO: Implement ingress restart functionality
					console.log('Restart ingress:', item.name, 'in namespace:', item.namespace)
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
							{loading ? "Loading detailed ingress information..." : "Full ingress details and configuration"}
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
								<div className="animate-spin rounded-full h-4 w-4 border-b-2 border-muted-foreground mr-2"></div>
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

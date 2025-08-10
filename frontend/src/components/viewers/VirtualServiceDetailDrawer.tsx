import * as React from "react"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { IconEdit, IconLoader, IconEye, IconRefresh } from "@tabler/icons-react"
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
import { virtualServiceSchema } from "@/types/virtual-service"

// Type for detailed virtual service response
interface VirtualServiceDetail {
	metadata?: {
		labels?: Record<string, string>
		annotations?: Record<string, string>
	}
	spec?: {
		http?: unknown[]
		tcp?: unknown[]
		tls?: unknown[]
		exportTo?: string[]
	}
}

// Hook to fetch detailed virtual service information
function useVirtualServiceDetails(namespace: string, name: string, enabled: boolean) {
	const [data, setData] = React.useState<VirtualServiceDetail | null>(null)
	const [loading, setLoading] = React.useState(false)
	const [error, setError] = React.useState<string | null>(null)

	React.useEffect(() => {
		if (!enabled) return

		const fetchDetails = async () => {
			setLoading(true)
			setError(null)
			try {
				const response = await fetch(`/api/v1/istio/virtualservices/${namespace}/${name}`)
				if (!response.ok) {
					throw new Error(`Failed to fetch virtual service details: ${response.statusText}`)
				}
				const result = await response.json()
				if (result.status === 'success') {
					setData(result.data)
				} else {
					throw new Error(result.error || 'Failed to fetch virtual service details')
				}
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Unknown error')
			} finally {
				setLoading(false)
			}
		}

		fetchDetails()
	}, [namespace, name, enabled])

	return { data, loading, error }
}

interface VirtualServiceDetailDrawerProps {
	item: z.infer<typeof virtualServiceSchema>
	open: boolean
	onOpenChange: (open: boolean) => void
}

/**
 * Controlled VirtualServiceDetailDrawer that can be opened programmatically.
 * This shows full virtual service details from the detailed API endpoint.
 */
export function VirtualServiceDetailDrawer({ item, open, onOpenChange }: VirtualServiceDetailDrawerProps) {
	const isMobile = useIsMobile()

	// Fetch detailed virtual service information
	const { data: virtualServiceDetails, loading, error } = useVirtualServiceDetails(item.namespace, item.name, open)

	// Basic rows from summary data (available immediately)
	const basicRows: Array<[string, React.ReactNode]> = [
		["Virtual Service Name", item.name],
		["Namespace", (
			<Badge variant="outline" className="text-muted-foreground px-1.5">
				{item.namespace}
			</Badge>
		)],
		["Hosts", (
			<div className="font-mono text-sm">
				{item.hosts.length > 0 ? item.hosts.join(", ") : "None"}
			</div>
		)],
		["Gateways", (
			<div className="font-mono text-sm">
				{item.gateways.length > 0 ? item.gateways.join(", ") : "None"}
			</div>
		)],
		["Age", <div className="font-mono text-sm">{item.age}</div>],
	]

	// Additional detailed rows from API (when available)
	const detailedRows: Array<[string, React.ReactNode]> = React.useMemo(() => {
		if (!virtualServiceDetails) return []

		const additionalRows: Array<[string, React.ReactNode]> = []

		// Add additional details from the full virtual service spec
		if (virtualServiceDetails.metadata?.labels) {
			const labelCount = Object.keys(virtualServiceDetails.metadata.labels).length
			additionalRows.push(["Labels", <div className="text-sm">{labelCount} label(s)</div>])
		}

		if (virtualServiceDetails.metadata?.annotations) {
			const annotationCount = Object.keys(virtualServiceDetails.metadata.annotations).length
			additionalRows.push(["Annotations", <div className="text-sm">{annotationCount} annotation(s)</div>])
		}

		if (virtualServiceDetails.spec?.http && Array.isArray(virtualServiceDetails.spec.http)) {
			const httpRoutes = virtualServiceDetails.spec.http.length
			additionalRows.push(["HTTP Routes", <div className="text-sm">{httpRoutes} HTTP routing rule(s)</div>])
		}

		if (virtualServiceDetails.spec?.tcp && Array.isArray(virtualServiceDetails.spec.tcp)) {
			const tcpRoutes = virtualServiceDetails.spec.tcp.length
			additionalRows.push(["TCP Routes", <div className="text-sm">{tcpRoutes} TCP routing rule(s)</div>])
		}

		if (virtualServiceDetails.spec?.tls && Array.isArray(virtualServiceDetails.spec.tls)) {
			const tlsRoutes = virtualServiceDetails.spec.tls.length
			additionalRows.push(["TLS Routes", <div className="text-sm">{tlsRoutes} TLS routing rule(s)</div>])
		}

		if (virtualServiceDetails.spec?.exportTo && Array.isArray(virtualServiceDetails.spec.exportTo)) {
			const exportTo = virtualServiceDetails.spec.exportTo.join(", ")
			additionalRows.push(["Export To", <div className="font-mono text-sm">{exportTo}</div>])
		}

		return additionalRows
	}, [virtualServiceDetails])

	// Combine basic and detailed rows
	const allRows = [...basicRows, ...detailedRows]

	const actions = (
		<>
			<Button
				size="sm"
				className="w-full"
				onClick={() => {
					// TODO: Implement virtual service routing details functionality
					console.log('Show routing details:', item.name, 'in namespace:', item.namespace)
				}}
			>
				<IconEye className="size-4 mr-2" />
				Show Routes
			</Button>
			<ResourceYamlEditor
				resourceName={item.name}
				namespace={item.namespace}
				resourceKind="VirtualService"
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
					// TODO: Implement virtual service restart functionality
					console.log('Restart virtual service:', item.name, 'in namespace:', item.namespace)
				}}
			>
				<IconRefresh className="size-4 mr-2" />
				Restart Routes
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
							{loading ? "Loading detailed virtual service information..." : "Full virtual service details and routing configuration"}
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

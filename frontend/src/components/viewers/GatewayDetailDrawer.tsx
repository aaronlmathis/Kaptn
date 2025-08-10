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
import { gatewaySchema } from "@/types/gateway"

// Type for detailed gateway response
interface GatewayDetail {
	metadata?: {
		labels?: Record<string, string>
		annotations?: Record<string, string>
	}
	spec?: {
		servers?: unknown[]
		selector?: Record<string, string>
	}
}

// Hook to fetch detailed gateway information
function useGatewayDetails(namespace: string, name: string, enabled: boolean) {
	const [data, setData] = React.useState<GatewayDetail | null>(null)
	const [loading, setLoading] = React.useState(false)
	const [error, setError] = React.useState<string | null>(null)

	React.useEffect(() => {
		if (!enabled) return

		const fetchDetails = async () => {
			setLoading(true)
			setError(null)
			try {
				const response = await fetch(`/api/v1/istio/gateways/${namespace}/${name}`)
				if (!response.ok) {
					throw new Error(`Failed to fetch gateway details: ${response.statusText}`)
				}
				const result = await response.json()
				if (result.status === 'success') {
					setData(result.data)
				} else {
					throw new Error(result.error || 'Failed to fetch gateway details')
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

interface GatewayDetailDrawerProps {
	item: z.infer<typeof gatewaySchema>
	open: boolean
	onOpenChange: (open: boolean) => void
}

/**
 * Controlled GatewayDetailDrawer that can be opened programmatically.
 * This shows full gateway details from the detailed API endpoint.
 */
export function GatewayDetailDrawer({ item, open, onOpenChange }: GatewayDetailDrawerProps) {
	const isMobile = useIsMobile()

	// Fetch detailed gateway information
	const { data: gatewayDetails, loading, error } = useGatewayDetails(item.namespace, item.name, open)

	// Basic rows from summary data (available immediately)
	const basicRows: Array<[string, React.ReactNode]> = [
		["Gateway Name", item.name],
		["Namespace", (
			<Badge variant="outline" className="text-muted-foreground px-1.5">
				{item.namespace}
			</Badge>
		)],
		["Ports", (
			<div className="text-sm">
				{item.ports.length} port configuration(s)
			</div>
		)],
		["Addresses", (
			<div className="text-sm">
				{item.addresses && item.addresses.length > 0
					? `${item.addresses.length} address(es)`
					: "No addresses"
				}
			</div>
		)],
		["Labels", (
			<div className="text-sm">
				{item.labels && Object.keys(item.labels).length > 0
					? `${Object.keys(item.labels).length} label(s)`
					: "No labels"
				}
			</div>
		)],
		["Age", <div className="font-mono text-sm">{item.age}</div>],
	]

	// Additional detailed rows from API (when available)
	const detailedRows: Array<[string, React.ReactNode]> = React.useMemo(() => {
		if (!gatewayDetails) return []

		const additionalRows: Array<[string, React.ReactNode]> = []

		// Add additional details from the full gateway spec
		if (gatewayDetails.metadata?.labels) {
			const labelCount = Object.keys(gatewayDetails.metadata.labels).length
			additionalRows.push(["Labels", <div className="text-sm">{labelCount} label(s)</div>])
		}

		if (gatewayDetails.metadata?.annotations) {
			const annotationCount = Object.keys(gatewayDetails.metadata.annotations).length
			additionalRows.push(["Annotations", <div className="text-sm">{annotationCount} annotation(s)</div>])
		}

		if (gatewayDetails.spec?.servers && Array.isArray(gatewayDetails.spec.servers)) {
			const serverCount = gatewayDetails.spec.servers.length
			additionalRows.push(["Detailed Servers", <div className="text-sm">{serverCount} server configuration(s)</div>])
		}

		return additionalRows
	}, [gatewayDetails])

	// Combine basic and detailed rows
	const allRows = [...basicRows, ...detailedRows]

	const actions = (
		<>
			<Button
				size="sm"
				className="w-full"
				onClick={() => {
					// TODO: Implement gateway configuration details functionality
					console.log('Show gateway config:', item.name, 'in namespace:', item.namespace)
				}}
			>
				<IconEye className="size-4 mr-2" />
				Show Configuration
			</Button>
			<ResourceYamlEditor
				resourceName={item.name}
				namespace={item.namespace}
				resourceKind="Gateway"
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
					// TODO: Implement gateway restart functionality
					console.log('Restart gateway:', item.name, 'in namespace:', item.namespace)
				}}
			>
				<IconRefresh className="size-4 mr-2" />
				Restart Gateway
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
							{loading ? "Loading detailed gateway information..." : "Full gateway details and server configuration"}
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

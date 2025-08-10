import * as React from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { IconEdit, IconEye, IconLoader, IconShieldLock, IconKey, IconDatabase, IconClock } from "@tabler/icons-react"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DetailRows } from "@/components/ResourceDetailDrawer"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { ResourceYamlEditor } from "@/components/ResourceYamlEditor"
import { SecretValue } from "@/components/secrets/SecretValue"
import { useSecretDetails } from "@/hooks/useSecretDetails"
import { type DashboardSecret } from "@/lib/k8s-storage"

interface SecretDetailDrawerProps {
	item: DashboardSecret
	open: boolean
	onOpenChange: (open: boolean) => void
}

// Helper function to get secret type badge
function getSecretTypeBadge(type: string) {
	switch (type.toLowerCase()) {
		case 'opaque':
			return <Badge variant="secondary" className="text-xs">Opaque</Badge>
		case 'kubernetes.io/tls':
			return <Badge variant="outline" className="text-xs bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800">TLS</Badge>
		case 'kubernetes.io/dockerconfigjson':
			return <Badge variant="outline" className="text-xs bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800">Docker</Badge>
		case 'kubernetes.io/service-account-token':
			return <Badge variant="outline" className="text-xs bg-purple-50 dark:bg-purple-950/20 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-800">ServiceAccount</Badge>
		case 'kubernetes.io/basic-auth':
			return <Badge variant="outline" className="text-xs bg-orange-50 dark:bg-orange-950/20 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-800">BasicAuth</Badge>
		case 'kubernetes.io/ssh-auth':
			return <Badge variant="outline" className="text-xs bg-indigo-50 dark:bg-indigo-950/20 text-indigo-700 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800">SSH</Badge>
		default:
			return <Badge variant="outline" className="text-xs">{type}</Badge>
	}
}

/**
 * Controlled SecretDetailDrawer that can be opened programmatically.
 * This shows full Secret details from the detailed API endpoint.
 */
export function SecretDetailDrawer({ item, open, onOpenChange }: SecretDetailDrawerProps) {
	const isMobile = useIsMobile()
	const [activeTab, setActiveTab] = React.useState("overview")

	// Fetch detailed secret information
	const { data: secretDetails, loading, error } = useSecretDetails(item.namespace, item.name, open)

	// Basic rows from summary data (available immediately)
	const basicRows: Array<[string, React.ReactNode]> = [
		["Secret Name", <div className="font-mono text-sm">{item.name}</div>],
		["Namespace", (
			<Badge variant="outline" className="text-muted-foreground px-1.5">
				{item.namespace}
			</Badge>
		)],
		["Type", getSecretTypeBadge(item.type)],
		["Data Keys", (
			<div className="flex items-center gap-2">
				<IconKey className="size-4 text-blue-600" />
				<div className="font-mono text-sm">{item.keysCount}</div>
			</div>
		)],
		["Data Size", (
			<div className="flex items-center gap-2">
				<IconDatabase className="size-4 text-purple-600" />
				<div className="font-mono text-sm">{item.dataSize}</div>
			</div>
		)],
		["Labels", <div className="text-sm">{item.labelsCount} label(s)</div>],
		["Annotations", <div className="text-sm">{item.annotationsCount} annotation(s)</div>],
		["Age", (
			<div className="flex items-center gap-2">
				<IconClock className="size-4 text-muted-foreground" />
				<div className="font-mono text-sm">{item.age}</div>
			</div>
		)],
	]

	// Additional detailed rows from API (when available)
	const detailedRows: Array<[string, React.ReactNode]> = React.useMemo(() => {
		if (!secretDetails) return []

		const additionalRows: Array<[string, React.ReactNode]> = []

		// Add additional details from the full secret metadata
		if (secretDetails.metadata && typeof secretDetails.metadata === 'object') {
			const metadata = secretDetails.metadata as Record<string, unknown>

			if (metadata.uid) {
				additionalRows.push(["UID", <div className="font-mono text-xs break-all">{String(metadata.uid)}</div>])
			}

			if (metadata.resourceVersion) {
				additionalRows.push(["Resource Version", <div className="font-mono text-xs">{String(metadata.resourceVersion)}</div>])
			}

			if (metadata.creationTimestamp) {
				additionalRows.push(["Created", <div className="text-sm">{new Date(String(metadata.creationTimestamp)).toLocaleString()}</div>])
			}
		}

		return additionalRows
	}, [secretDetails])

	// Combine basic and detailed rows
	const overviewRows = [...basicRows, ...detailedRows]

	// Data tab content
	const dataTabContent = React.useMemo(() => {
		if (!item.keys || item.keys.length === 0) {
			return (
				<div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
					<IconShieldLock className="size-12 mb-4" />
					<p className="text-sm">No data keys in this secret</p>
				</div>
			)
		}

		return (
			<div className="space-y-4">
				<div className="flex items-center gap-2 text-sm text-orange-700 dark:text-orange-300 bg-transparent px-4 py-3 rounded-lg border-2 border-orange-400 dark:border-orange-600">
					<IconShieldLock className="size-4 text-orange-600 dark:text-orange-400" />
					<span>Secret values are hidden by default for security. Click to reveal individual values.</span>
				</div>
				<div className="space-y-3 overflow-hidden">
					{item.keys.map((key, index) => (
						<div key={index} className="min-w-0">
							<SecretValue
								secretKey={key}
								namespace={item.namespace}
								secretName={item.name}
							/>
						</div>
					))}
				</div>
			</div>
		)
	}, [item])

	// Usage examples
	const usageContent = React.useMemo(() => {
		const volumeExample = `apiVersion: v1
kind: Pod
metadata:
  name: secret-volume-pod
spec:
  containers:
  - name: app
    image: nginx
    volumeMounts:
    - name: secret-volume
      mountPath: "/etc/secrets"
      readOnly: true
  volumes:
  - name: secret-volume
    secret:
      secretName: ${item.name}`

		const envExample = `apiVersion: v1
kind: Pod
metadata:
  name: secret-env-pod
spec:
  containers:
  - name: app
    image: nginx
    env:${item.keys.map(key => `
    - name: ${key.toUpperCase().replace(/[^A-Z0-9]/g, '_')}
      valueFrom:
        secretKeyRef:
          name: ${item.name}
          key: ${key}`).join('')}`

		let typeSpecificExample = ""

		if (item.type === 'kubernetes.io/tls') {
			typeSpecificExample = `# TLS Certificate Usage
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: tls-ingress
spec:
  tls:
  - hosts:
    - example.com
    secretName: ${item.name}
  rules:
  - host: example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: app-service
            port:
              number: 80`
		} else if (item.type === 'kubernetes.io/dockerconfigjson') {
			typeSpecificExample = `# Docker Registry Secret Usage
apiVersion: v1
kind: Pod
metadata:
  name: private-reg-pod
spec:
  containers:
  - name: private-reg-container
    image: your-private-registry.com/your-image
  imagePullSecrets:
  - name: ${item.name}`
		}

		return (
			<div className="space-y-6">
				<div>
					<h4 className="text-sm font-medium mb-2">Mount as Volume</h4>
					<pre className="text-xs bg-muted p-3 rounded-md overflow-x-auto">{volumeExample}</pre>
				</div>
				<div>
					<h4 className="text-sm font-medium mb-2">Use as Environment Variables</h4>
					<pre className="text-xs bg-muted p-3 rounded-md overflow-x-auto">{envExample}</pre>
				</div>
				{typeSpecificExample && (
					<div>
						<h4 className="text-sm font-medium mb-2">Type-Specific Usage</h4>
						<pre className="text-xs bg-muted p-3 rounded-md overflow-x-auto">{typeSpecificExample}</pre>
					</div>
				)}
			</div>
		)
	}, [item])

	const actions = (
		<>
			<Button
				size="sm"
				className="w-full"
				onClick={() => {
					// Switch to data tab to view secret contents
					setActiveTab("data")
				}}
			>
				<IconEye className="size-4 mr-2" />
				View Data
			</Button>
			<ResourceYamlEditor
				resourceName={item.name}
				namespace={item.namespace}
				resourceKind="Secret"
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
			<DrawerContent className="flex flex-col h-full max-w-2xl overflow-hidden">
				{/* Header with title/description */}
				<DrawerHeader className="flex justify-between items-start flex-shrink-0">
					<div className="space-y-1">
						<DrawerTitle className="flex items-center gap-2">
							<IconShieldLock className="size-5 text-blue-600" />
							{item.name}
						</DrawerTitle>
						<DrawerDescription>
							{loading ? "Loading detailed Secret information..." : "Secret details, data, and usage examples"}
						</DrawerDescription>
					</div>
				</DrawerHeader>

				{/* Tabs for different views */}
				<div className="flex-1 min-h-0 px-6 overflow-hidden">
					<Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
						<TabsList className="grid w-full grid-cols-4">
							<TabsTrigger value="overview">Overview</TabsTrigger>
							<TabsTrigger value="data">Data</TabsTrigger>
							<TabsTrigger value="yaml">YAML</TabsTrigger>
							<TabsTrigger value="usage">Usage</TabsTrigger>
						</TabsList>

						<div className="flex-1 min-h-0 mt-4 overflow-hidden">
							<TabsContent value="overview" className="h-full">
								<ScrollArea className="h-full">
									<div className="text-sm">
										{error ? (
											<div className="text-red-600 p-4 text-sm">
												⚠️ Failed to load detailed information: {error}
												<div className="mt-2 text-muted-foreground">
													Showing basic information from summary data.
												</div>
											</div>
										) : null}

										<DetailRows rows={overviewRows} />

										{loading && (
											<div className="flex items-center justify-center py-4 text-muted-foreground">
												<IconLoader className="size-4 animate-spin mr-2" />
												Loading detailed information...
											</div>
										)}
									</div>
									<ScrollBar orientation="vertical" />
								</ScrollArea>
							</TabsContent>

							<TabsContent value="data" className="h-full">
								<ScrollArea className="h-full">
									{dataTabContent}
									<ScrollBar orientation="vertical" />
									<ScrollBar orientation="horizontal" />
								</ScrollArea>
							</TabsContent>

							<TabsContent value="yaml" className="h-full">
								<div className="h-full">
									<ResourceYamlEditor
										resourceName={item.name}
										namespace={item.namespace}
										resourceKind="Secret"
									>
										<div className="h-full w-full" />
									</ResourceYamlEditor>
								</div>
							</TabsContent>

							<TabsContent value="usage" className="h-full">
								<ScrollArea className="h-full">
									{usageContent}
									<ScrollBar orientation="vertical" />
								</ScrollArea>
							</TabsContent>
						</div>
					</Tabs>
				</div>

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

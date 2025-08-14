"use client"

import * as React from "react"
import {
	IconApi,
	IconKey,
	IconShield,
	IconSettings,
	IconEdit,
	IconTrash,
	IconPlus,
	IconEye,
	IconCopy,
	IconRefresh,
	IconAlertTriangle,
	IconClock,
	IconDownload,
	IconCode,
	IconServer,
	IconLock,
	IconGlobe,
} from "@tabler/icons-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Separator } from "@/components/ui/separator"
import { Progress } from "@/components/ui/progress"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

// Mock data for API keys
const apiKeysData = [
	{
		id: "1",
		name: "Production Dashboard",
		key: "kad_prod_abc123***",
		permissions: ["read", "write"],
		lastUsed: "2024-08-13T08:30:00Z",
		created: "2024-01-15T10:00:00Z",
		status: "active",
		usage: 45230,
		rateLimit: 10000,
	},
	{
		id: "2",
		name: "CI/CD Pipeline",
		key: "kad_cicd_def456***",
		permissions: ["read"],
		lastUsed: "2024-08-13T06:15:00Z",
		created: "2024-03-20T14:30:00Z",
		status: "active",
		usage: 8760,
		rateLimit: 5000,
	},
	{
		id: "3",
		name: "Monitoring Integration",
		key: "kad_mon_ghi789***",
		permissions: ["read"],
		lastUsed: "2024-08-12T23:45:00Z",
		created: "2024-05-10T09:20:00Z",
		status: "inactive",
		usage: 125,
		rateLimit: 1000,
	},
]

const endpointsData = [
	{
		path: "/api/v1/nodes",
		method: "GET",
		description: "List all cluster nodes",
		authenticated: true,
		rateLimit: "100/min",
		usage: 1250,
	},
	{
		path: "/api/v1/pods",
		method: "GET",
		description: "List pods across namespaces",
		authenticated: true,
		rateLimit: "200/min",
		usage: 3420,
	},
	{
		path: "/api/v1/deployments",
		method: "POST",
		description: "Create new deployment",
		authenticated: true,
		rateLimit: "10/min",
		usage: 45,
	},
	{
		path: "/api/v1/events",
		method: "GET",
		description: "Get cluster events",
		authenticated: true,
		rateLimit: "50/min",
		usage: 890,
	},
]

const webhooksData = [
	{
		id: "1",
		name: "Slack Notifications",
		url: "https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX",
		events: ["pod.failed", "deployment.failed", "node.unhealthy"],
		status: "active",
		lastTriggered: "2024-08-13T07:22:00Z",
		retries: 0,
	},
	{
		id: "2",
		name: "PagerDuty Alerts",
		url: "https://events.pagerduty.com/integration/***",
		events: ["cluster.critical", "node.down"],
		status: "active",
		lastTriggered: "2024-08-11T15:33:00Z",
		retries: 1,
	},
	{
		id: "3",
		name: "Custom Dashboard",
		url: "https://dashboard.company.com/webhooks/k8s",
		events: ["deployment.success", "pod.created"],
		status: "inactive",
		lastTriggered: "2024-08-10T12:18:00Z",
		retries: 3,
	},
]

export function ApiSettingsContainer() {
	const [activeTab, setActiveTab] = React.useState("overview")
	const [rateLimitingEnabled, setRateLimitingEnabled] = React.useState(true)
	const [authenticationRequired, setAuthenticationRequired] = React.useState(true)
	const [auditLoggingEnabled, setAuditLoggingEnabled] = React.useState(true)
	const [corsEnabled, setCorsEnabled] = React.useState(false)
	const [isAddApiKeyDialogOpen, setIsAddApiKeyDialogOpen] = React.useState(false)

	return (
		<div className="px-4 lg:px-6">
			<div className="space-y-6">
				{/* Header */}
				<div className="flex flex-col space-y-2">
					<div className="flex items-center justify-between">
						<div>
							<h1 className="text-3xl font-bold tracking-tight">API Settings</h1>
							<p className="text-muted-foreground">
								Configure API access, authentication, and integrations
							</p>
						</div>
						<div className="flex items-center space-x-2">
							<Button variant="outline" size="sm">
								<IconDownload className="size-4 mr-2" />
								Export Config
							</Button>
							<Button variant="outline" size="sm">
								<IconCode className="size-4 mr-2" />
								API Documentation
							</Button>
						</div>
					</div>
				</div>

				{/* API Status Cards */}
				<div className="grid gap-6 md:grid-cols-4">
					<Card>
						<CardHeader className="pb-3">
							<CardTitle className="flex items-center text-sm">
								<IconApi className="size-4 mr-2" />
								API Requests
							</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="text-2xl font-bold">124.5K</div>
							<p className="text-xs text-muted-foreground">
								+12% from last week
							</p>
						</CardContent>
					</Card>
					<Card>
						<CardHeader className="pb-3">
							<CardTitle className="flex items-center text-sm">
								<IconKey className="size-4 mr-2" />
								Active API Keys
							</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="text-2xl font-bold">8</div>
							<p className="text-xs text-muted-foreground">
								2 created this month
							</p>
						</CardContent>
					</Card>
					<Card>
						<CardHeader className="pb-3">
							<CardTitle className="flex items-center text-sm">
								<IconClock className="size-4 mr-2" />
								Avg Response Time
							</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="text-2xl font-bold">245ms</div>
							<p className="text-xs text-muted-foreground">
								-15ms from last week
							</p>
						</CardContent>
					</Card>
					<Card>
						<CardHeader className="pb-3">
							<CardTitle className="flex items-center text-sm">
								<IconGlobe className="size-4 mr-2" />
								Webhooks
							</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="text-2xl font-bold">3</div>
							<p className="text-xs text-muted-foreground">
								All healthy
							</p>
						</CardContent>
					</Card>
				</div>

				{/* Main Tabs */}
				<Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
					<TabsList className="grid w-full grid-cols-5">
						<TabsTrigger value="overview">Overview</TabsTrigger>
						<TabsTrigger value="keys">API Keys</TabsTrigger>
						<TabsTrigger value="endpoints">Endpoints</TabsTrigger>
						<TabsTrigger value="webhooks">Webhooks</TabsTrigger>
						<TabsTrigger value="security">Security</TabsTrigger>
					</TabsList>

					{/* Overview Tab */}
					<TabsContent value="overview" className="space-y-6">
						<div className="grid gap-6 md:grid-cols-2">
							<Card>
								<CardHeader>
									<CardTitle className="flex items-center">
										<IconServer className="size-5 mr-2" />
										API Configuration
									</CardTitle>
								</CardHeader>
								<CardContent className="space-y-4">
									<div>
										<Label className="text-sm font-medium">API Version</Label>
										<p className="text-sm text-muted-foreground mt-1">v1.0.0</p>
									</div>
									<div>
										<Label className="text-sm font-medium">Base URL</Label>
										<div className="flex items-center space-x-2 mt-1">
											<Input defaultValue="https://api.kaptn.dev" readOnly />
											<Button size="sm" variant="outline">
												<IconCopy className="size-4" />
											</Button>
										</div>
									</div>
									<div>
										<Label className="text-sm font-medium">GraphQL Endpoint</Label>
										<div className="flex items-center space-x-2 mt-1">
											<Input defaultValue="https://api.kaptn.dev/graphql" readOnly />
											<Button size="sm" variant="outline">
												<IconCopy className="size-4" />
											</Button>
										</div>
									</div>
									<div>
										<Label className="text-sm font-medium">WebSocket URL</Label>
										<div className="flex items-center space-x-2 mt-1">
											<Input defaultValue="wss://api.kaptn.dev/ws" readOnly />
											<Button size="sm" variant="outline">
												<IconCopy className="size-4" />
											</Button>
										</div>
									</div>
								</CardContent>
							</Card>

							<Card>
								<CardHeader>
									<CardTitle>API Features</CardTitle>
									<CardDescription>
										Configure API behavior and features
									</CardDescription>
								</CardHeader>
								<CardContent className="space-y-4">
									<div className="flex items-center justify-between">
										<div className="space-y-0.5">
											<Label>Rate Limiting</Label>
											<p className="text-sm text-muted-foreground">
												Enable request rate limiting per API key
											</p>
										</div>
										<Switch
											checked={rateLimitingEnabled}
											onCheckedChange={setRateLimitingEnabled}
										/>
									</div>
									<Separator />
									<div className="flex items-center justify-between">
										<div className="space-y-0.5">
											<Label>Authentication Required</Label>
											<p className="text-sm text-muted-foreground">
												Require API key for all requests
											</p>
										</div>
										<Switch
											checked={authenticationRequired}
											onCheckedChange={setAuthenticationRequired}
										/>
									</div>
									<Separator />
									<div className="flex items-center justify-between">
										<div className="space-y-0.5">
											<Label>Audit Logging</Label>
											<p className="text-sm text-muted-foreground">
												Log all API requests for auditing
											</p>
										</div>
										<Switch
											checked={auditLoggingEnabled}
											onCheckedChange={setAuditLoggingEnabled}
										/>
									</div>
									<Separator />
									<div className="flex items-center justify-between">
										<div className="space-y-0.5">
											<Label>CORS</Label>
											<p className="text-sm text-muted-foreground">
												Enable Cross-Origin Resource Sharing
											</p>
										</div>
										<Switch
											checked={corsEnabled}
											onCheckedChange={setCorsEnabled}
										/>
									</div>
								</CardContent>
							</Card>
						</div>

						{/* Rate Limit Usage */}
						<Card>
							<CardHeader>
								<CardTitle>Rate Limit Usage</CardTitle>
								<CardDescription>
									Current usage against rate limits for active API keys
								</CardDescription>
							</CardHeader>
							<CardContent>
								<div className="space-y-4">
									{apiKeysData
										.filter(key => key.status === "active")
										.map((key) => {
											const usagePercent = (key.usage / key.rateLimit) * 100
											return (
												<div key={key.id} className="space-y-2">
													<div className="flex justify-between items-center">
														<span className="text-sm font-medium">{key.name}</span>
														<span className="text-sm text-muted-foreground">
															{key.usage.toLocaleString()} / {key.rateLimit.toLocaleString()}
														</span>
													</div>
													<Progress value={usagePercent} />
												</div>
											)
										})}
								</div>
							</CardContent>
						</Card>
					</TabsContent>

					{/* API Keys Tab */}
					<TabsContent value="keys" className="space-y-6">
						<Card>
							<CardHeader>
								<CardTitle className="flex items-center">
									<IconKey className="size-5 mr-2" />
									API Key Management
								</CardTitle>
								<CardDescription>
									Manage API keys for programmatic access
								</CardDescription>
							</CardHeader>
							<CardContent>
								<div className="flex justify-between items-center mb-4">
									<div></div>
									<Button onClick={() => setIsAddApiKeyDialogOpen(true)}>
										<IconPlus className="size-4 mr-2" />
										Generate API Key
									</Button>
								</div>

								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>Name</TableHead>
											<TableHead>API Key</TableHead>
											<TableHead>Permissions</TableHead>
											<TableHead>Usage</TableHead>
											<TableHead>Status</TableHead>
											<TableHead>Last Used</TableHead>
											<TableHead className="text-right">Actions</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{apiKeysData.map((key) => (
											<TableRow key={key.id}>
												<TableCell className="font-medium">{key.name}</TableCell>
												<TableCell>
													<div className="flex items-center space-x-2">
														<code className="text-sm bg-muted px-2 py-1 rounded">
															{key.key}
														</code>
														<Button size="sm" variant="ghost">
															<IconCopy className="size-4" />
														</Button>
													</div>
												</TableCell>
												<TableCell>
													<div className="flex flex-wrap gap-1">
														{key.permissions.map((permission, index) => (
															<Badge key={index} variant="outline" className="text-xs">
																{permission}
															</Badge>
														))}
													</div>
												</TableCell>
												<TableCell>
													<div className="text-sm">
														{key.usage.toLocaleString()} / {key.rateLimit.toLocaleString()}
													</div>
													<Progress
														value={(key.usage / key.rateLimit) * 100}
														className="w-16 h-1 mt-1"
													/>
												</TableCell>
												<TableCell>
													<Badge
														variant={key.status === "active" ? "default" : "secondary"}
														className={key.status === "active" ? "text-green-600 border-green-600" : ""}
													>
														{key.status}
													</Badge>
												</TableCell>
												<TableCell className="text-sm">
													{new Date(key.lastUsed).toLocaleDateString()}
												</TableCell>
												<TableCell className="text-right">
													<DropdownMenu>
														<DropdownMenuTrigger asChild>
															<Button variant="ghost" size="sm">
																<IconSettings className="size-4" />
															</Button>
														</DropdownMenuTrigger>
														<DropdownMenuContent align="end">
															<DropdownMenuItem>
																<IconEye className="size-4 mr-2" />
																View Details
															</DropdownMenuItem>
															<DropdownMenuItem>
																<IconEdit className="size-4 mr-2" />
																Edit Permissions
															</DropdownMenuItem>
															<DropdownMenuItem>
																<IconRefresh className="size-4 mr-2" />
																Regenerate Key
															</DropdownMenuItem>
															<DropdownMenuSeparator />
															<DropdownMenuItem className="text-destructive">
																<IconTrash className="size-4 mr-2" />
																Revoke Key
															</DropdownMenuItem>
														</DropdownMenuContent>
													</DropdownMenu>
												</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
							</CardContent>
						</Card>
					</TabsContent>

					{/* Endpoints Tab */}
					<TabsContent value="endpoints" className="space-y-6">
						<Card>
							<CardHeader>
								<CardTitle className="flex items-center">
									<IconGlobe className="size-5 mr-2" />
									API Endpoints
								</CardTitle>
								<CardDescription>
									Monitor and configure API endpoint behavior
								</CardDescription>
							</CardHeader>
							<CardContent>
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>Endpoint</TableHead>
											<TableHead>Method</TableHead>
											<TableHead>Description</TableHead>
											<TableHead>Auth Required</TableHead>
											<TableHead>Rate Limit</TableHead>
											<TableHead>Usage (24h)</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{endpointsData.map((endpoint, index) => (
											<TableRow key={index}>
												<TableCell>
													<code className="text-sm">{endpoint.path}</code>
												</TableCell>
												<TableCell>
													<Badge
														variant={endpoint.method === "GET" ? "secondary" : "default"}
														className={
															endpoint.method === "GET" ? "text-blue-600 border-blue-600" :
																endpoint.method === "POST" ? "text-green-600 border-green-600" :
																	"text-orange-600 border-orange-600"
														}
													>
														{endpoint.method}
													</Badge>
												</TableCell>
												<TableCell className="text-sm">
													{endpoint.description}
												</TableCell>
												<TableCell>
													{endpoint.authenticated ? (
														<IconLock className="size-4 text-green-600" />
													) : (
														<IconLock className="size-4 text-muted-foreground opacity-50" />
													)}
												</TableCell>
												<TableCell className="text-sm">
													{endpoint.rateLimit}
												</TableCell>
												<TableCell className="text-sm">
													{endpoint.usage.toLocaleString()}
												</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
							</CardContent>
						</Card>
					</TabsContent>

					{/* Webhooks Tab */}
					<TabsContent value="webhooks" className="space-y-6">
						<Card>
							<CardHeader>
								<CardTitle className="flex items-center">
									<IconGlobe className="size-5 mr-2" />
									Webhook Configuration
								</CardTitle>
								<CardDescription>
									Configure webhooks for real-time notifications
								</CardDescription>
							</CardHeader>
							<CardContent>
								<div className="flex justify-between items-center mb-4">
									<div></div>
									<Button>
										<IconPlus className="size-4 mr-2" />
										Add Webhook
									</Button>
								</div>

								<div className="space-y-4">
									{webhooksData.map((webhook) => (
										<div key={webhook.id} className="border rounded-lg p-4">
											<div className="flex items-center justify-between">
												<div className="flex-1">
													<div className="flex items-center space-x-2">
														<h4 className="font-medium">{webhook.name}</h4>
														<Badge
															variant={webhook.status === "active" ? "default" : "secondary"}
															className={webhook.status === "active" ? "text-green-600 border-green-600" : ""}
														>
															{webhook.status}
														</Badge>
														{webhook.retries > 0 && (
															<Badge variant="destructive" className="text-xs">
																{webhook.retries} retries
															</Badge>
														)}
													</div>
													<p className="text-sm text-muted-foreground mt-1">
														{webhook.url}
													</p>
													<div className="flex items-center space-x-4 mt-2">
														<div className="flex items-center space-x-1">
															<IconClock className="size-4 text-muted-foreground" />
															<span className="text-sm text-muted-foreground">
																Last triggered: {new Date(webhook.lastTriggered).toLocaleString()}
															</span>
														</div>
													</div>
													<div className="flex flex-wrap gap-1 mt-2">
														{webhook.events.map((event, index) => (
															<Badge key={index} variant="outline" className="text-xs">
																{event}
															</Badge>
														))}
													</div>
												</div>
												<div className="flex items-center space-x-2">
													<DropdownMenu>
														<DropdownMenuTrigger asChild>
															<Button variant="ghost" size="sm">
																<IconSettings className="size-4" />
															</Button>
														</DropdownMenuTrigger>
														<DropdownMenuContent align="end">
															<DropdownMenuItem>
																<IconEdit className="size-4 mr-2" />
																Edit Webhook
															</DropdownMenuItem>
															<DropdownMenuItem>
																<IconRefresh className="size-4 mr-2" />
																Test Webhook
															</DropdownMenuItem>
															<DropdownMenuSeparator />
															<DropdownMenuItem className="text-destructive">
																<IconTrash className="size-4 mr-2" />
																Delete Webhook
															</DropdownMenuItem>
														</DropdownMenuContent>
													</DropdownMenu>
												</div>
											</div>
										</div>
									))}
								</div>
							</CardContent>
						</Card>
					</TabsContent>

					{/* Security Tab */}
					<TabsContent value="security" className="space-y-6">
						<div className="grid gap-6 md:grid-cols-2">
							<Card>
								<CardHeader>
									<CardTitle className="flex items-center">
										<IconShield className="size-5 mr-2" />
										Authentication & Authorization
									</CardTitle>
								</CardHeader>
								<CardContent className="space-y-4">
									<div>
										<Label className="text-sm font-medium">Authentication Method</Label>
										<Select defaultValue="api-key">
											<SelectTrigger className="mt-1">
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="api-key">API Key</SelectItem>
												<SelectItem value="oauth">OAuth 2.0</SelectItem>
												<SelectItem value="jwt">JWT Token</SelectItem>
											</SelectContent>
										</Select>
									</div>
									<div>
										<Label className="text-sm font-medium">Token Expiration</Label>
										<Select defaultValue="30d">
											<SelectTrigger className="mt-1">
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="1h">1 hour</SelectItem>
												<SelectItem value="24h">24 hours</SelectItem>
												<SelectItem value="7d">7 days</SelectItem>
												<SelectItem value="30d">30 days</SelectItem>
												<SelectItem value="never">Never</SelectItem>
											</SelectContent>
										</Select>
									</div>
									<div>
										<Label className="text-sm font-medium">Default Permissions</Label>
										<Select defaultValue="read">
											<SelectTrigger className="mt-1">
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="none">None</SelectItem>
												<SelectItem value="read">Read Only</SelectItem>
												<SelectItem value="write">Read/Write</SelectItem>
												<SelectItem value="admin">Administrator</SelectItem>
											</SelectContent>
										</Select>
									</div>
								</CardContent>
							</Card>

							<Card>
								<CardHeader>
									<CardTitle>Security Policies</CardTitle>
								</CardHeader>
								<CardContent className="space-y-4">
									<div className="flex items-center justify-between">
										<div className="space-y-0.5">
											<Label>IP Whitelisting</Label>
											<p className="text-sm text-muted-foreground">
												Restrict API access to specific IP addresses
											</p>
										</div>
										<Switch />
									</div>
									<Separator />
									<div className="flex items-center justify-between">
										<div className="space-y-0.5">
											<Label>Request Signing</Label>
											<p className="text-sm text-muted-foreground">
												Require cryptographic signing of requests
											</p>
										</div>
										<Switch />
									</div>
									<Separator />
									<div className="flex items-center justify-between">
										<div className="space-y-0.5">
											<Label>TLS Certificate Validation</Label>
											<p className="text-sm text-muted-foreground">
												Enforce strict TLS certificate validation
											</p>
										</div>
										<Switch defaultChecked />
									</div>
								</CardContent>
							</Card>
						</div>

						<Alert>
							<IconAlertTriangle className="size-4" />
							<AlertTitle>Security Recommendation</AlertTitle>
							<AlertDescription>
								Enable IP whitelisting and request signing for production API keys.
								Regularly rotate API keys and monitor usage patterns for anomalies.
							</AlertDescription>
						</Alert>
					</TabsContent>
				</Tabs>

				{/* Add API Key Dialog */}
				<Dialog open={isAddApiKeyDialogOpen} onOpenChange={setIsAddApiKeyDialogOpen}>
					<DialogContent className="sm:max-w-md">
						<DialogHeader>
							<DialogTitle>Generate API Key</DialogTitle>
							<DialogDescription>
								Create a new API key for programmatic access.
							</DialogDescription>
						</DialogHeader>
						<div className="space-y-4">
							<div>
								<Label htmlFor="key-name">Key Name</Label>
								<Input id="key-name" placeholder="My API Key" />
							</div>
							<div>
								<Label htmlFor="permissions">Permissions</Label>
								<Select>
									<SelectTrigger>
										<SelectValue placeholder="Select permissions" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="read">Read Only</SelectItem>
										<SelectItem value="write">Read/Write</SelectItem>
										<SelectItem value="admin">Administrator</SelectItem>
									</SelectContent>
								</Select>
							</div>
							<div>
								<Label htmlFor="rate-limit">Rate Limit (requests/hour)</Label>
								<Input id="rate-limit" type="number" placeholder="1000" />
							</div>
							<div>
								<Label htmlFor="expiration">Expiration</Label>
								<Select>
									<SelectTrigger>
										<SelectValue placeholder="Select expiration" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="30d">30 days</SelectItem>
										<SelectItem value="90d">90 days</SelectItem>
										<SelectItem value="1y">1 year</SelectItem>
										<SelectItem value="never">Never</SelectItem>
									</SelectContent>
								</Select>
							</div>
						</div>
						<DialogFooter>
							<Button variant="outline" onClick={() => setIsAddApiKeyDialogOpen(false)}>
								Cancel
							</Button>
							<Button onClick={() => setIsAddApiKeyDialogOpen(false)}>
								Generate Key
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			</div>
		</div>
	)
}

"use client"

import * as React from "react"
import {
	IconServer,
	IconShield,
	IconNetwork,
	IconCloudComputing,
	IconDatabase,
	IconChartBar,
	IconSettings,
	IconAlertTriangle,
	IconCheck,
	IconRefresh,
	IconEdit,
	IconTrash,
	IconPlus,
	IconCopy,
	IconEye,
	IconDownload,
	IconUpload,
	IconGitBranch,
	IconCpu,
	IconClock,
	IconUsers,
	IconKey,
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
import { ScrollArea } from "@/components/ui/scroll-area"
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
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

// Mock data for demonstration
const clusterInfo = {
	name: "production-cluster",
	version: "v1.28.4",
	provider: "AWS EKS",
	region: "us-west-2",
	nodes: 12,
	status: "healthy",
	created: "2024-01-15T08:30:00Z",
	lastUpdate: "2024-08-13T10:15:00Z",
}

const nodePoolsData = [
	{
		id: "1",
		name: "system-pool",
		instanceType: "t3.medium",
		minNodes: 1,
		maxNodes: 3,
		currentNodes: 2,
		status: "healthy",
		version: "v1.28.4",
		autoscaling: true,
	},
	{
		id: "2",
		name: "worker-pool",
		instanceType: "m5.large",
		minNodes: 2,
		maxNodes: 10,
		currentNodes: 6,
		status: "healthy",
		version: "v1.28.4",
		autoscaling: true,
	},
	{
		id: "3",
		name: "spot-pool",
		instanceType: "m5.xlarge",
		minNodes: 0,
		maxNodes: 20,
		currentNodes: 4,
		status: "scaling",
		version: "v1.28.4",
		autoscaling: true,
	},
]

const addonsData = [
	{ name: "CoreDNS", version: "v1.10.1", status: "enabled", critical: true, description: "DNS resolution for the cluster" },
	{ name: "kube-proxy", version: "v1.28.4", status: "enabled", critical: true, description: "Network proxy for services" },
	{ name: "CNI Plugin", version: "v1.13.4", status: "enabled", critical: true, description: "Container networking interface" },
	{ name: "AWS Load Balancer Controller", version: "v2.6.1", status: "enabled", critical: false, description: "Manages AWS load balancers" },
	{ name: "Cluster Autoscaler", version: "v1.28.2", status: "enabled", critical: false, description: "Automatically scales node groups" },
	{ name: "Metrics Server", version: "v0.6.4", status: "enabled", critical: false, description: "Resource metrics API" },
	{ name: "Istio Service Mesh", version: "v1.19.0", status: "disabled", critical: false, description: "Service mesh for microservices" },
	{ name: "Prometheus Operator", version: "v0.68.0", status: "enabled", critical: false, description: "Kubernetes-native monitoring" },
]

const networkPoliciesData = [
	{ name: "default-deny-all", namespace: "default", type: "Ingress", targets: "All pods", status: "active" },
	{ name: "allow-dns", namespace: "kube-system", type: "Egress", targets: "DNS pods", status: "active" },
	{ name: "frontend-to-backend", namespace: "production", type: "Ingress", targets: "Backend pods", status: "active" },
	{ name: "database-isolation", namespace: "production", type: "Both", targets: "Database pods", status: "active" },
]

const backupPoliciesData = [
	{ name: "daily-etcd-backup", type: "etcd", schedule: "0 2 * * *", retention: "30 days", status: "active", lastBackup: "2024-08-13T02:00:00Z" },
	{ name: "weekly-full-backup", type: "full", schedule: "0 0 * * 0", retention: "12 weeks", status: "active", lastBackup: "2024-08-11T00:00:00Z" },
	{ name: "pv-snapshots", type: "volumes", schedule: "0 1 * * *", retention: "7 days", status: "active", lastBackup: "2024-08-13T01:00:00Z" },
]

export function ClusterSettingsContainer() {
	const [activeTab, setActiveTab] = React.useState("overview")
	const [autoScalingEnabled, setAutoScalingEnabled] = React.useState(true)
	const [maintenanceMode, setMaintenanceMode] = React.useState(false)
	const [loggingEnabled, setLoggingEnabled] = React.useState(true)
	const [monitoringEnabled, setMonitoringEnabled] = React.useState(true)

	return (
		<div className="px-4 lg:px-6">
			<div className="space-y-6">
				{/* Header */}
				<div className="flex flex-col space-y-2">
					<div className="flex items-center justify-between">
						<div>
							<h1 className="text-3xl font-bold tracking-tight">Cluster Settings</h1>
							<p className="text-muted-foreground">
								Configure and manage your Kubernetes cluster settings
							</p>
						</div>
						<div className="flex items-center space-x-2">
							<Button variant="outline" size="sm">
								<IconDownload className="size-4 mr-2" />
								Export Config
							</Button>
							<Button size="sm">
								<IconUpload className="size-4 mr-2" />
								Import Config
							</Button>
						</div>
					</div>
				</div>

				{/* Status Banner */}
				<Alert>
					<IconCheck className="size-4" />
					<AlertTitle>Cluster Status: Healthy</AlertTitle>
					<AlertDescription>
						All systems operational. Last health check: {new Date().toLocaleString()}
					</AlertDescription>
				</Alert>

				{/* Main Tabs */}
				<Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
					<TabsList className="grid w-full grid-cols-7">
						<TabsTrigger value="overview">Overview</TabsTrigger>
						<TabsTrigger value="compute">Compute</TabsTrigger>
						<TabsTrigger value="networking">Networking</TabsTrigger>
						<TabsTrigger value="security">Security</TabsTrigger>
						<TabsTrigger value="addons">Add-ons</TabsTrigger>
						<TabsTrigger value="backup">Backup</TabsTrigger>
						<TabsTrigger value="maintenance">Maintenance</TabsTrigger>
					</TabsList>

					{/* Overview Tab */}
					<TabsContent value="overview" className="space-y-6">
						<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
							{/* Cluster Information */}
							<Card className="lg:col-span-2">
								<CardHeader>
									<CardTitle className="flex items-center">
										<IconServer className="size-5 mr-2" />
										Cluster Information
									</CardTitle>
								</CardHeader>
								<CardContent className="space-y-4">
									<div className="grid gap-4 md:grid-cols-2">
										<div>
											<Label className="text-sm font-medium">Cluster Name</Label>
											<div className="flex items-center space-x-2 mt-1">
												<Input defaultValue={clusterInfo.name} />
												<Button size="sm" variant="outline">
													<IconEdit className="size-4" />
												</Button>
											</div>
										</div>
										<div>
											<Label className="text-sm font-medium">Kubernetes Version</Label>
											<div className="flex items-center space-x-2 mt-1">
												<Badge variant="outline">{clusterInfo.version}</Badge>
												<Button size="sm" variant="outline">
													<IconGitBranch className="size-4 mr-2" />
													Upgrade
												</Button>
											</div>
										</div>
									</div>
									<div className="grid gap-4 md:grid-cols-2">
										<div>
											<Label className="text-sm font-medium">Provider</Label>
											<p className="text-sm text-muted-foreground mt-1">{clusterInfo.provider}</p>
										</div>
										<div>
											<Label className="text-sm font-medium">Region</Label>
											<p className="text-sm text-muted-foreground mt-1">{clusterInfo.region}</p>
										</div>
									</div>
									<div className="grid gap-4 md:grid-cols-2">
										<div>
											<Label className="text-sm font-medium">Created</Label>
											<p className="text-sm text-muted-foreground mt-1">
												{new Date(clusterInfo.created).toLocaleDateString()}
											</p>
										</div>
										<div>
											<Label className="text-sm font-medium">Last Updated</Label>
											<p className="text-sm text-muted-foreground mt-1">
												{new Date(clusterInfo.lastUpdate).toLocaleDateString()}
											</p>
										</div>
									</div>
								</CardContent>
							</Card>

							{/* Quick Stats */}
							<Card>
								<CardHeader>
									<CardTitle className="flex items-center">
										<IconChartBar className="size-5 mr-2" />
										Quick Stats
									</CardTitle>
								</CardHeader>
								<CardContent className="space-y-4">
									<div className="space-y-2">
										<div className="flex justify-between">
											<span className="text-sm font-medium">Nodes</span>
											<span className="text-sm">{clusterInfo.nodes}</span>
										</div>
										<div className="flex justify-between">
											<span className="text-sm font-medium">Namespaces</span>
											<span className="text-sm">24</span>
										</div>
										<div className="flex justify-between">
											<span className="text-sm font-medium">Pods</span>
											<span className="text-sm">156</span>
										</div>
										<div className="flex justify-between">
											<span className="text-sm font-medium">Services</span>
											<span className="text-sm">43</span>
										</div>
									</div>
								</CardContent>
							</Card>
						</div>

						{/* Resource Usage */}
						<div className="grid gap-6 md:grid-cols-3">
							<Card>
								<CardHeader className="pb-3">
									<CardTitle className="flex items-center text-sm">
										<IconCpu className="size-4 mr-2" />
										CPU Usage
									</CardTitle>
								</CardHeader>
								<CardContent>
									<div className="text-2xl font-bold">64%</div>
									<Progress value={64} className="mt-2" />
									<p className="text-xs text-muted-foreground mt-2">
										128 cores used of 200 total
									</p>
								</CardContent>
							</Card>
							<Card>
								<CardHeader className="pb-3">
									<CardTitle className="flex items-center text-sm">
										<IconChartBar className="size-4 mr-2" />
										Memory Usage
									</CardTitle>
								</CardHeader>
								<CardContent>
									<div className="text-2xl font-bold">72%</div>
									<Progress value={72} className="mt-2" />
									<p className="text-xs text-muted-foreground mt-2">
										576 GB used of 800 GB total
									</p>
								</CardContent>
							</Card>
							<Card>
								<CardHeader className="pb-3">
									<CardTitle className="flex items-center text-sm">
										<IconDatabase className="size-4 mr-2" />
										Storage Usage
									</CardTitle>
								</CardHeader>
								<CardContent>
									<div className="text-2xl font-bold">45%</div>
									<Progress value={45} className="mt-2" />
									<p className="text-xs text-muted-foreground mt-2">
										2.3 TB used of 5 TB total
									</p>
								</CardContent>
							</Card>
						</div>

						{/* Cluster Settings Toggles */}
						<div className="grid gap-6 md:grid-cols-2">
							<Card>
								<CardHeader>
									<CardTitle>Cluster Features</CardTitle>
									<CardDescription>
										Enable or disable cluster-wide features
									</CardDescription>
								</CardHeader>
								<CardContent className="space-y-4">
									<div className="flex items-center justify-between">
										<div className="space-y-0.5">
											<Label>Auto Scaling</Label>
											<p className="text-sm text-muted-foreground">
												Automatically scale node groups based on demand
											</p>
										</div>
										<Switch
											checked={autoScalingEnabled}
											onCheckedChange={setAutoScalingEnabled}
										/>
									</div>
									<Separator />
									<div className="flex items-center justify-between">
										<div className="space-y-0.5">
											<Label>Maintenance Mode</Label>
											<p className="text-sm text-muted-foreground">
												Prevent new workloads from being scheduled
											</p>
										</div>
										<Switch
											checked={maintenanceMode}
											onCheckedChange={setMaintenanceMode}
										/>
									</div>
									<Separator />
									<div className="flex items-center justify-between">
										<div className="space-y-0.5">
											<Label>Logging</Label>
											<p className="text-sm text-muted-foreground">
												Enable centralized logging for all components
											</p>
										</div>
										<Switch
											checked={loggingEnabled}
											onCheckedChange={setLoggingEnabled}
										/>
									</div>
									<Separator />
									<div className="flex items-center justify-between">
										<div className="space-y-0.5">
											<Label>Monitoring</Label>
											<p className="text-sm text-muted-foreground">
												Enable metrics collection and monitoring
											</p>
										</div>
										<Switch
											checked={monitoringEnabled}
											onCheckedChange={setMonitoringEnabled}
										/>
									</div>
								</CardContent>
							</Card>

							<Card>
								<CardHeader>
									<CardTitle>Recent Activities</CardTitle>
									<CardDescription>
										Latest cluster events and changes
									</CardDescription>
								</CardHeader>
								<CardContent>
									<ScrollArea className="h-[280px]">
										<div className="space-y-3">
											<div className="flex items-start space-x-3">
												<Badge variant="outline" className="text-green-600 border-green-600">
													<IconCheck className="size-3 mr-1" />
													Success
												</Badge>
												<div className="flex-1 space-y-1">
													<p className="text-sm font-medium">Node pool scaled up</p>
													<p className="text-xs text-muted-foreground">
														worker-pool scaled from 5 to 6 nodes
													</p>
													<p className="text-xs text-muted-foreground">2 minutes ago</p>
												</div>
											</div>
											<div className="flex items-start space-x-3">
												<Badge variant="outline" className="text-blue-600 border-blue-600">
													<IconSettings className="size-3 mr-1" />
													Config
												</Badge>
												<div className="flex-1 space-y-1">
													<p className="text-sm font-medium">CNI plugin updated</p>
													<p className="text-xs text-muted-foreground">
														Updated to version v1.13.4
													</p>
													<p className="text-xs text-muted-foreground">1 hour ago</p>
												</div>
											</div>
											<div className="flex items-start space-x-3">
												<Badge variant="outline" className="text-orange-600 border-orange-600">
													<IconAlertTriangle className="size-3 mr-1" />
													Warning
												</Badge>
												<div className="flex-1 space-y-1">
													<p className="text-sm font-medium">High memory usage detected</p>
													<p className="text-xs text-muted-foreground">
														Node ip-10-0-1-45 at 89% memory usage
													</p>
													<p className="text-xs text-muted-foreground">3 hours ago</p>
												</div>
											</div>
										</div>
									</ScrollArea>
								</CardContent>
							</Card>
						</div>
					</TabsContent>

					{/* Compute Tab */}
					<TabsContent value="compute" className="space-y-6">
						<Card>
							<CardHeader>
								<CardTitle className="flex items-center">
									<IconCloudComputing className="size-5 mr-2" />
									Node Pools
								</CardTitle>
								<CardDescription>
									Manage compute resources and node groups
								</CardDescription>
							</CardHeader>
							<CardContent>
								<div className="flex justify-between items-center mb-4">
									<div></div>
									<Button>
										<IconPlus className="size-4 mr-2" />
										Add Node Pool
									</Button>
								</div>
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>Name</TableHead>
											<TableHead>Instance Type</TableHead>
											<TableHead>Nodes</TableHead>
											<TableHead>Status</TableHead>
											<TableHead>Version</TableHead>
											<TableHead>Auto Scaling</TableHead>
											<TableHead className="text-right">Actions</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{nodePoolsData.map((pool) => (
											<TableRow key={pool.id}>
												<TableCell className="font-medium">{pool.name}</TableCell>
												<TableCell>{pool.instanceType}</TableCell>
												<TableCell>
													<div className="flex flex-col">
														<span className="font-medium">{pool.currentNodes}</span>
														<span className="text-xs text-muted-foreground">
															({pool.minNodes}-{pool.maxNodes})
														</span>
													</div>
												</TableCell>
												<TableCell>
													<Badge
														variant={pool.status === "healthy" ? "default" : "secondary"}
														className={pool.status === "healthy" ? "text-green-600 border-green-600" : ""}
													>
														{pool.status}
													</Badge>
												</TableCell>
												<TableCell>
													<Badge variant="outline">{pool.version}</Badge>
												</TableCell>
												<TableCell>
													<Switch checked={pool.autoscaling} />
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
																<IconEdit className="size-4 mr-2" />
																Edit
															</DropdownMenuItem>
															<DropdownMenuItem>
																<IconCopy className="size-4 mr-2" />
																Clone
															</DropdownMenuItem>
															<DropdownMenuSeparator />
															<DropdownMenuItem className="text-destructive">
																<IconTrash className="size-4 mr-2" />
																Delete
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

					{/* Networking Tab */}
					<TabsContent value="networking" className="space-y-6">
						<div className="grid gap-6 md:grid-cols-2">
							<Card>
								<CardHeader>
									<CardTitle className="flex items-center">
										<IconNetwork className="size-5 mr-2" />
										Network Configuration
									</CardTitle>
								</CardHeader>
								<CardContent className="space-y-4">
									<div>
										<Label className="text-sm font-medium">Pod CIDR</Label>
										<Input defaultValue="10.244.0.0/16" className="mt-1" />
									</div>
									<div>
										<Label className="text-sm font-medium">Service CIDR</Label>
										<Input defaultValue="10.96.0.0/12" className="mt-1" />
									</div>
									<div>
										<Label className="text-sm font-medium">DNS Domain</Label>
										<Input defaultValue="cluster.local" className="mt-1" />
									</div>
									<div>
										<Label className="text-sm font-medium">CNI Plugin</Label>
										<Select defaultValue="aws-vpc-cni">
											<SelectTrigger>
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="aws-vpc-cni">AWS VPC CNI</SelectItem>
												<SelectItem value="calico">Calico</SelectItem>
												<SelectItem value="flannel">Flannel</SelectItem>
												<SelectItem value="weave">Weave Net</SelectItem>
											</SelectContent>
										</Select>
									</div>
								</CardContent>
							</Card>

							<Card>
								<CardHeader>
									<CardTitle>Load Balancer Settings</CardTitle>
								</CardHeader>
								<CardContent className="space-y-4">
									<div className="flex items-center justify-between">
										<div className="space-y-0.5">
											<Label>Enable Load Balancer Controller</Label>
											<p className="text-sm text-muted-foreground">
												Automatically provision load balancers
											</p>
										</div>
										<Switch defaultChecked />
									</div>
									<Separator />
									<div>
										<Label className="text-sm font-medium">Load Balancer Type</Label>
										<Select defaultValue="nlb">
											<SelectTrigger className="mt-1">
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="nlb">Network Load Balancer</SelectItem>
												<SelectItem value="alb">Application Load Balancer</SelectItem>
												<SelectItem value="classic">Classic Load Balancer</SelectItem>
											</SelectContent>
										</Select>
									</div>
									<div>
										<Label className="text-sm font-medium">Idle Timeout (seconds)</Label>
										<Input defaultValue="60" type="number" className="mt-1" />
									</div>
								</CardContent>
							</Card>
						</div>

						<Card>
							<CardHeader>
								<CardTitle>Network Policies</CardTitle>
								<CardDescription>
									Manage network security policies
								</CardDescription>
							</CardHeader>
							<CardContent>
								<div className="flex justify-between items-center mb-4">
									<div></div>
									<Button>
										<IconPlus className="size-4 mr-2" />
										Create Policy
									</Button>
								</div>
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>Name</TableHead>
											<TableHead>Namespace</TableHead>
											<TableHead>Type</TableHead>
											<TableHead>Targets</TableHead>
											<TableHead>Status</TableHead>
											<TableHead className="text-right">Actions</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{networkPoliciesData.map((policy, index) => (
											<TableRow key={index}>
												<TableCell className="font-medium">{policy.name}</TableCell>
												<TableCell>
													<Badge variant="outline">{policy.namespace}</Badge>
												</TableCell>
												<TableCell>{policy.type}</TableCell>
												<TableCell>{policy.targets}</TableCell>
												<TableCell>
													<Badge className="text-green-600 border-green-600">
														{policy.status}
													</Badge>
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
																View YAML
															</DropdownMenuItem>
															<DropdownMenuItem>
																<IconEdit className="size-4 mr-2" />
																Edit
															</DropdownMenuItem>
															<DropdownMenuSeparator />
															<DropdownMenuItem className="text-destructive">
																<IconTrash className="size-4 mr-2" />
																Delete
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

					{/* Security Tab */}
					<TabsContent value="security" className="space-y-6">
						<div className="grid gap-6 md:grid-cols-2">
							<Card>
								<CardHeader>
									<CardTitle className="flex items-center">
										<IconShield className="size-5 mr-2" />
										Pod Security Standards
									</CardTitle>
								</CardHeader>
								<CardContent className="space-y-4">
									<div>
										<Label className="text-sm font-medium">Default Policy</Label>
										<Select defaultValue="restricted">
											<SelectTrigger className="mt-1">
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="privileged">Privileged</SelectItem>
												<SelectItem value="baseline">Baseline</SelectItem>
												<SelectItem value="restricted">Restricted</SelectItem>
											</SelectContent>
										</Select>
									</div>
									<div className="flex items-center justify-between">
										<div className="space-y-0.5">
											<Label>Enforce Security Context</Label>
											<p className="text-sm text-muted-foreground">
												Require security context for all pods
											</p>
										</div>
										<Switch defaultChecked />
									</div>
									<div className="flex items-center justify-between">
										<div className="space-y-0.5">
											<Label>Block Privileged Containers</Label>
											<p className="text-sm text-muted-foreground">
												Prevent privileged container execution
											</p>
										</div>
										<Switch defaultChecked />
									</div>
								</CardContent>
							</Card>

							<Card>
								<CardHeader>
									<CardTitle className="flex items-center">
										<IconKey className="size-5 mr-2" />
										Encryption
									</CardTitle>
								</CardHeader>
								<CardContent className="space-y-4">
									<div className="flex items-center justify-between">
										<div className="space-y-0.5">
											<Label>Encryption at Rest</Label>
											<p className="text-sm text-muted-foreground">
												Encrypt etcd data at rest
											</p>
										</div>
										<Switch defaultChecked />
									</div>
									<div className="flex items-center justify-between">
										<div className="space-y-0.5">
											<Label>Encryption in Transit</Label>
											<p className="text-sm text-muted-foreground">
												Encrypt data in transit between components
											</p>
										</div>
										<Switch defaultChecked />
									</div>
									<div>
										<Label className="text-sm font-medium">KMS Key ARN</Label>
										<div className="flex items-center space-x-2 mt-1">
											<Input defaultValue="arn:aws:kms:us-west-2:123456789012:key/..." />
											<Button size="sm" variant="outline">
												<IconKey className="size-4" />
											</Button>
										</div>
									</div>
								</CardContent>
							</Card>
						</div>

						<Card>
							<CardHeader>
								<CardTitle>RBAC Configuration</CardTitle>
								<CardDescription>
									Role-Based Access Control settings
								</CardDescription>
							</CardHeader>
							<CardContent className="space-y-4">
								<div className="flex items-center justify-between">
									<div className="space-y-0.5">
										<Label>Enable RBAC</Label>
										<p className="text-sm text-muted-foreground">
											Use role-based access control for authorization
										</p>
									</div>
									<Switch defaultChecked />
								</div>
								<Separator />
								<div className="flex items-center justify-between">
									<div className="space-y-0.5">
										<Label>Audit Logging</Label>
										<p className="text-sm text-muted-foreground">
											Log all API server requests for security audit
										</p>
									</div>
									<Switch defaultChecked />
								</div>
								<Separator />
								<div>
									<Label className="text-sm font-medium">Default Service Account</Label>
									<div className="flex items-center space-x-2 mt-1">
										<Input defaultValue="default" />
										<Button size="sm" variant="outline">
											<IconUsers className="size-4" />
										</Button>
									</div>
								</div>
							</CardContent>
						</Card>
					</TabsContent>

					{/* Add-ons Tab */}
					<TabsContent value="addons" className="space-y-6">
						<Card>
							<CardHeader>
								<CardTitle className="flex items-center">
									<IconDatabase className="size-5 mr-2" />
									Cluster Add-ons
								</CardTitle>
								<CardDescription>
									Manage cluster add-ons and extensions
								</CardDescription>
							</CardHeader>
							<CardContent>
								<div className="space-y-4">
									{addonsData.map((addon, index) => (
										<div key={index} className="flex items-center justify-between p-4 border rounded-lg">
											<div className="flex items-center space-x-4">
												<div className="flex-1">
													<div className="flex items-center space-x-2">
														<h4 className="font-medium">{addon.name}</h4>
														<Badge variant="outline">{addon.version}</Badge>
														{addon.critical && (
															<Badge variant="secondary" className="text-orange-600 border-orange-600">
																Critical
															</Badge>
														)}
													</div>
													<p className="text-sm text-muted-foreground mt-1">
														{addon.description}
													</p>
												</div>
											</div>
											<div className="flex items-center space-x-2">
												<Switch
													checked={addon.status === "enabled"}
													disabled={addon.critical}
												/>
												<DropdownMenu>
													<DropdownMenuTrigger asChild>
														<Button variant="ghost" size="sm">
															<IconSettings className="size-4" />
														</Button>
													</DropdownMenuTrigger>
													<DropdownMenuContent align="end">
														<DropdownMenuItem>
															<IconEdit className="size-4 mr-2" />
															Configure
														</DropdownMenuItem>
														<DropdownMenuItem>
															<IconRefresh className="size-4 mr-2" />
															Update
														</DropdownMenuItem>
														<DropdownMenuSeparator />
														<DropdownMenuItem>
															<IconEye className="size-4 mr-2" />
															View Logs
														</DropdownMenuItem>
													</DropdownMenuContent>
												</DropdownMenu>
											</div>
										</div>
									))}
								</div>
							</CardContent>
						</Card>
					</TabsContent>

					{/* Backup Tab */}
					<TabsContent value="backup" className="space-y-6">
						<Card>
							<CardHeader>
								<CardTitle className="flex items-center">
									<IconDatabase className="size-5 mr-2" />
									Backup Policies
								</CardTitle>
								<CardDescription>
									Configure automated backup and disaster recovery
								</CardDescription>
							</CardHeader>
							<CardContent>
								<div className="flex justify-between items-center mb-4">
									<div></div>
									<Button>
										<IconPlus className="size-4 mr-2" />
										Create Backup Policy
									</Button>
								</div>
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>Name</TableHead>
											<TableHead>Type</TableHead>
											<TableHead>Schedule</TableHead>
											<TableHead>Retention</TableHead>
											<TableHead>Status</TableHead>
											<TableHead>Last Backup</TableHead>
											<TableHead className="text-right">Actions</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{backupPoliciesData.map((policy, index) => (
											<TableRow key={index}>
												<TableCell className="font-medium">{policy.name}</TableCell>
												<TableCell>
													<Badge variant="outline">{policy.type}</Badge>
												</TableCell>
												<TableCell className="font-mono text-sm">{policy.schedule}</TableCell>
												<TableCell>{policy.retention}</TableCell>
												<TableCell>
													<Badge className="text-green-600 border-green-600">
														{policy.status}
													</Badge>
												</TableCell>
												<TableCell className="text-sm">
													{new Date(policy.lastBackup).toLocaleString()}
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
																<IconRefresh className="size-4 mr-2" />
																Run Now
															</DropdownMenuItem>
															<DropdownMenuItem>
																<IconEdit className="size-4 mr-2" />
																Edit
															</DropdownMenuItem>
															<DropdownMenuSeparator />
															<DropdownMenuItem className="text-destructive">
																<IconTrash className="size-4 mr-2" />
																Delete
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

					{/* Maintenance Tab */}
					<TabsContent value="maintenance" className="space-y-6">
						<div className="grid gap-6 md:grid-cols-2">
							<Card>
								<CardHeader>
									<CardTitle className="flex items-center">
										<IconClock className="size-5 mr-2" />
										Maintenance Windows
									</CardTitle>
								</CardHeader>
								<CardContent className="space-y-4">
									<div>
										<Label className="text-sm font-medium">Preferred Maintenance Window</Label>
										<Select defaultValue="sunday-02-00">
											<SelectTrigger className="mt-1">
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="sunday-02-00">Sunday 02:00 UTC</SelectItem>
												<SelectItem value="saturday-03-00">Saturday 03:00 UTC</SelectItem>
												<SelectItem value="daily-01-00">Daily 01:00 UTC</SelectItem>
											</SelectContent>
										</Select>
									</div>
									<div>
										<Label className="text-sm font-medium">Duration (hours)</Label>
										<Input defaultValue="4" type="number" className="mt-1" />
									</div>
									<div className="flex items-center justify-between">
										<div className="space-y-0.5">
											<Label>Auto-apply Updates</Label>
											<p className="text-sm text-muted-foreground">
												Automatically apply security updates
											</p>
										</div>
										<Switch defaultChecked />
									</div>
								</CardContent>
							</Card>

							<Card>
								<CardHeader>
									<CardTitle>Cluster Operations</CardTitle>
								</CardHeader>
								<CardContent className="space-y-4">
									<Button variant="outline" className="w-full justify-start">
										<IconRefresh className="size-4 mr-2" />
										Restart Cluster Components
									</Button>
									<Button variant="outline" className="w-full justify-start">
										<IconDownload className="size-4 mr-2" />
										Download Cluster Config
									</Button>
									<Button variant="outline" className="w-full justify-start">
										<IconUpload className="size-4 mr-2" />
										Upload Certificate
									</Button>
									<Separator />
									<Button variant="destructive" className="w-full justify-start">
										<IconTrash className="size-4 mr-2" />
										Delete Cluster
									</Button>
								</CardContent>
							</Card>
						</div>

						<Card>
							<CardHeader>
								<CardTitle>Cluster Upgrade</CardTitle>
								<CardDescription>
									Upgrade your cluster to the latest Kubernetes version
								</CardDescription>
							</CardHeader>
							<CardContent className="space-y-4">
								<div className="flex items-center justify-between p-4 border rounded-lg">
									<div>
										<h4 className="font-medium">Current Version: {clusterInfo.version}</h4>
										<p className="text-sm text-muted-foreground">
											Latest available: v1.29.0
										</p>
									</div>
									<Button>
										<IconGitBranch className="size-4 mr-2" />
										Upgrade to v1.29.0
									</Button>
								</div>
								<Alert>
									<IconAlertTriangle className="size-4" />
									<AlertTitle>Important</AlertTitle>
									<AlertDescription>
										Cluster upgrades can take 15-30 minutes and may cause temporary service disruption.
										Please plan accordingly and ensure you have recent backups.
									</AlertDescription>
								</Alert>
							</CardContent>
						</Card>
					</TabsContent>
				</Tabs>
			</div>
		</div>
	)
}

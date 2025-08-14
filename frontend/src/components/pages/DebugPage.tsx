"use client"

import * as React from "react"
import { useState, useEffect } from "react"
import { useAuth } from "@/hooks/useAuth"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { RefreshCw, User, Users, Info, Shield, Settings, Server } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

interface RBACPermission {
	resource: string
	verb: string
	namespace?: string
	allowed: boolean
	reason?: string
}

interface RBACInfo {
	effective_permissions: RBACPermission[]
	user_bindings: {
		found: boolean
		lookup_key?: string
		hash_key?: string
		groups?: string[]
		namespaces?: string[]
	}
	group_permissions: {
		[group: string]: {
			cluster_roles: string[]
			namespace_roles: {
				[namespace: string]: string[]
			}
		}
	}
	summary: {
		total_permissions: number
		allowed_permissions: number
		denied_permissions: number
		cluster_admin: boolean
		admin_groups: string[]
	}
}

interface DebugUserData {
	user: {
		sub: string
		id: string
		email: string
		name: string
		picture?: string
	}
	groups: string[]
	kubernetes_identity: {
		effective_username?: string
		effective_uid?: string
		effective_groups?: string[]
		effective_extra?: Record<string, string[]>
		impersonated_username?: string
		impersonated_groups?: string[]
		impersonated_extra?: Record<string, string[]>
		note?: string
		error?: string
	}
	rbac: RBACInfo
	extra: {
		auth_mode: string
		auth_method: string
		username_format: string
		authz_mode: string
		bindings_source: string
		request_headers: Record<string, string>
		cookies: Record<string, string>
		session_manager_available: boolean
		user_sub_field: string
		user_id_field: string
		has_impersonated_clients: boolean
	}
}

export function DebugPage() {
	const { user, isAuthenticated, authMode, isLoading } = useAuth()
	const [debugData, setDebugData] = useState<DebugUserData | null>(null)
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [lastUpdated, setLastUpdated] = useState<string | null>(null)

	const fetchDebugData = async () => {
		setLoading(true)
		setError(null)

		try {
			const response = await fetch('/api/v1/auth/debug', {
				credentials: 'include',
				headers: {
					'Content-Type': 'application/json',
				},
			})

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`)
			}

			const data = await response.json()
			setDebugData(data)
			setLastUpdated(new Date().toLocaleTimeString())
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Unknown error')
		} finally {
			setLoading(false)
		}
	}

	useEffect(() => {
		if (isAuthenticated && !isLoading) {
			fetchDebugData()
		}
	}, [isAuthenticated, isLoading])

	if (isLoading) {
		return (
			<div className="flex items-center justify-center h-64">
				<div className="flex items-center space-x-2">
					<RefreshCw className="h-4 w-4 animate-spin" />
					<span>Loading authentication state...</span>
				</div>
			</div>
		)
	}

	if (!isAuthenticated) {
		return (
			<div className="flex items-center justify-center h-64">
				<Card className="max-w-md">
					<CardHeader>
						<CardTitle className="flex items-center space-x-2">
							<Shield className="h-5 w-5 text-red-500" />
							<span>Not Authenticated</span>
						</CardTitle>
						<CardDescription>
							You need to be logged in to view debug information.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<Button onClick={() => window.location.href = '/login'} className="w-full">
							Go to Login
						</Button>
					</CardContent>
				</Card>
			</div>
		)
	}

	return (
		<div className="px-4 lg:px-6">
			<div className="space-y-6">
				<div className="flex items-center justify-between">
					<div>
						<h1 className="text-3xl font-bold">Authentication Debug</h1>
						<p className="text-muted-foreground">
							Debug information about your current authentication state
						</p>
					</div>
					<div className="flex items-center space-x-2">
						{lastUpdated && (
							<span className="text-sm text-muted-foreground">
								Last updated: {lastUpdated}
							</span>
						)}
						<Button
							onClick={fetchDebugData}
							disabled={loading}
							variant="outline"
							size="sm"
						>
							<RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
							Refresh
						</Button>
					</div>
				</div>

				{error && (
					<Card className="border-red-200 bg-red-50">
						<CardContent className="pt-6">
							<div className="flex items-center space-x-2">
								<div className="h-4 w-4 rounded-full bg-red-500"></div>
								<span className="text-red-700 font-medium">Error</span>
							</div>
							<p className="text-red-600 mt-2">{error}</p>
						</CardContent>
					</Card>
				)}

				<Tabs defaultValue="user" className="space-y-4">
					<TabsList>
						<TabsTrigger value="user" className="flex items-center space-x-2">
							<User className="h-4 w-4" />
							<span>User Info</span>
						</TabsTrigger>
						<TabsTrigger value="groups" className="flex items-center space-x-2">
							<Users className="h-4 w-4" />
							<span>Groups</span>
						</TabsTrigger>
						<TabsTrigger value="rbac" className="flex items-center space-x-2">
							<Shield className="h-4 w-4" />
							<span>RBAC & Permissions</span>
						</TabsTrigger>
						<TabsTrigger value="kubernetes" className="flex items-center space-x-2">
							<Server className="h-4 w-4" />
							<span>Kubernetes Identity</span>
						</TabsTrigger>
						<TabsTrigger value="extra" className="flex items-center space-x-2">
							<Settings className="h-4 w-4" />
							<span>Extra Info</span>
						</TabsTrigger>
						<TabsTrigger value="frontend" className="flex items-center space-x-2">
							<Info className="h-4 w-4" />
							<span>Frontend State</span>
						</TabsTrigger>
					</TabsList>

					<TabsContent value="user">
						<Card>
							<CardHeader>
								<CardTitle className="flex items-center space-x-2">
									<User className="h-5 w-5" />
									<span>User Information</span>
								</CardTitle>
								<CardDescription>
									Current user information from the API server
								</CardDescription>
							</CardHeader>
							<CardContent className="space-y-4">
								{debugData ? (
									<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
										<div>
											<label className="text-sm font-medium text-muted-foreground">Subject (sub)</label>
											<p className="font-mono text-sm bg-muted p-2 rounded">{debugData.user.sub}</p>
										</div>
										<div>
											<label className="text-sm font-medium text-muted-foreground">User ID</label>
											<p className="font-mono text-sm bg-muted p-2 rounded">{debugData.user.id}</p>
										</div>
										<div>
											<label className="text-sm font-medium text-muted-foreground">Email</label>
											<p className="font-mono text-sm bg-muted p-2 rounded">{debugData.user.email}</p>
										</div>
										<div>
											<label className="text-sm font-medium text-muted-foreground">Name</label>
											<p className="font-mono text-sm bg-muted p-2 rounded">{debugData.user.name}</p>
										</div>
										{debugData.user.picture && (
											<div className="md:col-span-2">
												<label className="text-sm font-medium text-muted-foreground">Picture URL</label>
												<p className="font-mono text-sm bg-muted p-2 rounded break-all">{debugData.user.picture}</p>
											</div>
										)}
									</div>
								) : (
									<p className="text-muted-foreground">No debug data available</p>
								)}
							</CardContent>
						</Card>
					</TabsContent>

					<TabsContent value="groups">
						<Card>
							<CardHeader>
								<CardTitle className="flex items-center space-x-2">
									<Users className="h-5 w-5" />
									<span>Groups</span>
								</CardTitle>
								<CardDescription>
									Groups assigned to your user account
								</CardDescription>
							</CardHeader>
							<CardContent>
								{debugData?.groups && debugData.groups.length > 0 ? (
									<div className="space-y-4">
										<div>
											<p className="text-sm text-muted-foreground mb-3">
												You are a member of {debugData.groups.length} group(s):
											</p>
											<div className="flex flex-wrap gap-2">
												{debugData.groups.map((group, index) => {
													const isAdminGroup = debugData.rbac?.summary?.admin_groups?.includes(group)
													return (
														<Badge
															key={index}
															variant={isAdminGroup ? "default" : "secondary"}
															className={isAdminGroup ? "bg-red-600 hover:bg-red-700" : ""}
														>
															{group}
															{isAdminGroup && " (Admin)"}
														</Badge>
													)
												})}
											</div>
										</div>

										{debugData.rbac?.user_bindings && (
											<div className="pt-4 border-t">
												<h4 className="font-medium mb-3">User Binding Lookup</h4>
												<div className="space-y-2">
													{debugData.rbac.user_bindings.found ? (
														<div className="p-3 bg-green-50 border border-green-200 rounded-lg">
															<div className="flex items-center space-x-2 mb-2">
																<div className="h-2 w-2 rounded-full bg-green-500"></div>
																<span className="text-green-800 font-medium">User binding found</span>
															</div>
															{debugData.rbac.user_bindings.lookup_key && (
																<p className="text-green-700 text-sm">
																	<span className="font-medium">Lookup key:</span> {debugData.rbac.user_bindings.lookup_key}
																</p>
															)}
															{debugData.rbac.user_bindings.hash_key && (
																<p className="text-green-700 text-sm">
																	<span className="font-medium">Hash key:</span> {debugData.rbac.user_bindings.hash_key}
																</p>
															)}
														</div>
													) : (
														<div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
															<div className="flex items-center space-x-2">
																<div className="h-2 w-2 rounded-full bg-yellow-500"></div>
																<span className="text-yellow-800 font-medium">No user binding found</span>
															</div>
															<p className="text-yellow-700 text-sm mt-1">
																Using default groups or IdP groups
															</p>
														</div>
													)}
												</div>
											</div>
										)}
									</div>
								) : (
									<p className="text-muted-foreground">No groups assigned</p>
								)}
							</CardContent>
						</Card>
					</TabsContent>

					<TabsContent value="rbac">
						<div className="space-y-6">
							{/* RBAC Summary Card */}
							<Card>
								<CardHeader>
									<CardTitle className="flex items-center space-x-2">
										<Shield className="h-5 w-5" />
										<span>RBAC Summary</span>
									</CardTitle>
									<CardDescription>
										Overview of your role-based access control permissions
									</CardDescription>
								</CardHeader>
								<CardContent>
									{debugData?.rbac?.summary ? (
										<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
											<div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
												<div className="text-2xl font-bold text-blue-600">
													{debugData.rbac.summary.total_permissions}
												</div>
												<div className="text-sm text-blue-700">Total Permissions Checked</div>
											</div>
											<div className="p-4 bg-green-50 border border-green-200 rounded-lg">
												<div className="text-2xl font-bold text-green-600">
													{debugData.rbac.summary.allowed_permissions}
												</div>
												<div className="text-sm text-green-700">Allowed</div>
											</div>
											<div className="p-4 bg-red-50 border border-red-200 rounded-lg">
												<div className="text-2xl font-bold text-red-600">
													{debugData.rbac.summary.denied_permissions}
												</div>
												<div className="text-sm text-red-700">Denied</div>
											</div>
											<div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
												<div className={`text-2xl font-bold ${debugData.rbac.summary.cluster_admin ? 'text-purple-600' : 'text-gray-500'}`}>
													{debugData.rbac.summary.cluster_admin ? 'YES' : 'NO'}
												</div>
												<div className="text-sm text-purple-700">Cluster Admin</div>
											</div>
										</div>
									) : (
										<p className="text-muted-foreground">RBAC information not available</p>
									)}
								</CardContent>
							</Card>

							{/* Group Permissions Card */}
							{debugData?.rbac?.group_permissions && Object.keys(debugData.rbac.group_permissions).length > 0 && (
								<Card>
									<CardHeader>
										<CardTitle>Group Permissions</CardTitle>
										<CardDescription>
											Roles assigned to your groups
										</CardDescription>
									</CardHeader>
									<CardContent>
										<div className="space-y-6">
											{Object.entries(debugData.rbac.group_permissions).map(([group, permissions]) => (
												<div key={group} className="border rounded-lg p-4">
													<div className="flex items-center space-x-2 mb-4">
														<Badge variant="outline" className="text-sm">{group}</Badge>
														{debugData.rbac?.summary?.admin_groups?.includes(group) && (
															<Badge variant="destructive" className="text-xs">Admin Group</Badge>
														)}
													</div>

													<div className="space-y-3">
														{permissions.cluster_roles.length > 0 && (
															<div>
																<h5 className="text-sm font-medium text-muted-foreground mb-2">Cluster Roles</h5>
																<div className="flex flex-wrap gap-2">
																	{permissions.cluster_roles.map((role, index) => (
																		<Badge key={index} variant="default" className="text-xs">
																			{role}
																		</Badge>
																	))}
																</div>
															</div>
														)}

														{Object.keys(permissions.namespace_roles).length > 0 && (
															<div>
																<h5 className="text-sm font-medium text-muted-foreground mb-2">Namespace Roles</h5>
																<div className="space-y-2">
																	{Object.entries(permissions.namespace_roles).map(([namespace, roles]) => (
																		<div key={namespace} className="flex items-center space-x-2">
																			<Badge variant="outline" className="text-xs">{namespace}</Badge>
																			<div className="flex flex-wrap gap-1">
																				{roles.map((role, index) => (
																					<Badge key={index} variant="secondary" className="text-xs">
																						{role}
																					</Badge>
																				))}
																			</div>
																		</div>
																	))}
																</div>
															</div>
														)}
													</div>
												</div>
											))}
										</div>
									</CardContent>
								</Card>
							)}

							{/* Detailed Permissions Card */}
							{debugData?.rbac?.effective_permissions && debugData.rbac.effective_permissions.length > 0 && (
								<Card>
									<CardHeader>
										<CardTitle>Detailed Permissions</CardTitle>
										<CardDescription>
											Specific permissions checked for your user
										</CardDescription>
									</CardHeader>
									<CardContent>
										<div className="space-y-3">
											{debugData.rbac.effective_permissions.map((permission, index) => (
												<div
													key={index}
													className={`flex items-center justify-between p-3 rounded-lg border ${permission.allowed
															? 'bg-green-50 border-green-200'
															: 'bg-red-50 border-red-200'
														}`}
												>
													<div className="flex items-center space-x-3">
														<div className={`h-2 w-2 rounded-full ${permission.allowed ? 'bg-green-500' : 'bg-red-500'
															}`}></div>
														<div>
															<div className="font-mono text-sm">
																{permission.verb} {permission.resource}
																{permission.namespace && (
																	<span className="text-muted-foreground"> in {permission.namespace}</span>
																)}
															</div>
															{permission.reason && (
																<div className="text-xs text-muted-foreground mt-1">
																	{permission.reason}
																</div>
															)}
														</div>
													</div>
													<Badge
														variant={permission.allowed ? "default" : "destructive"}
														className="text-xs"
													>
														{permission.allowed ? "Allowed" : "Denied"}
													</Badge>
												</div>
											))}
										</div>
									</CardContent>
								</Card>
							)}
						</div>
					</TabsContent>

					<TabsContent value="kubernetes">
						<Card>
							<CardHeader>
								<CardTitle className="flex items-center space-x-2">
									<Server className="h-5 w-5" />
									<span>Kubernetes Identity</span>
								</CardTitle>
								<CardDescription>
									Your effective Kubernetes user identity (via SelfSubjectReview)
								</CardDescription>
							</CardHeader>
							<CardContent>
								{debugData?.kubernetes_identity ? (
									debugData.kubernetes_identity.error ? (
										<div className="space-y-4">
											<div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
												<p className="text-yellow-800 font-medium">Unable to fetch Kubernetes identity</p>
												<p className="text-yellow-700 text-sm mt-1">{debugData.kubernetes_identity.error}</p>
											</div>

											{(debugData.kubernetes_identity.impersonated_username ||
												debugData.kubernetes_identity.impersonated_groups) && (
													<div>
														<h4 className="font-medium mb-3">Configured Impersonation</h4>
														<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
															{debugData.kubernetes_identity.impersonated_username && (
																<div>
																	<label className="text-sm font-medium text-muted-foreground">Impersonated Username</label>
																	<p className="font-mono text-sm bg-muted p-2 rounded">{debugData.kubernetes_identity.impersonated_username}</p>
																</div>
															)}
															{debugData.kubernetes_identity.impersonated_groups && debugData.kubernetes_identity.impersonated_groups.length > 0 && (
																<div className="md:col-span-2">
																	<label className="text-sm font-medium text-muted-foreground">Impersonated Groups</label>
																	<div className="flex flex-wrap gap-2 mt-2">
																		{debugData.kubernetes_identity.impersonated_groups.map((group, index) => (
																			<Badge key={index} variant="outline">
																				{group}
																			</Badge>
																		))}
																	</div>
																</div>
															)}
														</div>
													</div>
												)}
										</div>
									) : (
										<div className="space-y-6">
											<div>
												<h4 className="font-medium mb-3">Effective Kubernetes Identity</h4>
												<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
													{debugData.kubernetes_identity.effective_username && (
														<div>
															<label className="text-sm font-medium text-muted-foreground">Username</label>
															<p className="font-mono text-sm bg-muted p-2 rounded">{debugData.kubernetes_identity.effective_username}</p>
														</div>
													)}
													{debugData.kubernetes_identity.effective_uid && (
														<div>
															<label className="text-sm font-medium text-muted-foreground">UID</label>
															<p className="font-mono text-sm bg-muted p-2 rounded">{debugData.kubernetes_identity.effective_uid}</p>
														</div>
													)}
													{debugData.kubernetes_identity.effective_groups && debugData.kubernetes_identity.effective_groups.length > 0 && (
														<div className="md:col-span-2">
															<label className="text-sm font-medium text-muted-foreground">Groups</label>
															<div className="flex flex-wrap gap-2 mt-2">
																{debugData.kubernetes_identity.effective_groups.map((group, index) => (
																	<Badge key={index} variant="default">
																		{group}
																	</Badge>
																))}
															</div>
														</div>
													)}
													{debugData.kubernetes_identity.effective_extra && Object.keys(debugData.kubernetes_identity.effective_extra).length > 0 && (
														<div className="md:col-span-2">
															<label className="text-sm font-medium text-muted-foreground">Extra Attributes</label>
															<div className="space-y-2 mt-2">
																{Object.entries(debugData.kubernetes_identity.effective_extra).map(([key, values]) => (
																	<div key={key} className="flex flex-col space-y-1">
																		<span className="text-xs font-medium text-muted-foreground">{key}</span>
																		<div className="flex flex-wrap gap-1">
																			{values.map((value, index) => (
																				<Badge key={index} variant="outline" className="text-xs">
																					{value}
																				</Badge>
																			))}
																		</div>
																	</div>
																))}
															</div>
														</div>
													)}
												</div>
											</div>

											{(debugData.kubernetes_identity.impersonated_username ||
												debugData.kubernetes_identity.impersonated_groups) && (
													<div>
														<h4 className="font-medium mb-3">Impersonation Configuration</h4>
														<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
															{debugData.kubernetes_identity.impersonated_username && (
																<div>
																	<label className="text-sm font-medium text-muted-foreground">Impersonated Username</label>
																	<p className="font-mono text-sm bg-muted p-2 rounded">{debugData.kubernetes_identity.impersonated_username}</p>
																</div>
															)}
															{debugData.kubernetes_identity.impersonated_groups && debugData.kubernetes_identity.impersonated_groups.length > 0 && (
																<div className="md:col-span-2">
																	<label className="text-sm font-medium text-muted-foreground">Impersonated Groups</label>
																	<div className="flex flex-wrap gap-2 mt-2">
																		{debugData.kubernetes_identity.impersonated_groups.map((group, index) => (
																			<Badge key={index} variant="secondary">
																				{group}
																			</Badge>
																		))}
																	</div>
																</div>
															)}
														</div>
													</div>
												)}

											{debugData.kubernetes_identity.note && (
												<div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
													<p className="text-blue-800 text-sm">{debugData.kubernetes_identity.note}</p>
												</div>
											)}
										</div>
									)
								) : (
									<p className="text-muted-foreground">No Kubernetes identity information available</p>
								)}
							</CardContent>
						</Card>
					</TabsContent>

					<TabsContent value="extra">
						<Card>
							<CardHeader>
								<CardTitle className="flex items-center space-x-2">
									<Settings className="h-5 w-5" />
									<span>Extra Information</span>
								</CardTitle>
								<CardDescription>
									Additional authentication and authorization details
								</CardDescription>
							</CardHeader>
							<CardContent>
								{debugData?.extra ? (
									<div className="space-y-6">
										<div>
											<h4 className="font-medium mb-3">Authentication Configuration</h4>
											<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
												<div>
													<label className="text-sm font-medium text-muted-foreground">Auth Mode</label>
													<p className="font-mono text-sm bg-muted p-2 rounded">{debugData.extra.auth_mode}</p>
												</div>
												<div>
													<label className="text-sm font-medium text-muted-foreground">Auth Method</label>
													<p className="font-mono text-sm bg-muted p-2 rounded">{debugData.extra.auth_method}</p>
												</div>
												<div>
													<label className="text-sm font-medium text-muted-foreground">Username Format</label>
													<p className="font-mono text-sm bg-muted p-2 rounded">{debugData.extra.username_format}</p>
												</div>
												<div>
													<label className="text-sm font-medium text-muted-foreground">Session Manager</label>
													<Badge variant={debugData.extra.session_manager_available ? "default" : "secondary"}>
														{debugData.extra.session_manager_available ? "Available" : "Not Available"}
													</Badge>
												</div>
											</div>
										</div>

										<div>
											<h4 className="font-medium mb-3">Authorization Configuration</h4>
											<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
												<div>
													<label className="text-sm font-medium text-muted-foreground">Authz Mode</label>
													<p className="font-mono text-sm bg-muted p-2 rounded">{debugData.extra.authz_mode}</p>
												</div>
												<div>
													<label className="text-sm font-medium text-muted-foreground">Bindings Source</label>
													<p className="font-mono text-sm bg-muted p-2 rounded">{debugData.extra.bindings_source}</p>
												</div>
											</div>
										</div>

										{Object.keys(debugData.extra.request_headers).length > 0 && (
											<div>
												<h4 className="font-medium mb-3">Request Headers (Auth-related)</h4>
												<div className="space-y-2">
													{Object.entries(debugData.extra.request_headers).map(([key, value]) => (
														<div key={key} className="flex flex-col space-y-1">
															<label className="text-sm font-medium text-muted-foreground">{key}</label>
															<p className="font-mono text-sm bg-muted p-2 rounded break-all">{value}</p>
														</div>
													))}
												</div>
											</div>
										)}

										{Object.keys(debugData.extra.cookies).length > 0 && (
											<div>
												<h4 className="font-medium mb-3">Cookies (Auth-related)</h4>
												<div className="space-y-2">
													{Object.entries(debugData.extra.cookies).map(([key, value]) => (
														<div key={key} className="flex flex-col space-y-1">
															<label className="text-sm font-medium text-muted-foreground">{key}</label>
															<p className="font-mono text-sm bg-muted p-2 rounded break-all">{value}</p>
														</div>
													))}
												</div>
											</div>
										)}
									</div>
								) : (
									<p className="text-muted-foreground">No extra data available</p>
								)}
							</CardContent>
						</Card>
					</TabsContent>

					<TabsContent value="frontend">
						<Card>
							<CardHeader>
								<CardTitle className="flex items-center space-x-2">
									<Info className="h-5 w-5" />
									<span>Frontend State</span>
								</CardTitle>
								<CardDescription>
									Authentication state as seen by the frontend
								</CardDescription>
							</CardHeader>
							<CardContent>
								<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
									<div>
										<label className="text-sm font-medium text-muted-foreground">Auth Mode</label>
										<p className="font-mono text-sm bg-muted p-2 rounded">{authMode || 'unknown'}</p>
									</div>
									<div>
										<label className="text-sm font-medium text-muted-foreground">Authenticated</label>
										<Badge variant={isAuthenticated ? "default" : "secondary"}>
											{isAuthenticated ? "Yes" : "No"}
										</Badge>
									</div>
									{user && (
										<>
											<div>
												<label className="text-sm font-medium text-muted-foreground">User ID</label>
												<p className="font-mono text-sm bg-muted p-2 rounded">{user.id}</p>
											</div>
											<div>
												<label className="text-sm font-medium text-muted-foreground">Email</label>
												<p className="font-mono text-sm bg-muted p-2 rounded">{user.email}</p>
											</div>
											<div>
												<label className="text-sm font-medium text-muted-foreground">Name</label>
												<p className="font-mono text-sm bg-muted p-2 rounded">{user.name}</p>
											</div>
											{user.groups && user.groups.length > 0 && (
												<div className="md:col-span-2">
													<label className="text-sm font-medium text-muted-foreground">Frontend Groups</label>
													<div className="flex flex-wrap gap-2 mt-2">
														{user.groups.map((group, index) => (
															<Badge key={index} variant="outline">
																{group}
															</Badge>
														))}
													</div>
												</div>
											)}
										</>
									)}
								</div>
							</CardContent>
						</Card>
					</TabsContent>
				</Tabs>
			</div>
		</div>
	)
}

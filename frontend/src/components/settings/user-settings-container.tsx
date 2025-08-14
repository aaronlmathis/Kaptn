"use client"

import * as React from "react"
import {
	IconUsers,
	IconUserPlus,
	IconUserMinus,
	IconShield,
	IconKey,
	IconSettings,
	IconEdit,
	IconTrash,
	IconPlus,
	IconEye,
	IconCopy,
	IconCheck,
	IconSearch,
	IconDownload,
	IconUpload,
} from "@tabler/icons-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
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

// Mock data for users
const usersData = [
	{
		id: "1",
		name: "John Doe",
		email: "john.doe@company.com",
		role: "cluster-admin",
		status: "active",
		lastLogin: "2024-08-13T08:30:00Z",
		groups: ["admin", "developers"],
		avatar: "/avatars/john-doe.jpg",
	},
	{
		id: "2",
		name: "Jane Smith",
		email: "jane.smith@company.com",
		role: "developer",
		status: "active",
		lastLogin: "2024-08-12T14:22:00Z",
		groups: ["developers", "qa"],
		avatar: "/avatars/jane-smith.jpg",
	},
	{
		id: "3",
		name: "Bob Wilson",
		email: "bob.wilson@company.com",
		role: "viewer",
		status: "inactive",
		lastLogin: "2024-08-10T09:15:00Z",
		groups: ["readonly"],
		avatar: "/avatars/bob-wilson.jpg",
	},
]

const rolesData = [
	{
		name: "cluster-admin",
		description: "Full administrative access to the cluster",
		permissions: ["*"],
		users: 3,
		builtin: true,
	},
	{
		name: "developer",
		description: "Can deploy and manage applications",
		permissions: ["get", "list", "create", "update", "delete"],
		users: 8,
		builtin: false,
	},
	{
		name: "viewer",
		description: "Read-only access to cluster resources",
		permissions: ["get", "list"],
		users: 12,
		builtin: false,
	},
]

const groupsData = [
	{
		name: "admin",
		description: "System administrators",
		members: 3,
		roles: ["cluster-admin"],
	},
	{
		name: "developers",
		description: "Application developers",
		members: 8,
		roles: ["developer"],
	},
	{
		name: "qa",
		description: "Quality assurance team",
		members: 4,
		roles: ["developer", "viewer"],
	},
	{
		name: "readonly",
		description: "Read-only users",
		members: 12,
		roles: ["viewer"],
	},
]

export function UserSettingsContainer() {
	const [activeTab, setActiveTab] = React.useState("users")
	const [showInactiveUsers, setShowInactiveUsers] = React.useState(false)
	const [userFilter, setUserFilter] = React.useState("")
	const [isAddUserDialogOpen, setIsAddUserDialogOpen] = React.useState(false)

	const filteredUsers = usersData.filter(user => {
		const matchesFilter = user.name.toLowerCase().includes(userFilter.toLowerCase()) ||
			user.email.toLowerCase().includes(userFilter.toLowerCase())
		const matchesStatus = showInactiveUsers || user.status === "active"
		return matchesFilter && matchesStatus
	})

	return (
		<div className="px-4 lg:px-6">
			<div className="space-y-6">
				{/* Header */}
				<div className="flex flex-col space-y-2">
					<div className="flex items-center justify-between">
						<div>
							<h1 className="text-3xl font-bold tracking-tight">User Management</h1>
							<p className="text-muted-foreground">
								Manage users, roles, and permissions for your cluster
							</p>
						</div>
						<div className="flex items-center space-x-2">
							<Button variant="outline" size="sm">
								<IconDownload className="size-4 mr-2" />
								Export Users
							</Button>
							<Button variant="outline" size="sm">
								<IconUpload className="size-4 mr-2" />
								Import Users
							</Button>
							<Button size="sm" onClick={() => setIsAddUserDialogOpen(true)}>
								<IconUserPlus className="size-4 mr-2" />
								Add User
							</Button>
						</div>
					</div>
				</div>

				{/* Stats Cards */}
				<div className="grid gap-6 md:grid-cols-4">
					<Card>
						<CardHeader className="pb-3">
							<CardTitle className="flex items-center text-sm">
								<IconUsers className="size-4 mr-2" />
								Total Users
							</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="text-2xl font-bold">23</div>
							<p className="text-xs text-muted-foreground">
								+2 this month
							</p>
						</CardContent>
					</Card>
					<Card>
						<CardHeader className="pb-3">
							<CardTitle className="flex items-center text-sm">
								<IconCheck className="size-4 mr-2" />
								Active Users
							</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="text-2xl font-bold">19</div>
							<p className="text-xs text-muted-foreground">
								83% of total
							</p>
						</CardContent>
					</Card>
					<Card>
						<CardHeader className="pb-3">
							<CardTitle className="flex items-center text-sm">
								<IconShield className="size-4 mr-2" />
								Roles
							</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="text-2xl font-bold">7</div>
							<p className="text-xs text-muted-foreground">
								3 built-in
							</p>
						</CardContent>
					</Card>
					<Card>
						<CardHeader className="pb-3">
							<CardTitle className="flex items-center text-sm">
								<IconUsers className="size-4 mr-2" />
								Groups
							</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="text-2xl font-bold">4</div>
							<p className="text-xs text-muted-foreground">
								27 total members
							</p>
						</CardContent>
					</Card>
				</div>

				{/* Main Tabs */}
				<Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
					<TabsList className="grid w-full grid-cols-3">
						<TabsTrigger value="users">Users</TabsTrigger>
						<TabsTrigger value="roles">Roles</TabsTrigger>
						<TabsTrigger value="groups">Groups</TabsTrigger>
					</TabsList>

					{/* Users Tab */}
					<TabsContent value="users" className="space-y-6">
						<Card>
							<CardHeader>
								<CardTitle className="flex items-center">
									<IconUsers className="size-5 mr-2" />
									User Management
								</CardTitle>
								<CardDescription>
									Manage user accounts and their access permissions
								</CardDescription>
							</CardHeader>
							<CardContent>
								{/* Filters */}
								<div className="flex items-center justify-between mb-4">
									<div className="flex items-center space-x-2">
										<div className="relative">
											<IconSearch className="absolute left-2 top-2.5 size-4 text-muted-foreground" />
											<Input
												placeholder="Search users..."
												value={userFilter}
												onChange={(e) => setUserFilter(e.target.value)}
												className="pl-8 w-64"
											/>
										</div>
										<div className="flex items-center space-x-2">
											<Switch
												id="show-inactive"
												checked={showInactiveUsers}
												onCheckedChange={setShowInactiveUsers}
											/>
											<Label htmlFor="show-inactive" className="text-sm">
												Show inactive users
											</Label>
										</div>
									</div>
								</div>

								{/* Users Table */}
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>User</TableHead>
											<TableHead>Email</TableHead>
											<TableHead>Role</TableHead>
											<TableHead>Groups</TableHead>
											<TableHead>Status</TableHead>
											<TableHead>Last Login</TableHead>
											<TableHead className="text-right">Actions</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{filteredUsers.map((user) => (
											<TableRow key={user.id}>
												<TableCell>
													<div className="flex items-center space-x-3">
														<Avatar className="size-8">
															<AvatarImage src={user.avatar} />
															<AvatarFallback>
																{user.name.split(' ').map(n => n[0]).join('')}
															</AvatarFallback>
														</Avatar>
														<div>
															<div className="font-medium">{user.name}</div>
														</div>
													</div>
												</TableCell>
												<TableCell className="text-sm text-muted-foreground">
													{user.email}
												</TableCell>
												<TableCell>
													<Badge variant="outline">{user.role}</Badge>
												</TableCell>
												<TableCell>
													<div className="flex flex-wrap gap-1">
														{user.groups.map((group, index) => (
															<Badge key={index} variant="secondary" className="text-xs">
																{group}
															</Badge>
														))}
													</div>
												</TableCell>
												<TableCell>
													<Badge
														variant={user.status === "active" ? "default" : "secondary"}
														className={user.status === "active" ? "text-green-600 border-green-600" : ""}
													>
														{user.status}
													</Badge>
												</TableCell>
												<TableCell className="text-sm">
													{new Date(user.lastLogin).toLocaleDateString()}
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
																Edit User
															</DropdownMenuItem>
															<DropdownMenuItem>
																<IconKey className="size-4 mr-2" />
																Reset Password
															</DropdownMenuItem>
															<DropdownMenuItem>
																<IconShield className="size-4 mr-2" />
																Manage Roles
															</DropdownMenuItem>
															<DropdownMenuSeparator />
															<DropdownMenuItem>
																{user.status === "active" ? (
																	<>
																		<IconUserMinus className="size-4 mr-2" />
																		Deactivate
																	</>
																) : (
																	<>
																		<IconUserPlus className="size-4 mr-2" />
																		Activate
																	</>
																)}
															</DropdownMenuItem>
															<DropdownMenuSeparator />
															<DropdownMenuItem className="text-destructive">
																<IconTrash className="size-4 mr-2" />
																Delete User
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

					{/* Roles Tab */}
					<TabsContent value="roles" className="space-y-6">
						<Card>
							<CardHeader>
								<CardTitle className="flex items-center">
									<IconShield className="size-5 mr-2" />
									Role Management
								</CardTitle>
								<CardDescription>
									Define roles and their permissions
								</CardDescription>
							</CardHeader>
							<CardContent>
								<div className="flex justify-between items-center mb-4">
									<div></div>
									<Button>
										<IconPlus className="size-4 mr-2" />
										Create Role
									</Button>
								</div>

								<div className="grid gap-4">
									{rolesData.map((role, index) => (
										<div key={index} className="border rounded-lg p-4">
											<div className="flex items-center justify-between">
												<div className="flex-1">
													<div className="flex items-center space-x-2">
														<h4 className="font-medium">{role.name}</h4>
														{role.builtin && (
															<Badge variant="secondary" className="text-xs">
																Built-in
															</Badge>
														)}
													</div>
													<p className="text-sm text-muted-foreground mt-1">
														{role.description}
													</p>
													<div className="flex items-center space-x-4 mt-2">
														<div className="flex items-center space-x-1">
															<IconUsers className="size-4 text-muted-foreground" />
															<span className="text-sm text-muted-foreground">
																{role.users} users
															</span>
														</div>
														<div className="flex flex-wrap gap-1">
															{role.permissions.slice(0, 3).map((permission, i) => (
																<Badge key={i} variant="outline" className="text-xs">
																	{permission}
																</Badge>
															))}
															{role.permissions.length > 3 && (
																<Badge variant="outline" className="text-xs">
																	+{role.permissions.length - 3} more
																</Badge>
															)}
														</div>
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
																<IconEye className="size-4 mr-2" />
																View Permissions
															</DropdownMenuItem>
															<DropdownMenuItem disabled={role.builtin}>
																<IconEdit className="size-4 mr-2" />
																Edit Role
															</DropdownMenuItem>
															<DropdownMenuItem>
																<IconCopy className="size-4 mr-2" />
																Clone Role
															</DropdownMenuItem>
															<DropdownMenuSeparator />
															<DropdownMenuItem
																className="text-destructive"
																disabled={role.builtin}
															>
																<IconTrash className="size-4 mr-2" />
																Delete Role
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

					{/* Groups Tab */}
					<TabsContent value="groups" className="space-y-6">
						<Card>
							<CardHeader>
								<CardTitle className="flex items-center">
									<IconUsers className="size-5 mr-2" />
									Group Management
								</CardTitle>
								<CardDescription>
									Organize users into groups for easier permission management
								</CardDescription>
							</CardHeader>
							<CardContent>
								<div className="flex justify-between items-center mb-4">
									<div></div>
									<Button>
										<IconPlus className="size-4 mr-2" />
										Create Group
									</Button>
								</div>

								<div className="grid gap-4 md:grid-cols-2">
									{groupsData.map((group, index) => (
										<div key={index} className="border rounded-lg p-4">
											<div className="flex items-center justify-between mb-3">
												<h4 className="font-medium">{group.name}</h4>
												<DropdownMenu>
													<DropdownMenuTrigger asChild>
														<Button variant="ghost" size="sm">
															<IconSettings className="size-4" />
														</Button>
													</DropdownMenuTrigger>
													<DropdownMenuContent align="end">
														<DropdownMenuItem>
															<IconEdit className="size-4 mr-2" />
															Edit Group
														</DropdownMenuItem>
														<DropdownMenuItem>
															<IconUsers className="size-4 mr-2" />
															Manage Members
														</DropdownMenuItem>
														<DropdownMenuSeparator />
														<DropdownMenuItem className="text-destructive">
															<IconTrash className="size-4 mr-2" />
															Delete Group
														</DropdownMenuItem>
													</DropdownMenuContent>
												</DropdownMenu>
											</div>
											<p className="text-sm text-muted-foreground mb-3">
												{group.description}
											</p>
											<div className="space-y-2">
												<div className="flex justify-between text-sm">
													<span className="text-muted-foreground">Members:</span>
													<span className="font-medium">{group.members}</span>
												</div>
												<div>
													<span className="text-sm text-muted-foreground">Roles:</span>
													<div className="flex flex-wrap gap-1 mt-1">
														{group.roles.map((role, i) => (
															<Badge key={i} variant="outline" className="text-xs">
																{role}
															</Badge>
														))}
													</div>
												</div>
											</div>
										</div>
									))}
								</div>
							</CardContent>
						</Card>
					</TabsContent>
				</Tabs>

				{/* Add User Dialog */}
				<Dialog open={isAddUserDialogOpen} onOpenChange={setIsAddUserDialogOpen}>
					<DialogContent className="sm:max-w-md">
						<DialogHeader>
							<DialogTitle>Add New User</DialogTitle>
							<DialogDescription>
								Create a new user account for cluster access.
							</DialogDescription>
						</DialogHeader>
						<div className="space-y-4">
							<div>
								<Label htmlFor="name">Full Name</Label>
								<Input id="name" placeholder="John Doe" />
							</div>
							<div>
								<Label htmlFor="email">Email</Label>
								<Input id="email" type="email" placeholder="john.doe@company.com" />
							</div>
							<div>
								<Label htmlFor="role">Role</Label>
								<Select>
									<SelectTrigger>
										<SelectValue placeholder="Select a role" />
									</SelectTrigger>
									<SelectContent>
										{rolesData.map((role) => (
											<SelectItem key={role.name} value={role.name}>
												{role.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							<div>
								<Label htmlFor="groups">Groups</Label>
								<Select>
									<SelectTrigger>
										<SelectValue placeholder="Select groups" />
									</SelectTrigger>
									<SelectContent>
										{groupsData.map((group) => (
											<SelectItem key={group.name} value={group.name}>
												{group.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						</div>
						<DialogFooter>
							<Button variant="outline" onClick={() => setIsAddUserDialogOpen(false)}>
								Cancel
							</Button>
							<Button onClick={() => setIsAddUserDialogOpen(false)}>
								Create User
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			</div>
		</div>
	)
}

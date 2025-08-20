"use client"

import * as React from "react"
import { useAuth } from "@/contexts/auth-context"
import { Button } from "@/components/ui/button"
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover"
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Copy, User, Mail, Shield, Cookie, Clock, RefreshCw } from "lucide-react"

interface SessionDebugInfo {
	sessionCookie?: string
	tokenClaims?: Record<string, unknown>
	lastChecked?: Date
}

export function SessionDebugPopover() {
	const { isAuthenticated, user, authMode, isLoading, refetch } = useAuth()
	const [debugInfo, setDebugInfo] = React.useState<SessionDebugInfo>({})
	const [copied, setCopied] = React.useState<string | null>(null)

	// Get additional debug info
	React.useEffect(() => {
		const getDebugInfo = () => {
			// Try to get session cookie
			const cookies = document.cookie.split(';')
			const sessionCookie = cookies
				.find(cookie => cookie.trim().startsWith('kaptn-session='))
				?.trim()
				.substring('kaptn-session='.length)

			setDebugInfo({
				sessionCookie,
				lastChecked: new Date(),
			})
		}

		getDebugInfo() // Always get debug info, regardless of auth status
	}, [isAuthenticated])

	const handleRefresh = () => {
		console.log('Manual auth refresh triggered')
		refetch()
	}

	const copyToClipboard = async (text: string, type: string) => {
		try {
			await navigator.clipboard.writeText(text)
			setCopied(type)
			setTimeout(() => setCopied(null), 2000)
		} catch (err) {
			console.error('Failed to copy:', err)
		}
	}

	const getInitials = (name?: string, email?: string) => {
		if (name) {
			return name.split(' ').map(n => n[0]).join('').toUpperCase()
		}
		if (email) {
			return email.substring(0, 2).toUpperCase()
		}
		return 'U'
	}

	const renderValue = (label: string, value: string | undefined, copyKey?: string) => (
		<div className="space-y-1">
			<div className="text-sm font-medium text-muted-foreground">{label}</div>
			<div className="flex items-center justify-between gap-2">
				<div className="text-sm font-mono bg-muted px-2 py-1 rounded text-xs max-w-[200px] truncate">
					{value || 'N/A'}
				</div>
				{value && copyKey && (
					<Button
						variant="ghost"
						size="sm"
						className="h-6 w-6 p-0"
						onClick={() => copyToClipboard(value, copyKey)}
					>
						<Copy className="h-3 w-3" />
						{copied === copyKey && (
							<span className="sr-only">Copied!</span>
						)}
					</Button>
				)}
			</div>
		</div>
	)

	const sessionStatus = isLoading ? "Checking..." : isAuthenticated ? "Active" : "No Session"
	const buttonVariant = isLoading ? "secondary" : isAuthenticated ? "default" : "outline"

	// Extended user data with picture field - cast to allow picture property
	const extendedUser = user as (typeof user & { picture?: string }) | null

	return (
		<TooltipProvider>
			<Popover>
				<Tooltip>
					<TooltipTrigger asChild>
						<PopoverTrigger asChild>
							<Button variant={buttonVariant} size="sm" className="relative">
								<User className="h-4 w-4 mr-2" />
								{sessionStatus}
								{isAuthenticated && (
									<div className="absolute -top-1 -right-1 h-3 w-3 bg-green-500 rounded-full border-2 border-background" />
								)}
							</Button>
						</PopoverTrigger>
					</TooltipTrigger>
					<TooltipContent>
						<p>Click to view session debug information</p>
					</TooltipContent>
				</Tooltip>

				<PopoverContent className="w-96" align="end">
					<div className="space-y-4">
						{/* Header */}
						<div className="flex items-center space-x-4">
							<Avatar className="h-12 w-12">
								<AvatarImage src={extendedUser?.picture} alt={extendedUser?.name || extendedUser?.email} />
								<AvatarFallback>
									{getInitials(extendedUser?.name, extendedUser?.email)}
								</AvatarFallback>
							</Avatar>
							<div className="space-y-1">
								<h4 className="text-sm font-semibold">Session Debug</h4>
								<div className="flex items-center gap-2">
									<Badge variant={authMode ? "default" : "secondary"}>
										{authMode?.toUpperCase() || 'UNKNOWN'}
									</Badge>
									<Badge variant={isAuthenticated ? "default" : "destructive"}>
										{isAuthenticated ? "AUTHENTICATED" : "NOT AUTHENTICATED"}
									</Badge>
								</div>
							</div>
						</div>

						<Separator />

						{isAuthenticated && extendedUser ? (
							<div className="space-y-4">
								{/* User Information */}
								<div className="space-y-3">
									<div className="flex items-center gap-2">
										<Mail className="h-4 w-4 text-muted-foreground" />
										<span className="text-sm font-medium">User Details</span>
									</div>

									{renderValue("Email", extendedUser.email, "email")}
									{renderValue("Subject (sub)", extendedUser.sub, "sub")}
									{renderValue("Name", extendedUser.name, "name")}
									{renderValue("Picture URL", extendedUser.picture, "picture")}
								</div>

								<Separator />

								{/* Groups */}
								<div className="space-y-3">
									<div className="flex items-center gap-2">
										<Shield className="h-4 w-4 text-muted-foreground" />
										<span className="text-sm font-medium">Groups</span>
									</div>
									<div className="space-y-2">
										{extendedUser.groups && extendedUser.groups.length > 0 ? (
											<div className="flex flex-wrap gap-1">
												{extendedUser.groups.map((group, index) => (
													<Badge key={index} variant="outline" className="text-xs">
														{group}
													</Badge>
												))}
											</div>
										) : (
											<div className="text-sm text-muted-foreground">No groups assigned</div>
										)}
									</div>
								</div>

								<Separator />

								{/* Session Cookie */}
								<div className="space-y-3">
									<div className="flex items-center gap-2">
										<Cookie className="h-4 w-4 text-muted-foreground" />
										<span className="text-sm font-medium">Session Cookie</span>
									</div>
									{renderValue("kaptn-session", debugInfo.sessionCookie, "cookie")}
								</div>

								<Separator />

								{/* Metadata */}
								<div className="space-y-3">
									<div className="flex items-center gap-2">
										<Clock className="h-4 w-4 text-muted-foreground" />
										<span className="text-sm font-medium">Metadata</span>
										<Button
											variant="ghost"
											size="sm"
											className="h-6 w-6 p-0 ml-auto"
											onClick={handleRefresh}
											title="Refresh auth data"
										>
											<RefreshCw className="h-3 w-3" />
										</Button>
									</div>
									{renderValue("Auth Mode", authMode || undefined)}
									{renderValue("Last Checked", debugInfo.lastChecked?.toLocaleTimeString())}
								</div>
							</div>
						) : (
							<div className="text-center py-8 space-y-4">
								<div className="text-muted-foreground">
									<User className="h-12 w-12 mx-auto mb-4 opacity-50" />
									<p className="text-sm">No active session</p>
									<p className="text-xs">User is not authenticated</p>
								</div>

								{authMode && (
									<div className="space-y-2">
										<Separator />
										<div className="text-left space-y-2">
											{renderValue("Auth Mode", authMode || undefined)}
											{renderValue("Status", "Not Authenticated")}
										</div>
									</div>
								)}
							</div>
						)}

						{/* Copy feedback */}
						{copied && (
							<div className="text-xs text-green-600 text-center">
								✓ Copied {copied} to clipboard
							</div>
						)}
					</div>
				</PopoverContent>
			</Popover>
		</TooltipProvider>
	)
}

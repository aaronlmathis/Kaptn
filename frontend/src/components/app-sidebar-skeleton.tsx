"use client"

import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"

/**
 * Skeleton placeholder for the AppSidebar during client-side hydration
 */
export function AppSidebarSkeleton() {
	return (
		<Sidebar className="group" collapsible="icon">
			<SidebarHeader>
				{/* Logo skeleton */}
				<div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
					<Skeleton className="h-6 w-6" />
				</div>
				<Separator className="w-full" />

				{/* Namespace switcher skeleton */}
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton size="lg" className="cursor-default">
							<div className="bg-muted dark:bg-muted-dark text-white flex aspect-square size-8 items-center justify-center rounded-lg">
								<Skeleton className="h-4 w-4" />
							</div>
							<div className="grid flex-1 text-left text-sm leading-tight gap-1">
								<Skeleton className="h-4 w-24" />
								<Skeleton className="h-3 w-32" />
							</div>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarHeader>

			<SidebarContent className="p-0">
				<div className="flex flex-col h-full p-2 space-y-2">
					{/* Main nav skeleton */}
					{Array.from({ length: 5 }).map((_, i) => (
						<div key={i} className="space-y-1">
							<SidebarMenuButton size="sm" className="cursor-default">
								<Skeleton className="h-4 w-4" />
								<Skeleton className="h-4 w-20" />
							</SidebarMenuButton>
						</div>
					))}
				</div>
			</SidebarContent>

			<SidebarFooter>
				{/* User nav skeleton */}
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton size="lg" className="cursor-default">
							<Skeleton className="h-8 w-8 rounded-full" />
							<div className="grid flex-1 text-left text-sm leading-tight gap-1">
								<Skeleton className="h-4 w-24" />
								<Skeleton className="h-3 w-32" />
							</div>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarFooter>
		</Sidebar>
	)
}

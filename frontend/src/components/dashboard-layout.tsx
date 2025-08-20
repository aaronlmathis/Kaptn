"use client"

import * as React from "react"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import { SharedProviders } from "@/components/shared-providers"
import { AuthGuard } from "@/components/AuthGuard"

interface DashboardLayoutProps {
	children: React.ReactNode
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
	return (
		<SharedProviders>
			<AuthGuard>
				<div
					className="sidebar-layout"
					style={{
						"--sidebar-width": "calc(var(--spacing) * 72)",
						"--header-height": "calc(var(--spacing) * 12)",
					} as React.CSSProperties}
				>
					<SidebarProvider data-astro-transition-persist="sidebar">
						<AppSidebar variant="inset" />
						<SidebarInset>
							<SiteHeader />
							<main className="flex flex-1 flex-col">
								<div className="@container/main flex flex-1 flex-col gap-2">
									<div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
										{children}
									</div>
								</div>
							</main>
						</SidebarInset>
					</SidebarProvider>
				</div>
			</AuthGuard>
		</SharedProviders>
	)
}

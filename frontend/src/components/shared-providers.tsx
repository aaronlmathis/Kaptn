"use client"

import * as React from "react"
import { ThemeProvider } from "@/components/theme-provider"
import { NavigationProvider } from "@/contexts/navigation-context"
import { NamespaceProvider } from "@/contexts/namespace-context"
import { ShellProvider } from "@/contexts/shell-context"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import { Toaster } from "@/components/ui/sonner"
import { PodShellManager } from "@/components/PodShellManager"

interface SharedProvidersProps {
	children: React.ReactNode
}

export function SharedProviders({ children }: SharedProvidersProps) {
	return (
		<ThemeProvider defaultTheme="system" storageKey="k8s-dashboard-theme">
			<NavigationProvider>
				<NamespaceProvider>
					<ShellProvider>
						<div
							className="sidebar-layout"
							style={{
								"--sidebar-width": "calc(var(--spacing) * 72)",
								"--header-height": "calc(var(--spacing) * 12)",
							} as React.CSSProperties}
						>
							<SidebarProvider>
								<AppSidebar variant="inset" />
								<SidebarInset>
									<SiteHeader />
									<div className="flex flex-1 flex-col">
										<div className="@container/main flex flex-1 flex-col gap-2">
											<div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
												{children}
											</div>
										</div>
									</div>
								</SidebarInset>
							</SidebarProvider>
						</div>
						<Toaster />
						<PodShellManager />
					</ShellProvider>
				</NamespaceProvider>
			</NavigationProvider>
		</ThemeProvider>
	)
}

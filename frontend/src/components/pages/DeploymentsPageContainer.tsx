"use client"

import * as React from "react"
import { ThemeProvider } from "@/components/theme-provider"
import { NavigationProvider } from "@/contexts/navigation-context"
import { NamespaceProvider } from "@/contexts/namespace-context"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import { Toaster } from "@/components/ui/sonner"
import { DeploymentsDataTable } from "@/components/pages/DeploymentsDataTable"

export function DeploymentsPageContainer() {
	return (
		<ThemeProvider defaultTheme="system" storageKey="k8s-dashboard-theme">
			<NavigationProvider>
				<NamespaceProvider>
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
											<div className="px-4 lg:px-6">
												<div className="space-y-2">
													<h1 className="text-2xl font-bold tracking-tight">Deployments</h1>
													<p className="text-muted-foreground">
														Manage and monitor deployment resources in your Kubernetes cluster
													</p>
												</div>
											</div>
											<DeploymentsDataTable />
										</div>
									</div>
								</div>
							</SidebarInset>
						</SidebarProvider>
					</div>
					<Toaster />
				</NamespaceProvider>
			</NavigationProvider>
		</ThemeProvider>
	)
}

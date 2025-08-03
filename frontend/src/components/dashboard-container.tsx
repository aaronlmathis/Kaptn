import * as React from "react"
import { AppSidebar } from "@/components/app-sidebar"
import { KubernetesDashboard } from "@/components/kubernetes-dashboard"
import { SectionCards } from "@/components/section-cards"
import { SiteHeader } from "@/components/site-header"
import { ThemeProvider } from "@/components/theme-provider"
import { NamespaceProvider } from "@/contexts/namespace-context"
import { NavigationProvider } from "@/contexts/navigation-context"
import { ShellProvider } from "@/contexts/shell-context"
import { PodShellManager } from "@/components/PodShellManager"
import {
	SidebarInset,
	SidebarProvider,
} from "@/components/ui/sidebar"

import { Toaster } from "@/components/ui/sonner"

export function DashboardContainer() {
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
												<SectionCards />
												{/* <div className="px-4 lg:px-6">
											<ChartAreaInteractive />
										</div> */}
												<KubernetesDashboard />
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

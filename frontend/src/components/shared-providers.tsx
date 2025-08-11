"use client"

import * as React from "react"
import { ThemeProvider } from "@/components/theme-provider"
import { NavigationProvider } from "@/contexts/navigation-context"
import { NamespaceProvider } from "@/contexts/namespace-context"
import { CapabilitiesProvider } from "@/contexts/capabilities-context"
import { ShellProvider } from "@/contexts/shell-context"
import { Toaster } from "@/components/ui/sonner"
import { PodShellManager } from "@/components/PodShellManager"
import { AuthGuard } from "@/components/AuthGuard"

interface SharedProvidersProps {
	children: React.ReactNode
}

// Inner component that can access the contexts
function AppContent({ children }: { children: React.ReactNode }) {
	return (
		<>
			{children}
		</>
	)
}

export function SharedProviders({ children }: SharedProvidersProps) {
	return (
		<ThemeProvider defaultTheme="system" storageKey="k8s-dashboard-theme">
			<AuthGuard>
				<CapabilitiesProvider>
					<NavigationProvider>
						<NamespaceProvider>
							<ShellProvider>
								<AppContent>
									{children}
								</AppContent>
								<Toaster />
								<PodShellManager />
							</ShellProvider>
						</NamespaceProvider>
					</NavigationProvider>
				</CapabilitiesProvider>
			</AuthGuard>
		</ThemeProvider>
	)
}

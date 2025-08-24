"use client"

import * as React from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ThemeProvider } from "@/components/theme-provider"
import { AuthProvider } from "@/contexts/auth-context"
import { NavigationProvider } from "@/contexts/navigation-context"
import { NamespaceProvider } from "@/contexts/namespace-context"
import { CapabilitiesProvider } from "@/contexts/capabilities-context"
import { ClusterProvider } from "@/contexts/cluster-context"
import { ShellProvider } from "@/contexts/shell-context"
import { Toaster } from "@/components/ui/sonner"
import { PodShellManager } from "@/components/PodShellManager"
// import { AuthGuard } from "@/components/AuthGuard"

// Create a client for React Query
const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: 30_000, // 30 seconds default
			gcTime: 5 * 60 * 1000, // 5 minutes garbage collection
			retry: 2,
			retryDelay: 1000,
		},
	},
})

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
		<QueryClientProvider client={queryClient}>
			<ThemeProvider defaultTheme="system" storageKey="k8s-dashboard-theme">
				<AuthProvider>
					<ClusterProvider>
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
					</ClusterProvider>
				</AuthProvider>
			</ThemeProvider>
		</QueryClientProvider>
	)
}

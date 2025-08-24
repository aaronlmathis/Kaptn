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
import { AuthzErrorBoundary } from "@/components/authz/AuthzErrorBoundary"

// Create a stable query client instance
function createQueryClient() {
	return new QueryClient({
		defaultOptions: {
			queries: {
				staleTime: 30_000, // 30 seconds default
				gcTime: 5 * 60 * 1000, // 5 minutes garbage collection
				retry: 2,
				retryDelay: 1000,
			},
		},
	})
}

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
	// Create query client in component to ensure fresh instance per render tree
	const [queryClient] = React.useState(() => createQueryClient())

	return (
		<AuthzErrorBoundary>
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
		</AuthzErrorBoundary>
	)
}

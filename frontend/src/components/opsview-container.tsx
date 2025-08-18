/**
 * OpsView Container
 * 
 * Main container component for the operations view page that orchestrates
 * all the subcomponents: filter bar, section accordions, and data management.
 */

import * as React from "react";
import { AlertCircle, Wifi, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { SharedProviders } from "@/components/shared-providers";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TooltipProvider } from "@/components/ui/tooltip";
import { OpsViewFilterBar } from "@/components/opsview/filter-bar";
import { OpsViewSections } from "@/components/opsview/sections";
import { useOpsView } from "@/hooks/useOpsView";
import type { MetricFilters } from "@/lib/metrics-api";

/**
 * Status Banner Component
 */
function StatusBanner({
	isConnected,
	isLoading,
	error,
	onRetry,
}: {
	isConnected: boolean;
	isLoading: boolean;
	error?: string;
	onRetry: () => void;
}) {
	if (error) {
		return (
			<Alert variant="destructive" className="mb-4">
				<AlertCircle className="h-4 w-4" />
				<AlertTitle>Error Loading Operations Data</AlertTitle>
				<AlertDescription className="flex items-center justify-between">
					<span>{error}</span>
					<Button variant="outline" size="sm" onClick={onRetry}>
						Retry
					</Button>
				</AlertDescription>
			</Alert>
		);
	}

	if (!isConnected && !isLoading) {
		return (
			<Alert className="mb-4">
				<WifiOff className="h-4 w-4" />
				<AlertTitle>Real-time Updates Disconnected</AlertTitle>
				<AlertDescription>
					Live data streaming is not available. Operations view will show historical data only.
				</AlertDescription>
			</Alert>
		);
	}

	return null;
}

/**
 * Connection Status Component
 */
function ConnectionStatus({ isConnected }: { isConnected: boolean }) {
	return (
		<div className="fixed bottom-4 right-4 z-50">
			<Badge
				variant={isConnected ? "default" : "secondary"}
				className={cn(
					"flex items-center gap-2 px-3 py-1",
					isConnected
						? "bg-green-100 text-green-800 border-green-200 dark:bg-green-900 dark:text-green-100 dark:border-green-800"
						: "bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-700"
				)}
			>
				{isConnected ? (
					<>
						<Wifi className="h-3 w-3" />
						Live
					</>
				) : (
					<>
						<WifiOff className="h-3 w-3" />
						Offline
					</>
				)}
			</Badge>
		</div>
	);
}

/**
 * Main OpsView Container
 */
export function OpsViewContainer() {
	const {
		// State
		filters,
		density,
		// autoRefresh,
		seriesData,
		capabilities,
		expandedSections,
		isLoading,
		error,
		// availableEntities,
		isConnected,

		// Actions
		updateFilters,
		// setDensity,
		// setAutoRefresh,
		refresh,
		// searchEntities,
		setExpandedSections,
		expandAllSections,
		collapseAllSections,
		connect,
		disconnect,
	} = useOpsView();

	// Store connect function in ref to avoid dependency cycles
	const connectRef = React.useRef(connect);
	connectRef.current = connect;

	// Auto-connect on mount - only once
	const [hasAutoConnected, setHasAutoConnected] = React.useState(false);

	React.useEffect(() => {
		if (!hasAutoConnected) {
			const timer = setTimeout(() => {
				connectRef.current();
				setHasAutoConnected(true);
			}, 1000); // Small delay to allow initial data fetch

			return () => clearTimeout(timer);
		}
	}, [hasAutoConnected]);

	// Retry function for error states
	const handleRetry = React.useCallback(async () => {
		disconnect();
		await refresh();
		setTimeout(() => connect(), 500);
	}, [disconnect, refresh, connect]);

	return (
		<SharedProviders>
			<TooltipProvider>
				<div className="min-h-screen bg-background">
					{/* Filter Bar */}
					<OpsViewFilterBar
						filters={filters}
						onFiltersChange={(newFilters: MetricFilters) => updateFilters(newFilters)}
						onExpandAll={expandAllSections}
						onCollapseAll={collapseAllSections}
					/>

					{/* Main Content */}
					<div className="w-full px-4 lg:px-6 py-6">
						{/* Status Banner */}
						<StatusBanner
							isConnected={isConnected}
							isLoading={isLoading}
							error={error}
							onRetry={handleRetry}
						/>

						{/* OpsView Sections */}
						<OpsViewSections
							filters={filters}
							density={density}
							seriesData={seriesData}
							capabilities={capabilities}
							isLoading={isLoading}
							error={error}
							expandedSections={expandedSections}
							onExpandedSectionsChange={setExpandedSections}
						/>

						{/* Empty State */}
						{!isLoading && !error && Object.keys(seriesData).length === 0 && (
							<div className="flex flex-col items-center justify-center py-12 text-center">
								<div className="space-y-4">
									<div className="text-muted-foreground text-lg font-medium">
										No operations data available
									</div>
									<div className="text-sm text-muted-foreground max-w-md">
										No operational data found for the current scope and timespan.
										Try adjusting your filters or check that the operations API is working properly.
									</div>
									<Button onClick={refresh} variant="outline">
										Refresh Data
									</Button>
								</div>
							</div>
						)}
					</div>

					{/* Connection Status */}
					<ConnectionStatus isConnected={isConnected} />
				</div>
			</TooltipProvider>
		</SharedProviders>
	);
}

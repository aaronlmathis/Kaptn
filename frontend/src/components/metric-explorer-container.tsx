/**
 * Metric Explorer Container
 * 
 * Main container component for the metric explorer page that orchestrates
 * all the subcomponents: filter bar, chart sections, and data management.
 */

import * as React from "react";
import { AlertCircle, Wifi, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { SharedProviders } from "@/components/shared-providers";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TooltipProvider } from "@/components/ui/tooltip";
import { FilterBar } from "@/components/metric-explorer/filter-bar";
import { MetricSections } from "@/components/metric-explorer/sections";
import { useMetricExplorer } from "@/hooks/useMetricExplorer";

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
				<AlertTitle>Error Loading Metrics</AlertTitle>
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
					Live data streaming is not available. Charts will show historical data only.
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
 * Main Metric Explorer Container
 */
export function MetricExplorerContainer() {
	const {
		// State
		filters,
		density,
		seriesData,
		capabilities,
		expandedSections,
		isLoading,
		error,
		isConnected,

		// Actions
		updateFilters,
		refresh,
		setExpandedSections,
		connect,
		disconnect,
	} = useMetricExplorer();

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

	// Expand/collapse handlers
	const handleExpandAll = React.useCallback(() => {
		// Get all available section IDs based on current scope
		const allSectionIds = ['cpu', 'memory', 'network', 'storage', 'cluster-state', 'pods', 'containers'];
		setExpandedSections(allSectionIds);
	}, [setExpandedSections]);

	const handleCollapseAll = React.useCallback(() => {
		setExpandedSections([]);
	}, [setExpandedSections]);

	return (
		<SharedProviders>
			<TooltipProvider>
				<div className="min-h-screen bg-background">
					{/* Filter Bar */}
					<FilterBar
						filters={filters}
						onFiltersChange={updateFilters}
						onExpandAll={handleExpandAll}
						onCollapseAll={handleCollapseAll}
					/>          {/* Main Content */}
					<div className="w-full px-4 lg:px-6 py-6">
						{/* Status Banner */}
						<StatusBanner
							isConnected={isConnected}
							isLoading={isLoading}
							error={error}
							onRetry={handleRetry}
						/>

						{/* Metric Sections */}
						<MetricSections
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
										No metrics data available
									</div>
									<div className="text-sm text-muted-foreground max-w-md">
										No timeseries data found for the current scope and timespan.
										Try adjusting your filters or check that the metrics API is working properly.
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

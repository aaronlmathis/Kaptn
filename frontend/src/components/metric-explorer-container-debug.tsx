/**
 * Simplified Metric Explorer Container for debugging
 */

import * as React from "react";
import { useMetricExplorer } from "@/hooks/useMetricExplorer";
import { FilterBar } from "@/components/metric-explorer/filter-bar";
import { MetricSections } from "@/components/metric-explorer/sections";

export function MetricExplorerContainer() {
	console.log('🔄 MetricExplorerContainer rendered');

	const {
		filters,
		density,
		seriesData,
		capabilities,
		expandedSections,
		isLoading,
		error,
		updateFilters,
		expandAllSections,
		collapseAllSections,
		setExpandedSections,
	} = useMetricExplorer();

	console.log('🔄 useMetricExplorer state:', { filters, isLoading, error });

	return (
		<div className="min-h-screen bg-background">
			{/* Filter Bar */}
			<FilterBar
				filters={filters}
				onFiltersChange={updateFilters}
				onExpandAll={expandAllSections}
				onCollapseAll={collapseAllSections}
			/>

			<div className="w-full px-4 lg:px-6 py-6">
				<h1>Metric Explorer - Debug Mode</h1>

				{/* Metric Sections - Fixed version without LiveMetricAreaChart */}
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
			</div>
		</div>
	);
}

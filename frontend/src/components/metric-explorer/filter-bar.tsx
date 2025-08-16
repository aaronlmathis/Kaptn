/**
 * Filter Bar Component for Metric Explorer
 * 
 * Provides comprehensive filtering controls for timeseries metrics including
 * scope, entity, timespan, resolution, search, and display options.
 */

import * as React from "react";
import { Plus, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import type { MetricScope, Resolution, MetricFilters } from "@/lib/metrics-api";

// Filter state interface is now imported from metrics-api

// Density options
export type GridDensity = 'comfortable' | 'cozy' | 'compact';

// Auto-refresh intervals
export type AutoRefreshInterval = 'off' | '5s' | '10s' | '30s';

// Filter bar props
export interface FilterBarProps {
	filters: MetricFilters;
	onFiltersChange: (filters: MetricFilters) => void;

	// Actions
	onExpandAll: () => void;
	onCollapseAll: () => void;

	className?: string;
}

// Scope options
const SCOPE_OPTIONS: Array<{ value: MetricScope; label: string; description: string }> = [
	{ value: 'cluster', label: 'Cluster', description: 'Cluster-wide metrics and capacity' },
	{ value: 'node', label: 'Node', description: 'Individual node metrics' },
	{ value: 'namespace', label: 'Namespace', description: 'Namespace-scoped resources' },
	{ value: 'workload', label: 'Workload', description: 'Deployment, StatefulSet, DaemonSet' },
	{ value: 'pod', label: 'Pod', description: 'Individual pod metrics' },
	{ value: 'container', label: 'Container', description: 'Container-level metrics' },
];

// Resolution options
const RESOLUTION_OPTIONS: Array<{ value: Resolution; label: string; description: string }> = [
	{ value: 'lo', label: 'Low (default)', description: 'Optimized for longer time ranges' },
	{ value: 'hi', label: 'High', description: 'Higher resolution for detailed analysis' },
];

/**
 * FilterBar Component
 */
export const FilterBar: React.FC<FilterBarProps> = ({
	filters,
	onFiltersChange,
	onExpandAll,
	onCollapseAll,
	className,
}) => {

	const handleScopeChange = (scope: MetricScope) => {
		onFiltersChange({
			...filters,
			scope,
			entity: undefined, // Reset entity when scope changes
		});
	};

	const handleResolutionChange = (resolution: Resolution) => {
		onFiltersChange({ ...filters, resolution });
	};

	return (
		<div className={cn(
			"sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b",
			className
		)}>
			<div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-4">
				{/* Filter Controls - Stack on mobile, row on desktop */}
				<div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
					{/* Scope Selection */}
					<div className="flex items-center">
						<Select value={filters.scope} onValueChange={handleScopeChange}>
							<SelectTrigger className="w-[180px] text-left">
								<SelectValue placeholder="Select scope..." />
							</SelectTrigger>
							<SelectContent>
								{SCOPE_OPTIONS.map((option) => (
									<SelectItem key={option.value} value={option.value}>
										<div>
											<div className="font-medium">{option.label}</div>
											<div className="text-xs text-muted-foreground">
												{option.description}
											</div>
										</div>
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					{/* Resolution Selection */}
					<div className="flex items-center">
						<Select value={filters.resolution} onValueChange={handleResolutionChange}>
							<SelectTrigger className="w-[180px] text-left">
								<SelectValue placeholder="Select resolution..." />
							</SelectTrigger>
							<SelectContent>
								{RESOLUTION_OPTIONS.map((option) => (
									<SelectItem key={option.value} value={option.value}>
										<div>
											<div className="font-medium">{option.label}</div>
											<div className="text-xs text-muted-foreground">
												{option.description}
											</div>
										</div>
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				</div>

				{/* Action Buttons */}
				<div className="flex items-center gap-2 sm:ml-auto">
					<Button variant="outline" size="sm" onClick={onExpandAll} className="gap-1">
						<Plus className="h-4 w-4" />
						Expand all
					</Button>

					<Button variant="outline" size="sm" onClick={onCollapseAll} className="gap-1">
						<Minus className="h-4 w-4" />
						Collapse all
					</Button>
				</div>
			</div>
		</div>
	);
}

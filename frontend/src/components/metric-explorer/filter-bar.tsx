/**
 * Filter Bar Component for Metric Explorer
 * 
 * Provides comprehensive filtering controls for timeseries metrics including
 * scope, entity, timespan, resolution, search, and display options.
 */

import * as React from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { MetricScope, Resolution, MetricFilters } from "@/lib/metrics-api";

// Grid density for chart layout
export type GridDensity = 'compact' | 'cozy' | 'comfortable';

// Filter state interface is now imported from metrics-api

// Filter bar props
export interface FilterBarProps {
  filters: MetricFilters;
  onFiltersChange: (filters: MetricFilters) => void;

  // Actions
  onExpandAll: () => void;
  onCollapseAll: () => void;

  // Available entities for current scope
  availableEntities?: Array<{ id: string; name: string; labels?: Record<string, string> }>;
  onSearchEntities?: (search: string) => void;

  className?: string;
}// Scope options
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
  { value: 'lo', label: 'Low', description: 'Optimized for longer time ranges' },
  { value: 'hi', label: 'High', description: 'Higher resolution for detailed analysis' },
];

/**
 * FilterBar Component
 */
export function FilterBar({
  filters,
  onFiltersChange,
  onExpandAll,
  onCollapseAll,
  availableEntities = [],
  onSearchEntities,
  className,
}: FilterBarProps) {
  const [searchValue, setSearchValue] = React.useState(filters.search || '');
  const [entitySearchValue, setEntitySearchValue] = React.useState('');

  // Debounced search
  React.useEffect(() => {
    const timer = setTimeout(() => {
      if (searchValue !== filters.search) {
        onFiltersChange({ ...filters, search: searchValue || undefined });
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchValue, filters, onFiltersChange]);

  // Debounced entity search
  React.useEffect(() => {
    const timer = setTimeout(() => {
      onSearchEntities?.(entitySearchValue);
    }, 300);

    return () => clearTimeout(timer);
  }, [entitySearchValue, onSearchEntities]);

  const handleScopeChange = (scope: MetricScope) => {
    onFiltersChange({
      ...filters,
      scope,
      entity: undefined, // Reset entity when scope changes
    });
  };

  const handleEntityChange = (entityId: string) => {
    onFiltersChange({
      ...filters,
      entity: entityId === 'all' ? undefined : entityId,
    });
  };

  const handleResolutionChange = (resolution: Resolution) => {
    onFiltersChange({ ...filters, resolution });
  };

  return (
    <div className={cn(
      "sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border/50",
      className
    )}>
      <div className="flex flex-wrap items-center gap-6 px-6 py-5">
        {/* Primary Filter Group - Scope & Resolution */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4 px-4 py-2.5 bg-muted/30 border border-border/40 rounded-lg">
          {/* Scope Selection */}
          <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-start">
            <Label htmlFor="scope-select" className="text-sm font-medium text-foreground whitespace-nowrap">
              Scope
            </Label>
            <Select value={filters.scope} onValueChange={handleScopeChange}>
              <SelectTrigger id="scope-select" className="flex-1 sm:w-[150px] border-0 bg-background/80 shadow-sm text-left ">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SCOPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value} textValue={option.label}>
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

          <Separator orientation="vertical" className="h-8 hidden sm:block" />

          {/* Resolution Selection */}
          <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-start">
            <Label htmlFor="resolution-select" className="text-sm font-medium text-foreground whitespace-nowrap">
              Resolution
            </Label>
            <Select value={filters.resolution} onValueChange={handleResolutionChange}>
              <SelectTrigger id="resolution-select" className="flex-1 sm:w-[150px] border-0 bg-background/80 shadow-sm text-left ">
                <SelectValue />
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

        {/* Entity Selection */}
        {filters.scope !== 'cluster' && (
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <Label htmlFor="entity-select" className="text-sm font-medium text-foreground whitespace-nowrap">
              Entity
            </Label>
            <Select
              value={filters.entity || 'all'}
              onValueChange={handleEntityChange}
            >
              <SelectTrigger id="entity-select" className="w-full sm:w-[200px]">
                <SelectValue placeholder="Select entity..." />
              </SelectTrigger>
              <SelectContent>
                <div className="p-2">
                  <Input
                    placeholder="Search entities..."
                    value={entitySearchValue}
                    onChange={(e) => setEntitySearchValue(e.target.value)}
                    className="h-8"
                  />
                </div>
                <SelectItem value="all">All {filters.scope}s</SelectItem>
                {availableEntities.map((entity) => (
                  <SelectItem key={entity.id} value={entity.id}>
                    <div>
                      <div className="font-medium">{entity.name}</div>
                      {entity.labels && Object.keys(entity.labels).length > 0 && (
                        <div className="text-xs text-muted-foreground">
                          {Object.entries(entity.labels)
                            .slice(0, 2)
                            .map(([k, v]) => `${k}=${v}`)
                            .join(', ')}
                        </div>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Search - Primary Action */}
        <div className="flex items-center gap-3 flex-1 min-w-[280px] w-full sm:w-auto">
          <Label htmlFor="search-input" className="text-sm font-medium text-foreground whitespace-nowrap">
            Search
          </Label>
          <div className="relative flex-1 max-w-[400px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="search-input"
              placeholder="Filter metrics and chart titles..."
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              className="pl-10 pr-4 h-10 text-sm border-border/60 focus:border-primary/50 shadow-sm"
            />
          </div>
        </div>

        {/* Action Buttons - Secondary */}
        <div className="flex items-center gap-2 w-full sm:w-auto sm:ml-auto">
          <Button
            variant="ghost"
            size="sm"
            onClick={onExpandAll}
            className="flex-1 sm:flex-none text-muted-foreground hover:text-foreground border border-border/40 hover:border-border"
          >
            Expand all
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={onCollapseAll}
            className="flex-1 sm:flex-none text-muted-foreground hover:text-foreground border border-border/40 hover:border-border"
          >
            Collapse all
          </Button>
        </div>
      </div>
    </div>
  );
}
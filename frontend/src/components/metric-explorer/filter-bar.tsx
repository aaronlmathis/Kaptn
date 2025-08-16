/**
 * Filter Bar Component for Metric Explorer
 * 
 * Provides comprehensive filtering controls for timeseries metrics including
 * scope, entity, timespan, resolution, search, and display options.
 */

import * as React from "react";
import { Search, RefreshCw, Info, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group";
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
  
  // Display options
  density: GridDensity;
  onDensityChange: (density: GridDensity) => void;
  
  // Auto-refresh
  autoRefresh: AutoRefreshInterval;
  onAutoRefreshChange: (interval: AutoRefreshInterval) => void;
  
  // Actions
  onRefresh: () => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  
  // State
  isLoading?: boolean;
  capabilities?: {
    metricsAPI: boolean;
    summaryAPI: boolean;
  } | null;
  
  // Available entities for current scope
  availableEntities?: Array<{ id: string; name: string; labels?: Record<string, string> }>;
  onSearchEntities?: (search: string) => void;
  
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
export function FilterBar({
  filters,
  onFiltersChange,
  density,
  onDensityChange,
  autoRefresh,
  onAutoRefreshChange,
  onRefresh,
  onExpandAll,
  onCollapseAll,
  isLoading = false,
  capabilities,
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
      "sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b",
      className
    )}>
      <div className="flex flex-wrap items-center gap-3 p-4">
        {/* Scope Selection */}
        <div className="flex items-center gap-2">
          <Label htmlFor="scope-select" className="text-sm font-medium">
            Scope
          </Label>
          <Select value={filters.scope} onValueChange={handleScopeChange}>
            <SelectTrigger id="scope-select" className="w-[140px]">
              <SelectValue />
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
        
        {/* Entity Selection */}
        {filters.scope !== 'cluster' && (
          <div className="flex items-center gap-2">
            <Label htmlFor="entity-select" className="text-sm font-medium">
              Entity
            </Label>
            <Select
              value={filters.entity || 'all'}
              onValueChange={handleEntityChange}
            >
              <SelectTrigger id="entity-select" className="w-[180px]">
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
        
        <Separator orientation="vertical" className="h-6" />
        
        {/* Resolution Selection */}
        <div className="flex items-center gap-2">
          <Label htmlFor="resolution-select" className="text-sm font-medium">
            Resolution
          </Label>
          <Select value={filters.resolution} onValueChange={handleResolutionChange}>
            <SelectTrigger id="resolution-select" className="w-[120px]">
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
        
        <Separator orientation="vertical" className="h-6" />
        
        {/* Search */}
        <div className="flex items-center gap-2">
          <Label htmlFor="search-input" className="text-sm font-medium">
            Search
          </Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="search-input"
              placeholder="Filter metrics..."
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              className="w-[200px] pl-9"
            />
          </div>
        </div>
        
        <Separator orientation="vertical" className="h-6" />
        
        {/* Density Toggle */}
        <div className="flex items-center gap-2">
          <Label className="text-sm font-medium">Density</Label>
          <ToggleGroup
            type="single"
            value={density}
            onValueChange={(value: string) => value && onDensityChange(value as GridDensity)}
            className="h-9"
          >
            <ToggleGroupItem value="comfortable" className="px-3">
              Comfortable
            </ToggleGroupItem>
            <ToggleGroupItem value="cozy" className="px-3">
              Cozy
            </ToggleGroupItem>
            <ToggleGroupItem value="compact" className="px-3">
              Compact
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
        
        <Separator orientation="vertical" className="h-6" />
        
        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={isLoading}
            className="gap-2"
          >
            <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
            Refresh
          </Button>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                Auto-refresh
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => onAutoRefreshChange('off')}
                className={autoRefresh === 'off' ? 'bg-accent' : ''}
              >
                Off
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onAutoRefreshChange('5s')}
                className={autoRefresh === '5s' ? 'bg-accent' : ''}
              >
                Every 5 seconds
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onAutoRefreshChange('10s')}
                className={autoRefresh === '10s' ? 'bg-accent' : ''}
              >
                Every 10 seconds
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onAutoRefreshChange('30s')}
                className={autoRefresh === '30s' ? 'bg-accent' : ''}
              >
                Every 30 seconds
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          
          <Button variant="outline" size="sm" onClick={onExpandAll}>
            Expand all
          </Button>
          
          <Button variant="outline" size="sm" onClick={onCollapseAll}>
            Collapse all
          </Button>
        </div>
        
        {/* Capability Status */}
        {capabilities && (
          <div className="flex items-center gap-2 ml-auto">
            <div className="flex items-center gap-1">
              <Badge
                variant={capabilities.metricsAPI ? "default" : "secondary"}
                className="text-xs"
              >
                Metrics API
              </Badge>
              <Badge
                variant={capabilities.summaryAPI ? "default" : "secondary"}
                className="text-xs"
              >
                Summary API
              </Badge>
            </div>
            
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6">
                  <Info className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <div className="space-y-2">
                  <div className="font-medium">API Capabilities</div>
                  <div className="text-xs space-y-1">
                    <div>
                      Metrics API: {capabilities.metricsAPI ? 'Available' : 'Unavailable'}
                    </div>
                    <div>
                      Summary API: {capabilities.summaryAPI ? 'Available' : 'Unavailable'}
                    </div>
                    {!capabilities.summaryAPI && (
                      <div className="text-amber-500">
                        Some metrics may show placeholder values
                      </div>
                    )}
                  </div>
                </div>
              </TooltipContent>
            </Tooltip>
          </div>
        )}
      </div>
    </div>
  );
}

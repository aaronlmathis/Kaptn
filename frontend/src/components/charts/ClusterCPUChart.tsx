/**
 * Cluster CPU Chart Component
 * 
 * Displays CPU usage vs capacity with optional 80% capacity warning line
 */

import * as React from "react"
import { LineCard } from "./LineCard"
import { Badge } from "@/components/ui/badge"
import { useClusterTimeseries } from "@/hooks/useClusterTimeseries"
import type { ChartSeries } from "./LineCard"

export interface ClusterCPUChartProps {
  /** Chart height in pixels */
  height?: number;
  /** Whether to show the 80% capacity warning line */
  showCapacityWarning?: boolean;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Format CPU values to show decimal places appropriately
 */
function formatCPUValue(value: number): string {
  if (value >= 10) {
    return value.toFixed(1);
  } else if (value >= 1) {
    return value.toFixed(2);
  } else {
    return value.toFixed(3);
  }
}

/**
 * ClusterCPUChart Component
 * 
 * Renders CPU usage and capacity as stacked area chart
 */
export function ClusterCPUChart({
  height = 250,
  showCapacityWarning = true,
  className
}: ClusterCPUChartProps) {
  const {
    series: rawSeries,
    capabilities,
    connectionState,
  } = useClusterTimeseries([
    'cluster.cpu.used.cores',
    'cluster.cpu.capacity.cores'
  ], {
    enableStreaming: false, // Disabled until backend is available
    timeWindow: '60m',
    initialResolution: 'lo'
  });

  // Transform data for chart display
  const chartSeries: ChartSeries[] = React.useMemo(() => {
    const usedSeries = rawSeries.find(s => s.key === 'cluster.cpu.used.cores');
    const capacitySeries = rawSeries.find(s => s.key === 'cluster.cpu.capacity.cores');

    const result: ChartSeries[] = [];

    if (capacitySeries) {
      result.push({
        key: 'capacity',
        name: 'CPU Capacity',
        color: '#e5e7eb', // Light gray for capacity background
        data: capacitySeries.data
      });
    }

    if (usedSeries) {
      result.push({
        key: 'used',
        name: 'CPU Used',
        color: '#3b82f6', // Blue for used CPU
        data: usedSeries.data
      });
    }

    return result;
  }, [rawSeries]);

  // Generate capability badges
  const capabilityBadges = React.useMemo(() => {
    if (!capabilities) return null;

    return (
      <>
        {capabilities.metricsAPI ? (
          <Badge variant="secondary" className="text-xs">
            Metrics API
          </Badge>
        ) : (
          <Badge variant="outline" className="text-xs text-muted-foreground">
            No Metrics API
          </Badge>
        )}
      </>
    );
  }, [capabilities]);

  return (
    <LineCard
      title="Cluster CPU Load vs Capacity"
      subtitle="Real-time CPU usage across all cluster nodes"
      series={chartSeries}
      yUnit="cores"
      yFormatter={formatCPUValue}
      isLoading={connectionState.isLoading}
      error={connectionState.error?.message}
      emptyMessage={
        !capabilities?.metricsAPI 
          ? "Metrics API not available - install metrics-server to view CPU data"
          : "No CPU data available"
      }
      capabilities={capabilityBadges}
      height={height}
      className={className}
      stacked={false} // Show capacity and usage as separate areas
      showGrid={true}
    />
  );
}

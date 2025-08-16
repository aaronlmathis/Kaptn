/**
 * Cluster Network Traffic Chart Component
 * 
 * Displays network RX and TX traffic with automatic unit formatting
 */

import * as React from "react"
import { LineCard } from "./LineCard"
import { Badge } from "@/components/ui/badge"
import { useClusterTimeseries } from "@/hooks/useClusterTimeseries"
import type { ChartSeries } from "./LineCard"

export interface ClusterNetworkChartProps {
  /** Chart height in pixels */
  height?: number;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Format network traffic values with appropriate units
 */
function formatNetworkValue(value: number): string {
  if (value >= 1e9) {
    return `${(value / 1e9).toFixed(1)} GB/s`;
  } else if (value >= 1e6) {
    return `${(value / 1e6).toFixed(1)} MB/s`;
  } else if (value >= 1e3) {
    return `${(value / 1e3).toFixed(1)} KB/s`;
  } else {
    return `${value.toFixed(0)} B/s`;
  }
}

/**
 * ClusterNetworkChart Component
 * 
 * Renders network RX and TX traffic as separate area series
 */
export function ClusterNetworkChart({
  height = 250,
  className
}: ClusterNetworkChartProps) {
  const {
    series: rawSeries,
    capabilities,
    connectionState,
  } = useClusterTimeseries([
    'cluster.net.rx.bps',
    'cluster.net.tx.bps'
  ], {
    enableStreaming: false, // Disabled until backend is available
    timeWindow: '60m',
    initialResolution: 'lo'
  });

  // Transform data for chart display
  const chartSeries: ChartSeries[] = React.useMemo(() => {
    const rxSeries = rawSeries.find(s => s.key === 'cluster.net.rx.bps');
    const txSeries = rawSeries.find(s => s.key === 'cluster.net.tx.bps');

    const result: ChartSeries[] = [];

    if (rxSeries) {
      result.push({
        key: 'rx',
        name: 'Network RX',
        color: '#10b981', // Green for RX
        data: rxSeries.data
      });
    }

    if (txSeries) {
      result.push({
        key: 'tx',
        name: 'Network TX',
        color: '#f59e0b', // Orange for TX
        data: txSeries.data
      });
    }

    return result;
  }, [rawSeries]);

  // Generate capability badges
  const capabilityBadges = React.useMemo(() => {
    if (!capabilities) return null;

    return (
      <>
        {capabilities.summaryAPI ? (
          <Badge variant="secondary" className="text-xs">
            Summary API
          </Badge>
        ) : (
          <Badge variant="outline" className="text-xs text-muted-foreground">
            No Summary API
          </Badge>
        )}
      </>
    );
  }, [capabilities]);

  return (
    <LineCard
      title="Cluster Network Traffic"
      subtitle="Real-time network throughput across all cluster nodes"
      series={chartSeries}
      yUnit="B/s"
      yFormatter={formatNetworkValue}
      isLoading={connectionState.isLoading}
      error={connectionState.error?.message}
      emptyMessage={
        !capabilities?.summaryAPI 
          ? "Summary API not available - network data requires kubelet summary endpoint access"
          : "No network data available"
      }
      capabilities={capabilityBadges}
      height={height}
      className={className}
      stacked={false} // Show RX and TX as separate areas
      showGrid={true}
    />
  );
}

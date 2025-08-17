/**
 * Metric Section Components
 * 
 * Organizes charts into logical sections (CPU, Memory, Network, etc.)
 * with accordion-style collapsible interface and responsive grids.
 */

import * as React from "react";
import { TrendingUp, TrendingDown, Minus, Cpu, MemoryStick, Network, HardDrive, Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { MetricAreaChart, MetricBarChart, MetricRadialChart, type ChartSeries } from "./charts";
import { LiveMetricAreaChart } from "./live-charts";
import type { MetricScope, MetricFilters } from "@/lib/metrics-api";
import type { GridDensity } from "./filter-bar";
import { formatCores, formatBytesIEC, formatRate, formatPct, calculateTrend } from "@/lib/metric-utils";

// Section configuration
export interface MetricSection {
  id: string;
  title: string;
  description: string;
  icon?: React.ReactNode;
  charts: MetricChart[];
}

// Chart configuration within a section
export interface MetricChart {
  id: string;
  title: string;
  subtitle?: string;
  type: 'area' | 'bar' | 'radial';
  seriesKeys: string[];
  unit?: string;
  formatter?: (value: number) => string;
  height?: number;
  stacked?: boolean;
  layout?: 'horizontal' | 'vertical';
  aggregation?: 'latest' | 'avg' | 'max' | 'sum';
}

// Props for metric sections
export interface MetricSectionsProps {
  filters: MetricFilters;
  density: GridDensity;

  // Data
  seriesData: Record<string, ChartSeries>;
  capabilities?: {
    metricsAPI: boolean;
    summaryAPI: boolean;
  } | null;

  // State
  isLoading?: boolean;
  error?: string;

  // Accordion control
  expandedSections: string[];
  onExpandedSectionsChange: (sections: string[]) => void;

  className?: string;
}

// Section KPI calculation
interface SectionKPI {
  label: string;
  value: string;
  trend?: {
    direction: 'up' | 'down' | 'stable';
    percentage: number;
  };
  variant?: 'default' | 'secondary' | 'destructive' | 'outline';
}

/**
 * Get CPU section configuration
 */
function getCPUSection(): MetricSection {
  const charts: MetricChart[] = [
    // Chart 1: Cluster CPU — Usage vs Capacity (Area chart, stacked or overlay)
    {
      id: 'cluster-cpu-usage-capacity',
      title: 'Cluster CPU — Usage vs Capacity',
      subtitle: 'CPU utilization against total capacity and allocatable resources',
      type: 'area',
      seriesKeys: ['cluster.cpu.used.cores', 'cluster.cpu.allocatable.cores', 'cluster.cpu.capacity.cores'],
      unit: 'cores',
      formatter: formatCores,
      stacked: false,
    },
    // Chart 2: Cluster CPU — Requests vs Allocatable (Line/Area)
    {
      id: 'cluster-cpu-requests-allocatable',
      title: 'Cluster CPU — Requests vs Allocatable',
      subtitle: 'Resource requests compared to allocatable capacity',
      type: 'area',
      seriesKeys: ['cluster.cpu.requested.cores', 'cluster.cpu.allocatable.cores'],
      unit: 'cores',
      formatter: formatCores,
      stacked: false,
    },
    // Chart 3: Top Nodes by CPU Utilization (Horizontal Bar)
    {
      id: 'top-nodes-cpu-utilization',
      title: 'Top Nodes by CPU Utilization',
      subtitle: 'Nodes with highest CPU usage percentage (avg over window)',
      type: 'bar',
      seriesKeys: ['node.cpu.usage.cores'],
      unit: 'percent',
      formatter: formatPct,
      layout: 'horizontal',
      aggregation: 'avg',
    },
    // Chart 4: CPU Heatmap by Node over Time (BarChart with time bins)
    {
      id: 'cpu-heatmap-nodes',
      title: 'CPU Heatmap by Node over Time',
      subtitle: 'CPU utilization distribution across nodes and time (heatmap view)',
      type: 'bar',
      seriesKeys: ['node.cpu.usage.cores'],
      unit: 'percent',
      formatter: formatPct,
      layout: 'vertical',
      aggregation: 'avg',
    },
    // Chart 5: Per-Node CPU Trend (Multi-Line with toggleable legend)
    {
      id: 'per-node-cpu-trend',
      title: 'Per-Node CPU Trend',
      subtitle: 'Individual node CPU usage trends over time',
      type: 'area',
      seriesKeys: ['node.cpu.usage.cores'],
      unit: 'cores',
      formatter: formatCores,
      stacked: false,
    },
  ];

  return {
    id: 'cpu',
    title: 'CPU',
    description: 'Processor utilization and capacity metrics',
    icon: <Cpu className="h-5 w-5" />,
    charts,
  };
}

/**
 * Get Memory section configuration
 */
function getMemorySection(scope: MetricScope): MetricSection {
  const charts: MetricChart[] = [
    {
      id: 'cluster-memory-usage',
      title: 'Cluster Memory — Used vs Allocatable',
      subtitle: 'Memory consumption and available capacity',
      type: 'area',
      seriesKeys: ['cluster.mem.used.bytes', 'cluster.mem.allocatable.bytes', 'cluster.mem.requested.bytes'],
      unit: 'bytes',
      formatter: formatBytesIEC,
      stacked: true,
    },
  ];

  if (scope === 'node') {
    charts.push(
      {
        id: 'top-nodes-memory',
        title: 'Top Nodes by Memory Working Set %',
        subtitle: 'Nodes with highest memory utilization',
        type: 'bar',
        seriesKeys: ['node.mem.working_set.bytes'],
        unit: 'percent',
        formatter: formatPct,
        layout: 'horizontal',
      },
      {
        id: 'node-memory-trend',
        title: 'Per-Node Memory Usage',
        subtitle: 'Memory consumption trends by node',
        type: 'area',
        seriesKeys: ['node.mem.usage.bytes', 'node.mem.working_set.bytes'],
        unit: 'bytes',
        formatter: formatBytesIEC,
      }
    );
  }

  return {
    id: 'memory',
    title: 'Memory',
    description: 'Memory usage and allocation metrics',
    icon: <MemoryStick className="h-5 w-5" />,
    charts,
  };
}

/**
 * Get Network section configuration
 */
function getNetworkSection(scope: MetricScope): MetricSection {
  const charts: MetricChart[] = [
    {
      id: 'cluster-network-throughput',
      title: 'Cluster Network Throughput',
      subtitle: 'Total receive and transmit rates',
      type: 'area',
      seriesKeys: ['cluster.net.rx.bps', 'cluster.net.tx.bps'],
      unit: 'B/s',
      formatter: (value) => formatRate(value, 'B/s'),
    },
  ];

  if (scope === 'node') {
    charts.push(
      {
        id: 'top-nodes-network',
        title: 'Top Nodes by Network RX/TX',
        subtitle: 'Nodes with highest network activity',
        type: 'bar',
        seriesKeys: ['node.net.rx.bps', 'node.net.tx.bps'],
        unit: 'B/s',
        formatter: (value) => formatRate(value, 'B/s'),
        layout: 'horizontal',
      },
      {
        id: 'node-network-trend',
        title: 'Per-Node Network Trend',
        subtitle: 'Network traffic patterns by node',
        type: 'area',
        seriesKeys: ['node.net.rx.bps', 'node.net.tx.bps'],
        unit: 'B/s',
        formatter: (value) => formatRate(value, 'B/s'),
      }
    );
  }

  return {
    id: 'network',
    title: 'Network',
    description: 'Network throughput and traffic metrics',
    icon: <Network className="h-5 w-5" />,
    charts,
  };
}

/**
 * Get Storage section configuration
 */
function getStorageSection(scope: MetricScope): MetricSection {
  const charts: MetricChart[] = [];

  if (scope === 'node') {
    charts.push(
      {
        id: 'node-filesystem-usage',
        title: 'Node Filesystem Usage %',
        subtitle: 'Filesystem utilization across nodes',
        type: 'radial',
        seriesKeys: ['node.fs.used.percent'],
        unit: 'percent',
        formatter: formatPct,
      },
      {
        id: 'cluster-storage-used',
        title: 'Cluster Storage — Used over Time',
        subtitle: 'Total storage consumption trends',
        type: 'area',
        seriesKeys: ['node.fs.used.bytes', 'node.imagefs.used.bytes'],
        unit: 'bytes',
        formatter: formatBytesIEC,
      },
      {
        id: 'top-nodes-imagefs',
        title: 'Top Nodes by ImageFS Used',
        subtitle: 'Container image storage consumption',
        type: 'bar',
        seriesKeys: ['node.imagefs.used.bytes'],
        unit: 'bytes',
        formatter: formatBytesIEC,
        layout: 'horizontal',
      }
    );
  }

  return {
    id: 'storage',
    title: 'Storage',
    description: 'Filesystem and storage utilization',
    icon: <HardDrive className="h-5 w-5" />,
    charts,
  };
}

/**
 * Get Cluster State section configuration
 */
function getClusterStateSection(): MetricSection {
  return {
    id: 'cluster-state',
    title: 'Cluster State',
    description: 'Pod phases and cluster capacity overview',
    icon: <Activity className="h-5 w-5" />,
    charts: [
      {
        id: 'pods-by-phase',
        title: 'Pods by Phase',
        subtitle: 'Pod lifecycle state distribution',
        type: 'area',
        seriesKeys: ['cluster.pods.running', 'cluster.pods.pending', 'cluster.pods.failed', 'cluster.pods.succeeded'],
        unit: 'count',
        stacked: true,
      },
      {
        id: 'node-count',
        title: 'Node Count',
        subtitle: 'Total nodes in cluster',
        type: 'area',
        seriesKeys: ['cluster.nodes.count'],
        unit: 'count',
      },
    ],
  };
}

/**
 * Get sections for current scope
 */
function getSectionsForScope(scope: MetricScope): MetricSection[] {
  const sections: MetricSection[] = [];

  // Always include CPU and Memory for all scopes
  sections.push(getCPUSection());
  sections.push(getMemorySection(scope));
  sections.push(getNetworkSection(scope));

  // Add storage section for node scope
  if (scope === 'node') {
    sections.push(getStorageSection(scope));
  }

  // Add cluster state for cluster scope
  if (scope === 'cluster') {
    sections.push(getClusterStateSection());
  }

  return sections.filter(section => section.charts.length > 0);
}

/**
 * Calculate KPIs for a section
 */
function calculateSectionKPIs(
  section: MetricSection,
  seriesData: Record<string, ChartSeries>
): SectionKPI[] {
  const kpis: SectionKPI[] = [];

  // CPU section KPIs
  if (section.id === 'cpu') {
    const usedSeries = seriesData['cluster.cpu.used.cores'];
    const allocatableSeries = seriesData['cluster.cpu.allocatable.cores'];

    if (usedSeries && allocatableSeries) {
      const usedValues = usedSeries.data.map(([, value]) => value);
      const allocatableValues = allocatableSeries.data.map(([, value]) => value);

      if (usedValues.length > 0 && allocatableValues.length > 0) {
        const latestUsed = usedValues[usedValues.length - 1];
        const latestAllocatable = allocatableValues[allocatableValues.length - 1];
        const utilization = latestAllocatable > 0 ? (latestUsed / latestAllocatable) * 100 : 0;

        const trend = calculateTrend(usedValues.slice(-10)); // Last 10 points

        kpis.push({
          label: `${formatPct(utilization)} used`,
          value: `${formatCores(latestAllocatable)} allocatable`,
          trend,
        });
      }
    }
  }

  // Memory section KPIs
  if (section.id === 'memory') {
    const usedSeries = seriesData['cluster.mem.used.bytes'];
    const allocatableSeries = seriesData['cluster.mem.allocatable.bytes'];

    if (usedSeries && allocatableSeries) {
      const usedValues = usedSeries.data.map(([, value]) => value);
      const allocatableValues = allocatableSeries.data.map(([, value]) => value);

      if (usedValues.length > 0 && allocatableValues.length > 0) {
        const latestUsed = usedValues[usedValues.length - 1];
        const latestAllocatable = allocatableValues[allocatableValues.length - 1];
        const utilization = latestAllocatable > 0 ? (latestUsed / latestAllocatable) * 100 : 0;

        kpis.push({
          label: `${formatPct(utilization)} used`,
          value: `${formatBytesIEC(latestAllocatable)} allocatable`,
        });
      }
    }
  }

  return kpis;
}

/**
 * Section Header Component
 */
function SectionHeader({
  section,
  kpis,
}: {
  section: MetricSection;
  kpis: SectionKPI[];
}) {
  return (
    <div className="flex items-center justify-between w-full min-h-[3.5rem]">
      <div className="flex items-center gap-4">
        {section.icon && (
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 text-primary">
            {section.icon}
          </div>
        )}
        <div className="space-y-1">
          <h3 className="text-lg font-semibold tracking-tight text-foreground">
            {section.title}
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {section.description}
          </p>
        </div>
      </div>

      {kpis.length > 0 && (
        <div className="flex items-center gap-3 ml-4">
          {kpis.map((kpi, index) => (
            <div key={index} className="flex items-center gap-2">
              <Badge
                variant={kpi.variant || 'secondary'}
                className="text-xs font-medium px-2.5 py-1"
              >
                {kpi.label}
              </Badge>
              {kpi.trend && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  {kpi.trend.direction === 'up' && <TrendingUp className="h-3 w-3 text-green-500" />}
                  {kpi.trend.direction === 'down' && <TrendingDown className="h-3 w-3 text-red-500" />}
                  {kpi.trend.direction === 'stable' && <Minus className="h-3 w-3" />}
                  <span className="font-medium">{kpi.trend.percentage.toFixed(1)}%</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Chart Grid Component
 */
function ChartGrid({
  charts,
  seriesData,
  filters,
  density,
  capabilities,
  isLoading,
  error,
}: {
  charts: MetricChart[];
  seriesData: Record<string, ChartSeries>;
  filters: MetricFilters;
  density: GridDensity;
  capabilities?: { metricsAPI: boolean; summaryAPI: boolean } | null;
  isLoading?: boolean;
  error?: string;
}) {
  const gridClasses = React.useMemo(() => {
    // Responsive grid with min/max card widths and max 4 columns
    // CSS custom properties for maintainable constants
    const base = `
      metrics-grid
      grid
      [--card-min:18rem] [--card-max:28rem]
      grid-cols-[repeat(auto-fit,minmax(var(--card-min),1fr))]
      2xl:grid-cols-4
      justify-center
    `.replace(/\s+/g, ' ').trim();

    switch (density) {
      case 'compact':
        return cn(base, "gap-3");
      case 'cozy':
        return cn(base, "gap-4");
      case 'comfortable':
        return cn(base, "gap-5");
      default:
        return cn(base, "gap-4");
    }
  }, [density]);

  const capabilityBadge = React.useMemo(() => {
    if (!capabilities || capabilities.summaryAPI) return null;

    return (
      <Badge variant="outline" className="text-xs">
        Limited data
      </Badge>
    );
  }, [capabilities]);

  return (
    <div className={gridClasses}>
      {charts.map((chart) => {
        const chartSeries = chart.seriesKeys
          .map(key => seriesData[key])
          .filter(Boolean);

        const commonProps = {
          title: chart.title,
          subtitle: chart.subtitle,
          series: chartSeries,
          unit: chart.unit,
          formatter: chart.formatter,
          isLoading,
          error,
          capabilities: capabilityBadge,
          scopeLabel: filters.scope,
          timespanLabel: '1h',
          resolutionLabel: filters.resolution,
          height: chart.height,
        };

        switch (chart.type) {
          case 'area':
            // Use LiveMetricAreaChart for cluster memory chart
            if (chart.id === 'cluster-memory-usage' && filters.scope === 'cluster') {
              return (
                <LiveMetricAreaChart
                  key={chart.id}
                  title={chart.title}
                  subtitle={chart.subtitle}
                  unit={chart.unit}
                  formatter={chart.formatter}
                  stacked={chart.stacked}
                  height={chart.height}
                  groupId="metric-explorer-memory"
                  seriesKeys={chart.seriesKeys}
                  fallbackSeries={chartSeries}
                  isLoading={isLoading}
                  error={error}
                  capabilities={capabilityBadge}
                  scopeLabel={filters.scope}
                  timespanLabel="15m"
                  resolutionLabel="hi"
                />
              );
            }

            return (
              <MetricAreaChart
                key={chart.id}
                {...commonProps}
                stacked={chart.stacked}
              />
            );

          case 'bar':
            return (
              <MetricBarChart
                key={chart.id}
                {...commonProps}
                layout={chart.layout}
              />
            );

          case 'radial':
            return (
              <MetricRadialChart
                key={chart.id}
                {...commonProps}
              />
            );

          default:
            return null;
        }
      })}
    </div>
  );
}

/**
 * Main Metric Sections Component
 */
export function MetricSections({
  filters,
  density,
  seriesData,
  capabilities,
  isLoading,
  error,
  expandedSections,
  onExpandedSectionsChange,
  className,
}: MetricSectionsProps) {
  const sections = React.useMemo(() => getSectionsForScope(filters.scope), [filters.scope]);

  return (
    <div className={cn("space-y-6", className)}>
      <Accordion
        type="multiple"
        value={expandedSections}
        onValueChange={onExpandedSectionsChange}
        className="space-y-4"
      >
        {sections.map((section) => {
          const kpis = calculateSectionKPIs(section, seriesData);

          return (
            <AccordionItem
              key={section.id}
              value={section.id}
              className="border border-border/60 rounded-xl bg-card/50 backdrop-blur-sm shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden"
            >
              <AccordionTrigger className="px-6 py-5 hover:no-underline hover:bg-muted/30 transition-colors duration-200 data-[state=open]:bg-muted/20 data-[state=open]:border-b data-[state=open]:border-border/40">
                <SectionHeader section={section} kpis={kpis} />
              </AccordionTrigger>

              <AccordionContent className="px-6 pb-6 pt-2 bg-background/50">
                <div className="border-t border-border/20 pt-6">
                  <ChartGrid
                    charts={section.charts}
                    seriesData={seriesData}
                    filters={filters}
                    density={density}
                    capabilities={capabilities}
                    isLoading={isLoading}
                    error={error}
                  />
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}

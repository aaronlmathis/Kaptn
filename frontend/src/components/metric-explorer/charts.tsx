/**
 * Reusable Chart Components for Metric Explorer
 * 
 * Provides different chart types (area, bar, radial, radar) with consistent
 * styling, tooltips, and configuration following ShadCN Charts patterns.
 */

import * as React from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
  RadialBar,
  RadialBarChart,
  PolarGrid,
} from "recharts";
import { MoreVertical, Download, Copy, Eye, BarChart3, Activity, PieChart } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { formatTimestamp, UNIT_FORMATTERS, getChartColor } from "@/lib/metric-utils";

// Common chart data structure
export interface ChartDataPoint {
  timestamp: number;
  [key: string]: number;
}

// Chart series configuration
export interface ChartSeries {
  key: string;
  name: string;
  color?: string;
  data: [number, number][]; // [timestamp, value] tuples
}

// Common chart props
interface BaseChartProps {
  title: string;
  subtitle?: string;
  series: ChartSeries[];
  unit?: string;
  formatter?: (value: number) => string;
  isLoading?: boolean;
  error?: string;
  emptyMessage?: string;
  className?: string;
  height?: number;
  showGrid?: boolean;
  capabilities?: React.ReactNode;
  insight?: string;
  badges?: React.ReactNode[];
  scopeLabel?: string;
  timespanLabel?: string;
  resolutionLabel?: string;
}

// Chart action handlers
interface ChartActions {
  onDownloadCSV?: () => void;
  onCopyPNG?: () => void;
  onInspectSeries?: () => void;
}

/**
 * Convert series data to chart format
 */
function prepareChartData(series: ChartSeries[]): ChartDataPoint[] {
  if (series.length === 0) return [];
  
  const timestampSet = new Set<number>();
  series.forEach(s => {
    s.data.forEach(([timestamp, value]) => {
      if (Number.isFinite(timestamp) && Number.isFinite(value) && timestamp > 0) {
        timestampSet.add(timestamp);
      }
    });
  });
  
  const sortedTimestamps = Array.from(timestampSet).sort((a, b) => a - b);
  
  return sortedTimestamps.map(timestamp => {
    const point: ChartDataPoint = { timestamp };
    
    series.forEach(s => {
      const dataPoint = s.data.find(([ts, value]) => ts === timestamp && Number.isFinite(value));
      point[s.key] = dataPoint ? dataPoint[1] : 0;
    });
    
    return point;
  });
}

/**
 * Generate chart config from series
 */
function generateChartConfig(series: ChartSeries[]): ChartConfig {
  const config: ChartConfig = {};
  
  series.forEach((s, index) => {
    config[s.key] = {
      label: s.name,
      color: s.color || getChartColor(s.key, index),
    };
  });
  
  return config;
}

/**
 * Get chart type icon and label
 */
function getChartTypeInfo(type: 'area' | 'bar' | 'radial') {
  switch (type) {
    case 'area':
      return { icon: Activity, label: 'Area Chart' };
    case 'bar':
      return { icon: BarChart3, label: 'Bar Chart' };
    case 'radial':
      return { icon: PieChart, label: 'Radial Chart' };
    default:
      return { icon: Activity, label: 'Chart' };
  }
}

/**
 * Chart Card Wrapper
 */
function ChartCard({
  title,
  subtitle,
  children,
  capabilities,
  insight,
  badges,
  scopeLabel,
  timespanLabel,
  resolutionLabel,
  actions,
  className,
  chartType = 'area',
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  capabilities?: React.ReactNode;
  insight?: string;
  badges?: React.ReactNode[];
  scopeLabel?: string;
  timespanLabel?: string;
  resolutionLabel?: string;
  actions?: ChartActions;
  className?: string;
  chartType?: 'area' | 'bar' | 'radial';
}) {
  const { icon: ChartIcon, label: chartLabel } = getChartTypeInfo(chartType);

  return (
    <div className="w-full max-w-[var(--card-max)] mx-auto">
      <Card className={cn("@container/chart p-0", className)}>
        {/* Chart Type Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <div className="flex items-center gap-2">
            <ChartIcon className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground font-medium">{chartLabel}</span>
          </div>
          <div className="flex items-center gap-2">
            {capabilities}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={actions?.onDownloadCSV}>
                  <Download className="mr-2 h-4 w-4" />
                  Download CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={actions?.onCopyPNG}>
                  <Copy className="mr-2 h-4 w-4" />
                  Copy chart as PNG
                </DropdownMenuItem>
                <DropdownMenuItem onClick={actions?.onInspectSeries}>
                  <Eye className="mr-2 h-4 w-4" />
                  Inspect series
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      
      <CardHeader className="pb-2 px-3 pt-3">
        <CardTitle className="text-base">{title}</CardTitle>
        {subtitle && (
          <CardDescription className="text-sm">
            {subtitle}
          </CardDescription>
        )}
      </CardHeader>
      
      <CardContent className="px-3 pb-3">
        {children}
      </CardContent>
      
      {(insight || badges || scopeLabel || timespanLabel) && (
        <CardFooter className="flex-col items-start gap-2 text-sm px-3 pt-2 pb-3">
          {(insight || badges) && (
            <div className="flex items-center gap-2 font-medium">
              {insight}
              {badges && <div className="flex gap-1">{badges}</div>}
            </div>
          )}
          {(scopeLabel || timespanLabel || resolutionLabel) && (
            <div className="text-muted-foreground">
              Showing {scopeLabel ? `${scopeLabel} ` : ''}
              {timespanLabel ? `for ${timespanLabel} ` : ''}
              {resolutionLabel ? `at ${resolutionLabel}` : ''}
            </div>
          )}
        </CardFooter>
      )}
    </Card>
    </div>
  );
}

/**
 * Area Chart Component
 */
export function MetricAreaChart({
  title,
  subtitle,
  series,
  unit,
  formatter,
  isLoading = false,
  error,
  emptyMessage = "No data available",
  className,
  showGrid = true,
  capabilities,
  insight,
  badges,
  scopeLabel,
  timespanLabel,
  resolutionLabel,
  stacked = false,
  ...actions
}: BaseChartProps & ChartActions & { stacked?: boolean }) {
  const chartData = React.useMemo(() => prepareChartData(series), [series]);
  const chartConfig = React.useMemo(() => generateChartConfig(series), [series]);
  
  const valueFormatter = React.useMemo(() => {
    if (formatter) return formatter;
    if (unit && UNIT_FORMATTERS[unit as keyof typeof UNIT_FORMATTERS]) {
      return UNIT_FORMATTERS[unit as keyof typeof UNIT_FORMATTERS];
    }
    return (value: number) => value.toString();
  }, [formatter, unit]);

  const content = React.useMemo(() => {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center h-[250px] w-full">
          <div className="flex items-center space-x-2 text-muted-foreground">
            <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <span>Loading chart data...</span>
          </div>
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex items-center justify-center h-[250px] w-full">
          <div className="text-center space-y-2">
            <div className="text-destructive text-sm font-medium">Error loading data</div>
            <div className="text-xs text-muted-foreground">{error}</div>
          </div>
        </div>
      );
    }

    if (chartData.length === 0) {
      return (
        <div className="flex items-center justify-center h-[250px] w-full">
          <div className="text-center space-y-2">
            <div className="text-muted-foreground text-sm">{emptyMessage}</div>
            <div className="text-xs text-muted-foreground">
              Data will appear here when available
            </div>
          </div>
        </div>
      );
    }

    return (
      <ChartContainer config={chartConfig} className="h-[250px] w-full">
        <AreaChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
          <defs>
            {series.map((s, index) => {
              const color = s.color || getChartColor(s.key, index);
              return (
                <linearGradient key={s.key} id={`fill${s.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={color} stopOpacity={0.8} />
                  <stop offset="95%" stopColor={color} stopOpacity={0.1} />
                </linearGradient>
              );
            })}
          </defs>
          
          {showGrid && <CartesianGrid strokeDasharray="3 3" vertical={false} />}
          
          <XAxis
            dataKey="timestamp"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            minTickGap={32}
            tickFormatter={formatTimestamp}
            className="text-xs"
            style={{ fontSize: '10px' }}
          />
          
          <YAxis
            tickLine={false}
            axisLine={false}
            tickMargin={4}
            tickFormatter={valueFormatter}
            className="text-xs"
            width={40}
            style={{ fontSize: '10px' }}
          />
          
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent
                labelFormatter={(value) => formatTimestamp(Number(value))}
                formatter={(value) => `${valueFormatter(Number(value))}${unit ? ` ${unit}` : ''}`}
                indicator="dot"
              />
            }
          />
          
          <ChartLegend content={<ChartLegendContent />} verticalAlign="bottom" height={36} />
          
          {series.map((s, index) => {
            const color = s.color || getChartColor(s.key, index);
            return (
              <Area
                key={s.key}
                dataKey={s.key}
                type="monotone"
                fill={`url(#fill${s.key})`}
                stroke={color}
                strokeWidth={2}
                stackId={stacked ? "stack" : undefined}
              />
            );
          })}
        </AreaChart>
      </ChartContainer>
    );
  }, [isLoading, error, chartData, chartConfig, valueFormatter, unit, showGrid, emptyMessage, series, stacked]);

  return (
    <ChartCard
      title={title}
      subtitle={subtitle}
      capabilities={capabilities}
      insight={insight}
      badges={badges}
      scopeLabel={scopeLabel}
      timespanLabel={timespanLabel}
      resolutionLabel={resolutionLabel}
      actions={actions}
      className={className}
      chartType="area"
    >
      {content}
    </ChartCard>
  );
}

/**
 * Bar Chart Component (for top-N data)
 */
export function MetricBarChart({
  title,
  subtitle,
  series,
  unit,
  formatter,
  isLoading = false,
  error,
  emptyMessage = "No data available",
  className,
  showGrid = true,
  capabilities,
  insight,
  badges,
  scopeLabel,
  timespanLabel,
  resolutionLabel,
  layout = "horizontal",
  ...actions
}: BaseChartProps & ChartActions & { layout?: "horizontal" | "vertical" }) {
  // For bar charts, we typically want aggregated data, not time series
  const chartData = React.useMemo(() => {
    if (series.length === 0) return [];
    
    // Aggregate each series to get latest or average values
    return series.map(s => {
      const values = s.data.map(([, value]) => value).filter(Number.isFinite);
      const aggregatedValue = values.length > 0 
        ? values[values.length - 1] // Use latest value
        : 0;
      
      return {
        name: s.name,
        value: aggregatedValue,
        key: s.key,
      };
    }).sort((a, b) => b.value - a.value); // Sort by value descending
  }, [series]);
  
  const chartConfig = React.useMemo(() => generateChartConfig(series), [series]);
  
  const valueFormatter = React.useMemo(() => {
    if (formatter) return formatter;
    if (unit && UNIT_FORMATTERS[unit as keyof typeof UNIT_FORMATTERS]) {
      return UNIT_FORMATTERS[unit as keyof typeof UNIT_FORMATTERS];
    }
    return (value: number) => value.toString();
  }, [formatter, unit]);

  const content = React.useMemo(() => {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center h-[250px] w-full">
          <div className="flex items-center space-x-2 text-muted-foreground">
            <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <span>Loading chart data...</span>
          </div>
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex items-center justify-center h-[250px] w-full">
          <div className="text-center space-y-2">
            <div className="text-destructive text-sm font-medium">Error loading data</div>
            <div className="text-xs text-muted-foreground">{error}</div>
          </div>
        </div>
      );
    }

    if (chartData.length === 0) {
      return (
        <div className="flex items-center justify-center h-[250px] w-full">
          <div className="text-center space-y-2">
            <div className="text-muted-foreground text-sm">{emptyMessage}</div>
          </div>
        </div>
      );
    }

    return (
      <ChartContainer config={chartConfig} className="h-[250px] w-full">
        <BarChart
          data={chartData}
          layout={layout}
          margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
        >
          {showGrid && <CartesianGrid strokeDasharray="3 3" />}
          
          {layout === "horizontal" ? (
            <>
              <XAxis type="number" tickFormatter={valueFormatter} style={{ fontSize: '10px' }} />
              <YAxis type="category" dataKey="name" width={100} style={{ fontSize: '10px' }} />
            </>
          ) : (
            <>
              <XAxis type="category" dataKey="name" style={{ fontSize: '10px' }} />
              <YAxis type="number" tickFormatter={valueFormatter} width={40} style={{ fontSize: '10px' }} />
            </>
          )}
          
          <ChartTooltip
            content={
              <ChartTooltipContent
                formatter={(value) => `${valueFormatter(Number(value))}${unit ? ` ${unit}` : ''}`}
                labelKey="name"
              />
            }
          />
          
          <Bar
            dataKey="value"
            fill="hsl(var(--chart-1))"
            radius={layout === "horizontal" ? [0, 4, 4, 0] : [4, 4, 0, 0]}
          />
        </BarChart>
      </ChartContainer>
    );
  }, [isLoading, error, chartData, chartConfig, valueFormatter, unit, showGrid, emptyMessage, layout]);

  return (
    <ChartCard
      title={title}
      subtitle={subtitle}
      capabilities={capabilities}
      insight={insight}
      badges={badges}
      scopeLabel={scopeLabel}
      timespanLabel={timespanLabel}
      resolutionLabel={resolutionLabel}
      actions={actions}
      className={className}
      chartType="bar"
    >
      {content}
    </ChartCard>
  );
}

/**
 * Radial Chart Component (for percentages/gauges)
 */
export function MetricRadialChart({
  title,
  subtitle,
  series,
  unit,
  formatter,
  isLoading = false,
  error,
  emptyMessage = "No data available",
  className,
  // height = 250, // Not used with fixed chart height
  capabilities,
  insight,
  badges,
  scopeLabel,
  timespanLabel,
  resolutionLabel,
  ...actions
}: BaseChartProps & ChartActions) {
  const chartData = React.useMemo(() => {
    if (series.length === 0) return [];
    
    return series.map(s => {
      const values = s.data.map(([, value]) => value).filter(Number.isFinite);
      const latestValue = values.length > 0 ? values[values.length - 1] : 0;
      
      return {
        name: s.name,
        value: latestValue,
        fill: s.color || getChartColor(s.key, 0),
      };
    });
  }, [series]);
  
  const valueFormatter = React.useMemo(() => {
    if (formatter) return formatter;
    if (unit && UNIT_FORMATTERS[unit as keyof typeof UNIT_FORMATTERS]) {
      return UNIT_FORMATTERS[unit as keyof typeof UNIT_FORMATTERS];
    }
    return (value: number) => value.toString();
  }, [formatter, unit]);

  const content = React.useMemo(() => {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center h-[250px] w-full">
          <div className="flex items-center space-x-2 text-muted-foreground">
            <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <span>Loading chart data...</span>
          </div>
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex items-center justify-center h-[250px] w-full">
          <div className="text-center space-y-2">
            <div className="text-destructive text-sm font-medium">Error loading data</div>
            <div className="text-xs text-muted-foreground">{error}</div>
          </div>
        </div>
      );
    }

    if (chartData.length === 0) {
      return (
        <div className="flex items-center justify-center h-[250px] w-full">
          <div className="text-center space-y-2">
            <div className="text-muted-foreground text-sm">{emptyMessage}</div>
          </div>
        </div>
      );
    }

    return (
      <ChartContainer config={{}} className="h-[250px] w-full">
        <RadialBarChart data={chartData} innerRadius={60} outerRadius={120}>
          <PolarGrid gridType="circle" />
          <RadialBar dataKey="value" cornerRadius={8} />
          <ChartTooltip
            content={
              <ChartTooltipContent
                formatter={(value) => `${valueFormatter(Number(value))}${unit ? ` ${unit}` : ''}`}
                labelKey="name"
              />
            }
          />
        </RadialBarChart>
      </ChartContainer>
    );
  }, [isLoading, error, chartData, valueFormatter, unit, emptyMessage]);

  return (
    <ChartCard
      title={title}
      subtitle={subtitle}
      capabilities={capabilities}
      insight={insight}
      badges={badges}
      scopeLabel={scopeLabel}
      timespanLabel={timespanLabel}
      resolutionLabel={resolutionLabel}
      actions={actions}
      className={className}
      chartType="radial"
    >
      {content}
    </ChartCard>
  );
}

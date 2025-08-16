/**
 * LineCard Component for Time Series Charts
 * 
 * A reusable chart wrapper component that uses shadcn/ui Card and Chart components
 * to display time series data as area charts. Supports multiple data series,
 * custom formatting, and light/dark themes.
 */

import * as React from "react"
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { cn } from "@/lib/utils"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import { Badge } from "@/components/ui/badge"

// Data point structure for charts
export interface ChartDataPoint {
  timestamp: number;
  [key: string]: number;
}

// Series configuration
export interface ChartSeries {
  key: string;
  name: string;
  color?: string;
  data: [number, number][]; // [timestamp, value] tuples
}

// Props for the LineCard component
export interface LineCardProps {
  /** Chart title */
  title: string;
  /** Optional subtitle/description */
  subtitle?: string;
  /** Array of data series to display */
  series: ChartSeries[];
  /** Y-axis unit label (e.g., "cores", "B/s") */
  yUnit?: string;
  /** Custom Y-axis formatter function */
  yFormatter?: (value: number) => string;
  /** Loading state */
  isLoading?: boolean;
  /** Error state */
  error?: string;
  /** Empty state message */
  emptyMessage?: string;
  /** Additional CSS classes */
  className?: string;
  /** Optional capability badges */
  capabilities?: React.ReactNode;
  /** Chart height */
  height?: number;
  /** Whether to show grid lines */
  showGrid?: boolean;
  /** Whether to stack areas */
  stacked?: boolean;
}

/**
 * Default Y-axis formatters for common units
 */
const DEFAULT_FORMATTERS = {
  cores: (value: number) => `${value.toFixed(1)}`,
  'B/s': (value: number) => {
    if (value >= 1e9) return `${(value / 1e9).toFixed(1)} GB/s`;
    if (value >= 1e6) return `${(value / 1e6).toFixed(1)} MB/s`;
    if (value >= 1e3) return `${(value / 1e3).toFixed(1)} KB/s`;
    return `${value.toFixed(0)} B/s`;
  },
};

/**
 * Format timestamp for chart display
 */
function formatTimestamp(timestamp: number): string {
  // Validate timestamp
  if (!timestamp || !Number.isFinite(timestamp)) {
    return 'Invalid Time';
  }
  
  const date = new Date(timestamp);
  
  // Check if date is valid
  if (isNaN(date.getTime())) {
    return 'Invalid Time';
  }
  
  const now = new Date();
  const diffMs = now.getTime() - timestamp;
  const diffMins = Math.floor(diffMs / 60000);
  
  // Handle future timestamps (positive diffMins indicates past, negative indicates future)
  if (diffMins < 0) {
    const futureMins = Math.abs(diffMins);
    if (futureMins < 60) {
      return `in ${futureMins}m`;
    } else if (futureMins < 1440) {
      const hours = Math.floor(futureMins / 60);
      return `in ${hours}h`;
    } else {
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    }
  }
  
  // Handle past timestamps
  if (diffMins < 60) {
    return `${diffMins}m ago`;
  } else if (diffMins < 1440) {
    const hours = Math.floor(diffMins / 60);
    return `${hours}h ago`;
  } else {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
}

/**
 * Convert series data to chart format
 */
function prepareChartData(series: ChartSeries[]): ChartDataPoint[] {
  if (series.length === 0) return [];
  
  // Get all unique timestamps across all series, filtering out invalid ones
  const timestampSet = new Set<number>();
  series.forEach(s => {
    s.data.forEach(([timestamp, value]) => {
      // Only add valid timestamps and values
      if (Number.isFinite(timestamp) && Number.isFinite(value) && timestamp > 0) {
        timestampSet.add(timestamp);
      }
    });
  });
  
  const sortedTimestamps = Array.from(timestampSet).sort((a, b) => a - b);
  
  // Create chart data points
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
  const defaultColors = [
    '#3b82f6', // blue-500
    '#10b981', // emerald-500 
    '#f59e0b', // amber-500
    '#ef4444', // red-500
    '#8b5cf6', // violet-500
    '#06b6d4', // cyan-500
  ];
  
  series.forEach((s, index) => {
    config[s.key] = {
      label: s.name,
      color: s.color || defaultColors[index % defaultColors.length],
    };
  });
  
  return config;
}

/**
 * LineCard Component
 * 
 * Displays time series data as area charts with proper theming and formatting
 */
export function LineCard({
  title,
  subtitle,
  series,
  yUnit,
  yFormatter,
  isLoading = false,
  error,
  emptyMessage = "No data available",
  className,
  capabilities,
  height = 250,
  showGrid = true,
  stacked = false,
}: LineCardProps) {
  const chartData = React.useMemo(() => prepareChartData(series), [series]);
  const chartConfig = React.useMemo(() => generateChartConfig(series), [series]);
  
  // Use default formatter if none provided
  const valueFormatter = React.useMemo(() => {
    if (yFormatter) return yFormatter;
    if (yUnit && DEFAULT_FORMATTERS[yUnit as keyof typeof DEFAULT_FORMATTERS]) {
      return DEFAULT_FORMATTERS[yUnit as keyof typeof DEFAULT_FORMATTERS];
    }
    return (value: number) => value.toString();
  }, [yFormatter, yUnit]);

  return (
    <Card className={cn("@container/chart", className)}>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base font-medium">{title}</CardTitle>
            {subtitle && (
              <CardDescription className="text-sm text-muted-foreground">
                {subtitle}
              </CardDescription>
            )}
          </div>
          {capabilities && (
            <div className="flex flex-wrap gap-1">
              {capabilities}
            </div>
          )}
        </div>
      </CardHeader>
      
      <CardContent className="px-2 pt-0 sm:px-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-[250px]">
            <div className="flex items-center space-x-2 text-muted-foreground">
              <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <span>Loading chart data...</span>
            </div>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-[250px]">
            <div className="text-center space-y-2">
              <div className="text-destructive text-sm font-medium">Error loading data</div>
              <div className="text-xs text-muted-foreground">{error}</div>
            </div>
          </div>
        ) : chartData.length === 0 ? (
          <div className="flex items-center justify-center h-[250px]">
            <div className="text-center space-y-2">
              <div className="text-muted-foreground text-sm">{emptyMessage}</div>
              <div className="text-xs text-muted-foreground">
                Data will appear here when available
              </div>
            </div>
          </div>
        ) : (
          <ChartContainer config={chartConfig} className={cn("w-full", `h-[${height}px]`)}>
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
              <defs>
                {series.map((s, index) => {
                  const defaultColors = [
                    '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'
                  ];
                  const color = s.color || defaultColors[index % defaultColors.length];
                  return (
                    <linearGradient key={s.key} id={`fill${s.key}`} x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="5%"
                        stopColor={color}
                        stopOpacity={0.8}
                      />
                      <stop
                        offset="95%"
                        stopColor={color}
                        stopOpacity={0.1}
                      />
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
              />
              
              <YAxis
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tickFormatter={valueFormatter}
                className="text-xs"
                width={60}
              />
              
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    labelFormatter={(value) => formatTimestamp(Number(value))}
                    formatter={(value) => `${valueFormatter(Number(value))}${yUnit ? ` ${yUnit}` : ''}`}
                    indicator="dot"
                  />
                }
              />
              
              {series.map((s, index) => {
                const defaultColors = [
                  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'
                ];
                const color = s.color || defaultColors[index % defaultColors.length];
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
        )}
      </CardContent>
    </Card>
  );
}

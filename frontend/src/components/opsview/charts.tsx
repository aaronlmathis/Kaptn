/**
 * Reusable Chart Components for OpsView
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
  Line,
  LineChart,
  Scatter,
  ScatterChart,
  CartesianGrid,
  XAxis,
  YAxis,
  RadialBar,
  RadialBarChart,
  PolarGrid,
  RadarChart,
  Radar,
  PolarAngleAxis,
  PolarRadiusAxis,
  Cell,
} from "recharts";
import { MoreVertical, Download, Copy, Eye, BarChart3, Activity, PieChart, Info, LineChart as LineChartIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardFooter,
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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

// Categorical data for bar/radar charts (not time-series)
export interface CategoricalDataPoint {
  name: string;
  value: number;
  [key: string]: string | number;
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
  footerExtra?: React.ReactNode;
}

// Chart action handlers
interface ChartActions {
  onDownloadCSV?: () => void;
  onCopyPNG?: () => void;
  onInspectSeries?: () => void;
}

/**
 * Custom Chart Tooltip Component
 * Shows color squares, readable labels, and formatted values
 */
interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    value: number;
    dataKey: string;
    color: string;
    payload: ChartDataPoint;
  }>;
  label?: string | number;
  series: ChartSeries[];
  formatter?: (value: number) => string;
  unit?: string;
}

function CustomChartTooltip({
  active,
  payload,
  label,
  series,
  formatter,
  unit
}: CustomTooltipProps) {
  if (!active || !payload || !payload.length) {
    return null;
  }

  const timestamp = Number(label);
  const formattedTime = formatTimestamp(timestamp);

  return (
    <div className="bg-background border border-border rounded-lg shadow-lg p-3 max-w-xs">
      <div className="text-sm font-medium text-foreground mb-2">
        {formattedTime}
      </div>
      <div className="space-y-1">
        {payload.map((item, index) => {
          const seriesInfo = series.find(s => s.key === item.dataKey);
          const seriesName = seriesInfo?.name || item.dataKey;
          const color = seriesInfo?.color || item.color;


          // choose ONE source of truth
          const formattedValue = formatter
            ? formatter(item.value)
            : unit && UNIT_FORMATTERS[unit as keyof typeof UNIT_FORMATTERS]
              ? UNIT_FORMATTERS[unit as keyof typeof UNIT_FORMATTERS](item.value)
              : String(item.value);

          return (
            <div key={index} className="flex items-center gap-2 text-sm">
              <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: color }} />
              <span className="text-muted-foreground min-w-0 flex-1">{seriesName}:</span>
              <span className="font-medium text-foreground">{formattedValue}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
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
function getChartTypeInfo(type: 'area' | 'bar' | 'radial' | 'radar' | 'line') {
  switch (type) {
    case 'area':
      return { icon: Activity, label: 'Area Chart' };
    case 'bar':
      return { icon: BarChart3, label: 'Bar Chart' };
    case 'radial':
      return { icon: PieChart, label: 'Radial Chart' };
    case 'radar':
      return { icon: PieChart, label: 'Radar Chart' };
    case 'line':
      return { icon: LineChartIcon, label: 'Line Chart' }
    default:
      return { icon: Activity, label: 'Chart' };
  }
}

/**
 * Chart Card Wrapper (with footerExtra)
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
  footerExtra,
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
  chartType?: 'area' | 'line' | 'bar' | 'radial' | 'radar';
  footerExtra?: React.ReactNode;
}) {
  const { icon: ChartIcon } = getChartTypeInfo(chartType);

  return (
    <div className="w-full max-w-[var(--card-max)] mx-auto">
      <Card className={cn("@container/chart p-0 relative", className)}>
        {/* Chart Type Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <div className="flex items-center gap-2">
            <ChartIcon className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground font-medium">{title}</span>
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

        <CardContent className="px-3 pb-3 pt-3">
          {children}
        </CardContent>

        {/* Info Tooltip - Bottom Right Corner */}
        {subtitle && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="absolute bottom-2 right-2 h-6 w-6 text-muted-foreground hover:text-foreground z-10"
              >
                <Info className="h-3 w-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent
              side="left"
              align="end"
              className="max-w-[300px] bg-popover border border-border shadow-md"
            >
              <div className="space-y-1">
                <div className="font-medium text-sm text-popover-foreground">{title}</div>
                <div className="text-xs text-muted-foreground leading-relaxed">
                  {subtitle}
                </div>
              </div>
            </TooltipContent>
          </Tooltip>
        )}

        {(footerExtra || insight || badges || scopeLabel || timespanLabel || resolutionLabel) && (
          <CardFooter className="flex-col items-start gap-2 text-sm px-3 pt-2 pb-3">
            {/* NEW: custom footer block (e.g., SectionHealthFooter) */}
            {footerExtra}

            {(insight || badges) && (
              <div className="flex items-center gap-2 font-medium">
                {insight}
                {badges && <div className="flex gap-1">{badges}</div>}
              </div>
            )}

            {(scopeLabel || timespanLabel || resolutionLabel) && (
              <div className="text-[11px] text-right text-muted-foreground italic opacity-60">
                {scopeLabel && <span>{scopeLabel}</span>}
                {timespanLabel && <span> · {timespanLabel}</span>}
                {resolutionLabel && <span> · {resolutionLabel}</span>}
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
  footerExtra,
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
              <CustomChartTooltip
                series={series}
                formatter={valueFormatter}
                unit={unit}
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
      footerExtra={footerExtra}
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
  footerExtra,
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
                formatter={(value) => valueFormatter(Number(value))}
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
      footerExtra={footerExtra}
    >
      {content}
    </ChartCard>
  );
}

/**
 * Line Chart Component
 */
export function MetricLineChart({
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
  footerExtra,
  ...actions
}: BaseChartProps & ChartActions) {
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
        <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
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
              <CustomChartTooltip
                series={series}
                formatter={valueFormatter}
                unit={unit}
              />
            }
          />

          <ChartLegend content={<ChartLegendContent />} verticalAlign="bottom" height={36} />

          {series.map((s, index) => {
            const color = s.color || getChartColor(s.key, index);
            return (
              <Line
                key={s.key}
                dataKey={s.key}
                type="monotone"
                stroke={color}
                strokeWidth={2}
                dot={false}
                connectNulls
                isAnimationActive={false}
                strokeLinecap="round"
                strokeDasharray={/limit|requested/i.test(s.name) || /limit|requested/i.test(s.key) ? "4 4" : undefined}
              />
            );
          })}
        </LineChart>
      </ChartContainer>
    );
  }, [isLoading, error, chartData, chartConfig, valueFormatter, unit, showGrid, emptyMessage, series]);

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
      chartType="line"
      footerExtra={footerExtra}
    >
      {content}
    </ChartCard>
  );
}

/**
 * Categorical Bar Chart Component (for non-time-series data)
 */
export function MetricCategoricalBarChart({
  title,
  subtitle,
  data,
  unit,
  formatter,
  isLoading = false,
  error,
  emptyMessage = "No data available",
  className,
  showGrid = true,
  showLegend = false,
  capabilities,
  insight,
  badges,
  scopeLabel,
  timespanLabel,
  resolutionLabel,
  layout = "vertical",
  footerExtra,
  ...actions
}: Omit<BaseChartProps, 'series'> & ChartActions & {
  data: CategoricalDataPoint[];
  layout?: "horizontal" | "vertical";
  showLegend?: boolean;
}) {
  // Generate chart config and colors for each category
  const chartData = React.useMemo(() => {
    return data.map((item, index) => ({
      name: item.name,
      value: item.value,
      fill: `hsl(var(--chart-${(index % 5) + 1}))`,
    }));
  }, [data]);

  const chartConfig: ChartConfig = React.useMemo(() => {
    const config: ChartConfig = {};
    // For categorical bar charts, we configure each category in the chart config
    data.forEach((item, index) => {
      config[item.name] = {
        label: item.name,
        color: `hsl(var(--chart-${(index % 5) + 1}))`,
      };
    });
    return config;
  }, [data]);

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

    if (data.length === 0) {
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
          margin={{ top: 10, right: 20, left: 10, bottom: layout === "vertical" ? 80 : 0 }}
        >
          {showGrid && <CartesianGrid strokeDasharray="3 3" vertical={layout === "horizontal"} />}

          {layout === "horizontal" ? (
            <>
              <XAxis
                type="number"
                tickFormatter={valueFormatter}
                style={{ fontSize: '10px' }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={120}
                style={{ fontSize: '10px' }}
                tickLine={false}
                axisLine={false}
                tickMargin={8}
              />
            </>
          ) : (
            <>
              <XAxis
                type="category"
                dataKey="name"
                style={{ fontSize: '10px' }}
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                angle={-45}
                textAnchor="end"
                height={60}
              />
              <YAxis
                type="number"
                tickFormatter={valueFormatter}
                width={40}
                style={{ fontSize: '10px' }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
            </>
          )}

          <ChartTooltip
            content={({ active, payload, label }) => {
              if (!active || !payload || !payload.length) return null;

              const data = payload[0];
              const value = data?.value || 0;
              const namespaceName = data?.payload?.name || label || '';

              return (
                <div className="bg-background border border-border rounded-lg shadow-lg p-3">
                  <div className="text-sm font-medium text-foreground mb-1">
                    {namespaceName}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {valueFormatter(Number(value))} {unit || 'restarts'}
                  </div>
                </div>
              );
            }}
          />

          {showLegend && (
            <ChartLegend
              content={() => (
                <div className="flex flex-wrap justify-center gap-4 mt-2">
                  {chartData.map((item, index) => (
                    <div key={item.name} className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-sm"
                        style={{ backgroundColor: `hsl(var(--chart-${(index % 5) + 1}))` }}
                      />
                      <span className="text-xs text-muted-foreground">{item.name}</span>
                    </div>
                  ))}
                </div>
              )}
              verticalAlign="bottom"
              height={36}
            />
          )}

          <Bar
            dataKey="value"
            radius={layout === "horizontal" ? [0, 4, 4, 0] : [4, 4, 0, 0]}
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ChartContainer>
    );
  }, [isLoading, error, data, chartData, chartConfig, valueFormatter, unit, showGrid, showLegend, emptyMessage, layout]);

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
      footerExtra={footerExtra}
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
  footerExtra,
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
                formatter={(value) => valueFormatter(Number(value))}
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
      footerExtra={footerExtra}
    >
      {content}
    </ChartCard>
  );
}

/**
 * Radar Chart Component (for multi-dimensional comparisons)
 */
export function MetricRadarChart({
  title,
  subtitle,
  series,
  unit,
  formatter,
  isLoading = false,
  error,
  emptyMessage = "No data available",
  className,
  capabilities,
  insight,
  badges,
  scopeLabel,
  timespanLabel,
  resolutionLabel,
  footerExtra,
  ...actions
}: BaseChartProps & ChartActions) {
  // For radar charts, we transform series data into radar format
  const chartData = React.useMemo(() => {
    if (series.length === 0) return [];

    // Create a single radar data point with all series as axes
    const radarPoint: { [key: string]: number } = {};

    series.forEach(s => {
      const values = s.data.map(([, value]) => value).filter(Number.isFinite);
      const latestValue = values.length > 0 ? values[values.length - 1] : 0;
      radarPoint[s.name] = latestValue;
    });

    // Convert to radar chart format
    return series.map(s => {
      const values = s.data.map(([, value]) => value).filter(Number.isFinite);
      const latestValue = values.length > 0 ? values[values.length - 1] : 0;

      return {
        axis: s.name,
        value: latestValue,
      };
    });
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
      <ChartContainer config={chartConfig} className="mx-auto aspect-square max-h-[250px]">
        <RadarChart data={chartData}>
          <PolarGrid />
          <PolarAngleAxis dataKey="axis" tick={{ fontSize: 12 }} />
          <PolarRadiusAxis
            angle={30}
            domain={[0, 100]}
            tickFormatter={valueFormatter}
            tick={{ fontSize: 10 }}
          />
          <Radar
            dataKey="value"
            stroke="hsl(var(--chart-1))"
            fill="hsl(var(--chart-1))"
            fillOpacity={0.35}
            strokeWidth={2}
          />
          <ChartTooltip
            cursor={false}
            content={({ active, payload }) => {
              if (!active || !payload || !payload.length) return null;

              const data = payload[0];
              if (!data) return null;

              const axisName = data.payload.axis;
              const value = data.value;
              const color = data.stroke || data.fill || "hsl(var(--chart-1))";

              return (
                <div className="bg-background border border-border rounded-lg shadow-lg p-3 max-w-xs">
                  <div className="flex items-center gap-2 text-sm">
                    <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: color }} />
                    <span className="text-muted-foreground min-w-0 flex-1">{axisName}:</span>
                    <span className="font-medium text-foreground">{valueFormatter(Number(value))}</span>
                  </div>
                </div>
              );
            }}
          />
        </RadarChart>
      </ChartContainer>
    );
  }, [isLoading, error, chartData, chartConfig, valueFormatter, unit, emptyMessage]);

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
      chartType="radar"
      footerExtra={footerExtra}
    >
      {content}
    </ChartCard>
  );
}

/**
 * Stacked Bar Chart Component (for multi-series stacked data)
 */
export function MetricStackedBarChart({
  title,
  subtitle,
  data,
  dataKeys,
  unit,
  formatter,
  isLoading = false,
  error,
  emptyMessage = "No data available",
  className,
  showGrid = true,
  showLegend = true,
  capabilities,
  insight,
  badges,
  scopeLabel,
  timespanLabel,
  resolutionLabel,
  layout = "vertical",
  colors,
  footerExtra,
  ...actions
}: Omit<BaseChartProps, 'series'> & ChartActions & {
  data: Record<string, any>[];
  dataKeys: string[];
  layout?: "horizontal" | "vertical";
  showLegend?: boolean;
  colors?: string[];
}) {
  // Generate chart config and colors for each data key
  const chartConfig: ChartConfig = React.useMemo(() => {
    const config: ChartConfig = {};
    dataKeys.forEach((key, index) => {
      config[key] = {
        label: key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1'),
        color: colors?.[index] || `hsl(var(--chart-${(index % 5) + 1}))`,
      };
    });
    return config;
  }, [dataKeys, colors]);

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

    if (data.length === 0) {
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
          data={data}
          layout={layout}
          margin={{ top: 10, right: 20, left: 10, bottom: layout === "vertical" ? 80 : 0 }}
        >
          {showGrid && <CartesianGrid strokeDasharray="3 3" vertical={layout === "horizontal"} />}

          {layout === "horizontal" ? (
            <>
              <XAxis
                type="number"
                tickFormatter={valueFormatter}
                style={{ fontSize: '10px' }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={120}
                style={{ fontSize: '10px' }}
                tickLine={false}
                axisLine={false}
                tickMargin={8}
              />
            </>
          ) : (
            <>
              <XAxis
                type="category"
                dataKey="name"
                style={{ fontSize: '10px' }}
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                angle={-45}
                textAnchor="end"
                height={60}
              />
              <YAxis
                type="number"
                tickFormatter={valueFormatter}
                width={40}
                style={{ fontSize: '10px' }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
            </>
          )}

          <ChartTooltip
            content={({ active, payload, label }) => {
              if (!active || !payload || !payload.length) return null;

              return (
                <div className="bg-background border border-border rounded-lg shadow-lg p-3">
                  <div className="text-sm font-medium text-foreground mb-2">
                    {label}
                  </div>
                  <div className="space-y-1">
                    {payload.map((item: any, index: number) => (
                      <div key={index} className="flex items-center gap-2 text-sm">
                        <div
                          className="w-3 h-3 rounded-sm flex-shrink-0"
                          style={{ backgroundColor: item.color }}
                        />
                        <span className="text-muted-foreground min-w-0 flex-1">
                          {chartConfig[item.dataKey]?.label || item.dataKey}:
                        </span>
                        <span className="font-medium text-foreground">
                          {valueFormatter(Number(item.value))} {unit || ''}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            }}
          />

          {showLegend && (
            <ChartLegend
              content={() => (
                <div className="flex flex-wrap justify-center gap-4 mt-2">
                  {dataKeys.map((key, index) => (
                    <div key={key} className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-sm"
                        style={{ backgroundColor: colors?.[index] || `hsl(var(--chart-${(index % 5) + 1}))` }}
                      />
                      <span className="text-xs text-muted-foreground">
                        {chartConfig[key]?.label || key}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              verticalAlign="bottom"
              height={36}
            />
          )}

          {dataKeys.map((key, index) => (
            <Bar
              key={key}
              dataKey={key}
              stackId="stack"
              fill={colors?.[index] || `hsl(var(--chart-${(index % 5) + 1}))`}
              radius={index === dataKeys.length - 1 ? (layout === "horizontal" ? [0, 4, 4, 0] : [4, 4, 0, 0]) : [0, 0, 0, 0]}
            />
          ))}
        </BarChart>
      </ChartContainer>
    );
  }, [isLoading, error, data, chartConfig, valueFormatter, unit, showGrid, showLegend, emptyMessage, layout, dataKeys, colors]);

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
      footerExtra={footerExtra}
    >
      {content}
    </ChartCard>
  );
}

/**
 * Scatter Chart Component
 */
export function MetricScatterChart({
  title,
  subtitle,
  data,
  xKey,
  yKey,
  colorKey,
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
  colors,
  footerExtra,
  ...actions
}: Omit<BaseChartProps, 'series'> & ChartActions & {
  data: Record<string, any>[];
  xKey: string;
  yKey: string;
  colorKey?: string;
  colors?: Record<string, string>;
}) {
  const chartConfig: ChartConfig = React.useMemo(() => {
    const config: ChartConfig = {};

    if (colorKey && colors) {
      Object.entries(colors).forEach(([key, color]) => {
        config[key] = {
          label: key,
          color: color,
        };
      });
    } else {
      config[xKey] = {
        label: xKey.charAt(0).toUpperCase() + xKey.slice(1).replace(/([A-Z])/g, ' $1'),
        color: 'hsl(var(--chart-1))',
      };
    }

    return config;
  }, [xKey, colorKey, colors]);

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

    if (data.length === 0) {
      return (
        <div className="flex items-center justify-center h-[250px] w-full">
          <div className="text-center space-y-2">
            <div className="text-muted-foreground text-sm">{emptyMessage}</div>
          </div>
        </div>
      );
    }

    // Group data by color key if provided
    const groupedData = colorKey ? data.reduce((acc, item) => {
      const group = item[colorKey] || 'default';
      if (!acc[group]) acc[group] = [];
      acc[group].push(item);
      return acc;
    }, {} as Record<string, any[]>) : { default: data };

    return (
      <ChartContainer config={chartConfig} className="h-[250px] w-full">
        <ScatterChart
          data={data}
          margin={{ top: 10, right: 20, left: 20, bottom: 20 }}
        >
          {showGrid && <CartesianGrid strokeDasharray="3 3" />}

          <XAxis
            type="number"
            dataKey={xKey}
            name={xKey}
            tickFormatter={valueFormatter}
            style={{ fontSize: '10px' }}
            tickLine={false}
            axisLine={false}
          />

          <YAxis
            type="number"
            dataKey={yKey}
            name={yKey}
            tickFormatter={valueFormatter}
            style={{ fontSize: '10px' }}
            tickLine={false}
            axisLine={false}
          />

          <ChartTooltip
            content={({ active, payload }) => {
              if (!active || !payload || !payload.length) return null;

              const data = payload[0]?.payload;
              if (!data) return null;

              return (
                <div className="bg-background border border-border rounded-lg shadow-lg p-3">
                  <div className="space-y-1">
                    <div className="text-sm font-medium text-foreground">
                      {data.name || `Point ${data[xKey]}, ${data[yKey]}`}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {xKey}: {valueFormatter(Number(data[xKey]))} {unit || ''}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {yKey}: {valueFormatter(Number(data[yKey]))} {unit || ''}
                    </div>
                    {colorKey && data[colorKey] && (
                      <div className="text-sm text-muted-foreground">
                        {colorKey}: {data[colorKey]}
                      </div>
                    )}
                  </div>
                </div>
              );
            }}
          />

          {Object.entries(groupedData).map(([group, groupData], index) => {
            const color = colors?.[group] || `hsl(var(--chart-${(index % 5) + 1}))`;
            return (
              <Scatter
                key={group}
                data={groupData}
                fill={color}
              />
            );
          })}
        </ScatterChart>
      </ChartContainer>
    );
  }, [isLoading, error, data, chartConfig, valueFormatter, unit, showGrid, emptyMessage, xKey, yKey, colorKey, colors]);

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
      footerExtra={footerExtra}
    >
      {content}
    </ChartCard>
  );
}

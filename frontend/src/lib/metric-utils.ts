/**
 * Utility functions for metric formatting and data processing
 */

// Format functions for different units
export const formatCores = (value: number): string => {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}k`;
  }
  return value.toFixed(1);
};

export const formatBytesIEC = (bytes: number): string => {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'];
  const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));

  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
};

export const formatRate = (value: number, unit: string): string => {
  if (value === 0) return `0 ${unit}`;

  const k = unit.includes('B') ? 1024 : 1000;
  const sizes = unit.includes('B')
    ? ['B/s', 'KiB/s', 'MiB/s', 'GiB/s', 'TiB/s']
    : ['Hz', 'kHz', 'MHz', 'GHz'];

  const i = Math.floor(Math.log(Math.abs(value)) / Math.log(k));

  return `${(value / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
};

export const formatPct = (value: number): string => {
  return `${value.toFixed(1)}%`;
};

export const formatCount = (value: number): string => {
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}k`;
  return value.toString();
};

// Time formatting utilities
export const formatTimestamp = (timestamp: number): string => {
  if (!timestamp || !Number.isFinite(timestamp)) {
    return 'Invalid Time';
  }

  const date = new Date(timestamp);
  if (isNaN(date.getTime())) {
    return 'Invalid Time';
  }

  const now = new Date();
  const diffMs = now.getTime() - timestamp;
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 0) {
    const futureMins = Math.abs(diffMins);
    if (futureMins < 60) return `in ${futureMins}m`;
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });
  }

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
};

// Unit formatter mappings
export const UNIT_FORMATTERS = {
  cores: formatCores,
  bytes: formatBytesIEC,
  'B/s': (value: number) => formatRate(value, 'B/s'),
  percent: formatPct,
  count: formatCount,
} as const;

// Chart color palettes - using CSS custom properties
export const CHART_COLORS = {
  primary: [
    'hsl(var(--chart-1))', // Vibrant primary colors from CSS
    'hsl(var(--chart-2))',
    'hsl(var(--chart-3))',
    'hsl(var(--chart-4))',
    'hsl(var(--chart-5))',
    'hsl(var(--chart-6))',
    'hsl(var(--chart-7))',
    'hsl(var(--chart-8))',
    'hsl(var(--chart-9))',
    'hsl(var(--chart-10))',
  ],
  semantic: {
    used: 'hsl(var(--chart-1))',      // Primary blue
    capacity: 'hsl(var(--chart-2))',   // Secondary green/cyan  
    allocatable: 'hsl(var(--chart-3))', // Tertiary color
    requested: 'hsl(var(--chart-4))',  // Quaternary color
    limits: 'hsl(var(--chart-5))',     // Quinary color
    rx: 'hsl(var(--chart-6))',        // Network receive
    tx: 'hsl(var(--chart-7))',        // Network transmit
    running: 'hsl(var(--chart-2))',    // Success state
    pending: 'hsl(var(--chart-4))',    // Warning state
    failed: 'hsl(var(--chart-5))',     // Error state
    succeeded: 'hsl(var(--chart-2))',  // Success state
  }
} as const;

// Chart configuration helpers
export const getChartColor = (key: string, index: number): string => {
  // Try to match semantic colors first
  const lowerKey = key.toLowerCase();
  for (const [semantic, color] of Object.entries(CHART_COLORS.semantic)) {
    if (lowerKey.includes(semantic)) {
      return color;
    }
  }

  // Fallback to primary palette
  return CHART_COLORS.primary[index % CHART_COLORS.primary.length];
};

// Time window utilities
export const parseTimeWindow = (window: string): number => {
  const match = window.match(/^(\d+)([smh]|ms)$/);
  if (!match) throw new Error(`Invalid time window: ${window}`);

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case 'ms': return value;
    case 's': return value * 1000;
    case 'm': return value * 60 * 1000;
    case 'h': return value * 60 * 60 * 1000;
    default: throw new Error(`Unsupported time unit: ${unit}`);
  }
};

// Data aggregation utilities
export const aggregateTimeSeries = (
  data: Array<{ timestamp: number;[key: string]: number }>,
  windowMs: number,
  aggregation: 'avg' | 'max' | 'min' | 'sum' = 'avg'
): Array<{ timestamp: number;[key: string]: number }> => {
  if (data.length === 0) return [];

  const buckets = new Map<number, Array<{ timestamp: number;[key: string]: number }>>();

  // Group data points into time buckets
  data.forEach(point => {
    const bucketTime = Math.floor(point.timestamp / windowMs) * windowMs;
    if (!buckets.has(bucketTime)) {
      buckets.set(bucketTime, []);
    }
    const bucket = buckets.get(bucketTime);
    if (bucket) {
      bucket.push(point);
    }
  });

  // Aggregate each bucket
  const result: Array<{ timestamp: number;[key: string]: number }> = [];

  buckets.forEach((points, bucketTime) => {
    const aggregated: { timestamp: number;[key: string]: number } = { timestamp: bucketTime };

    // Get all keys from first point (excluding timestamp)
    const keys = Object.keys(points[0]).filter(k => k !== 'timestamp');

    keys.forEach(key => {
      const values = points.map(p => p[key]).filter(v => Number.isFinite(v));
      if (values.length === 0) {
        aggregated[key] = 0;
        return;
      }

      switch (aggregation) {
        case 'avg':
          aggregated[key] = values.reduce((sum, v) => sum + v, 0) / values.length;
          break;
        case 'max':
          aggregated[key] = Math.max(...values);
          break;
        case 'min':
          aggregated[key] = Math.min(...values);
          break;
        case 'sum':
          aggregated[key] = values.reduce((sum, v) => sum + v, 0);
          break;
      }
    });

    result.push(aggregated);
  });

  return result.sort((a, b) => a.timestamp - b.timestamp);
};

// Chart data helpers
export const calculateTrend = (data: number[]): { direction: 'up' | 'down' | 'stable'; percentage: number } => {
  if (data.length < 2) return { direction: 'stable', percentage: 0 };

  const first = data[0];
  const last = data[data.length - 1];

  if (first === 0) return { direction: 'stable', percentage: 0 };

  const percentage = ((last - first) / first) * 100;

  if (Math.abs(percentage) < 1) {
    return { direction: 'stable', percentage };
  }

  return {
    direction: percentage > 0 ? 'up' : 'down',
    percentage: Math.abs(percentage)
  };
};

export const getMinMax = (data: number[]): { min: number; max: number } => {
  if (data.length === 0) return { min: 0, max: 0 };

  const validData = data.filter(Number.isFinite);
  if (validData.length === 0) return { min: 0, max: 0 };

  return {
    min: Math.min(...validData),
    max: Math.max(...validData)
  };
};

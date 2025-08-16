/**
 * Tests for useClusterTimeseries hook
 */

import { renderHook, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useClusterTimeseries } from '../useClusterTimeseries';
import * as timeseriesApi from '@/lib/api/timeseries';

// Mock the API module
vi.mock('@/lib/api/timeseries', () => ({
  fetchClusterSeries: vi.fn(),
  openClusterLiveWS: vi.fn(),
  formatSeriesForChart: vi.fn(),
  pruneOldPoints: vi.fn(),
  getTimeWindow: vi.fn()
}));

const mockFetchClusterSeries = vi.mocked(timeseriesApi.fetchClusterSeries);
const mockOpenClusterLiveWS = vi.mocked(timeseriesApi.openClusterLiveWS);
const mockFormatSeriesForChart = vi.mocked(timeseriesApi.formatSeriesForChart);
const mockPruneOldPoints = vi.mocked(timeseriesApi.pruneOldPoints);
const mockGetTimeWindow = vi.mocked(timeseriesApi.getTimeWindow);

// Mock WebSocket
const mockWebSocket = {
  close: vi.fn(),
  readyState: WebSocket.OPEN
};

// Sample test data
const mockTimeSeriesResponse = {
  series: {
    'cluster.cpu.used.cores': [
      { t: 1640000000000, v: 2.5 },
      { t: 1640000001000, v: 2.7 }
    ],
    'cluster.cpu.capacity.cores': [
      { t: 1640000000000, v: 8.0 },
      { t: 1640000001000, v: 8.0 }
    ]
  },
  capabilities: {
    metricsAPI: true,
    summaryAPI: true
  }
};

describe('useClusterTimeseries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup default mocks
    mockGetTimeWindow.mockReturnValue(3600000); // 1 hour in ms
    mockFormatSeriesForChart.mockImplementation((points) => 
      points.map(p => [p.t, p.v] as [number, number])
    );
    mockPruneOldPoints.mockImplementation((points) => points);
    mockFetchClusterSeries.mockResolvedValue(mockTimeSeriesResponse);
    mockOpenClusterLiveWS.mockReturnValue(mockWebSocket as any);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should initialize with loading state', () => {
    const { result } = renderHook(() => 
      useClusterTimeseries(['cluster.cpu.used.cores'])
    );

    expect(result.current.connectionState.isLoading).toBe(true);
    expect(result.current.connectionState.isConnected).toBe(false);
    expect(result.current.connectionState.hasError).toBe(false);
  });

  it('should fetch initial data on mount', async () => {
    const { result } = renderHook(() => 
      useClusterTimeseries(['cluster.cpu.used.cores'])
    );

    await waitFor(() => {
      expect(mockFetchClusterSeries).toHaveBeenCalledWith(
        ['cluster.cpu.used.cores'],
        'lo',
        '60m'
      );
    });

    await waitFor(() => {
      expect(result.current.connectionState.isLoading).toBe(false);
    });
  });

  it('should format series data correctly', async () => {
    const { result } = renderHook(() => 
      useClusterTimeseries(['cluster.cpu.used.cores'])
    );

    await waitFor(() => {
      expect(result.current.series).toHaveLength(1);
    });

    expect(result.current.series[0]).toEqual({
      name: 'CPU Used',
      key: 'cluster.cpu.used.cores',
      data: [[1640000000000, 2.5], [1640000001000, 2.7]],
      color: '#3b82f6'
    });
  });

  it('should establish WebSocket connection when streaming enabled', async () => {
    renderHook(() => 
      useClusterTimeseries(['cluster.cpu.used.cores'], {
        enableStreaming: true
      })
    );

    await waitFor(() => {
      expect(mockOpenClusterLiveWS).toHaveBeenCalledWith(
        ['cluster.cpu.used.cores'],
        expect.objectContaining({
          onConnect: expect.any(Function),
          onInit: expect.any(Function),
          onAppend: expect.any(Function),
          onError: expect.any(Function),
          onDisconnect: expect.any(Function)
        })
      );
    });
  });

  it('should not establish WebSocket when streaming disabled', async () => {
    renderHook(() => 
      useClusterTimeseries(['cluster.cpu.used.cores'], {
        enableStreaming: false
      })
    );

    await waitFor(() => {
      expect(mockFetchClusterSeries).toHaveBeenCalled();
    });

    // Small delay to ensure WebSocket wouldn't be called
    await new Promise(resolve => setTimeout(resolve, 200));
    
    expect(mockOpenClusterLiveWS).not.toHaveBeenCalled();
  });

  it('should handle API errors gracefully', async () => {
    const error = new Error('API Error');
    mockFetchClusterSeries.mockRejectedValue(error);

    const { result } = renderHook(() => 
      useClusterTimeseries(['cluster.cpu.used.cores'])
    );

    await waitFor(() => {
      expect(result.current.connectionState.hasError).toBe(true);
      expect(result.current.connectionState.error).toEqual(error);
    });
  });

  it('should update capabilities from API response', async () => {
    const { result } = renderHook(() => 
      useClusterTimeseries(['cluster.cpu.used.cores'])
    );

    await waitFor(() => {
      expect(result.current.capabilities).toEqual({
        metricsAPI: true,
        summaryAPI: true
      });
    });
  });

  it('should handle empty series data', async () => {
    mockFetchClusterSeries.mockResolvedValue({
      series: {},
      capabilities: { metricsAPI: false, summaryAPI: false }
    });

    const { result } = renderHook(() => 
      useClusterTimeseries(['cluster.cpu.used.cores'])
    );

    await waitFor(() => {
      expect(result.current.series).toHaveLength(0);
    });
  });

  it('should provide refresh function', async () => {
    const { result } = renderHook(() => 
      useClusterTimeseries(['cluster.cpu.used.cores'])
    );

    await waitFor(() => {
      expect(result.current.connectionState.isLoading).toBe(false);
    });

    // Call refresh
    await result.current.refresh();

    // Should call API again
    expect(mockFetchClusterSeries).toHaveBeenCalledTimes(2);
  });

  it('should provide connect/disconnect functions', async () => {
    const { result } = renderHook(() => 
      useClusterTimeseries(['cluster.cpu.used.cores'])
    );

    await waitFor(() => {
      expect(mockOpenClusterLiveWS).toHaveBeenCalled();
    });

    // Test disconnect
    result.current.disconnect();
    expect(mockWebSocket.close).toHaveBeenCalled();

    // Test reconnect
    result.current.connect();
    expect(mockOpenClusterLiveWS).toHaveBeenCalledTimes(2);
  });

  it('should handle multiple series keys', async () => {
    const { result } = renderHook(() => 
      useClusterTimeseries([
        'cluster.cpu.used.cores',
        'cluster.cpu.capacity.cores'
      ])
    );

    await waitFor(() => {
      expect(result.current.series).toHaveLength(2);
    });

    expect(result.current.series[0].name).toBe('CPU Used');
    expect(result.current.series[1].name).toBe('CPU Capacity');
  });

  it('should use custom configuration options', async () => {
    renderHook(() => 
      useClusterTimeseries(['cluster.cpu.used.cores'], {
        timeWindow: '30m',
        initialResolution: 'hi'
      })
    );

    await waitFor(() => {
      expect(mockFetchClusterSeries).toHaveBeenCalledWith(
        ['cluster.cpu.used.cores'],
        'hi',
        '30m'
      );
    });

    expect(mockGetTimeWindow).toHaveBeenCalledWith('30m');
  });
});

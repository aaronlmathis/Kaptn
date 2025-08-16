/**
 * Time Series Charts Example Component
 * 
 * Demonstrates usage of the cluster time series charts
 * for development and testing purposes.
 */

import * as React from "react"
import { ClusterCPUChart, ClusterNetworkChart, LineCard } from "@/components/charts"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useClusterTimeseries } from "@/hooks/useClusterTimeseries"

export function TimeSeriesChartsExample() {
  // Example of using the hook directly for custom charts
  const {
    series,
    capabilities,
    connectionState,
    refresh,
    connect,
    disconnect
  } = useClusterTimeseries([
    'cluster.cpu.used.cores',
    'cluster.cpu.capacity.cores',
    'cluster.net.rx.bps',
    'cluster.net.tx.bps'
  ], {
    debug: true,
    timeWindow: '30m'
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle>Time Series Charts Demo</CardTitle>
          <CardDescription>
            Real-time cluster metrics visualization using shadcn charts
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Connection Status:</span>
              {connectionState.isLoading ? (
                <Badge variant="outline">Loading...</Badge>
              ) : connectionState.isConnected ? (
                <Badge variant="secondary">Connected</Badge>
              ) : connectionState.hasError ? (
                <Badge variant="destructive">Error</Badge>
              ) : (
                <Badge variant="outline">Disconnected</Badge>
              )}
            </div>
            
            {capabilities && (
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">APIs:</span>
                {capabilities.metricsAPI && (
                  <Badge variant="secondary" className="text-xs">Metrics</Badge>
                )}
                {capabilities.summaryAPI && (
                  <Badge variant="secondary" className="text-xs">Summary</Badge>
                )}
              </div>
            )}
            
            <div className="flex gap-2 ml-auto">
              <Button size="sm" variant="outline" onClick={refresh}>
                Refresh
              </Button>
              {connectionState.isConnected ? (
                <Button size="sm" variant="outline" onClick={disconnect}>
                  Disconnect
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={connect}>
                  Connect
                </Button>
              )}
            </div>
          </div>
          
          {connectionState.error && (
            <div className="mt-3 p-3 rounded-md bg-destructive/10 border border-destructive/20">
              <p className="text-sm text-destructive">
                Error: {connectionState.error.message}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Main Charts Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ClusterCPUChart height={300} />
        <ClusterNetworkChart height={300} />
      </div>

      {/* Custom Chart Using Hook Data */}
      <Card>
        <CardHeader>
          <CardTitle>Custom Chart Example</CardTitle>
          <CardDescription>
            Demonstrating custom usage of the useClusterTimeseries hook
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <strong>Available Series:</strong>
                <ul className="mt-1 space-y-1">
                  {series.map(s => (
                    <li key={s.key} className="flex items-center gap-2">
                      <div 
                        className="w-3 h-3 rounded" 
                        style={{ backgroundColor: s.color }}
                      />
                      {s.name} ({s.data.length} points)
                    </li>
                  ))}
                </ul>
              </div>
              
              <div>
                <strong>Raw Data Keys:</strong>
                <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
                  <li>cluster.cpu.used.cores</li>
                  <li>cluster.cpu.capacity.cores</li>
                  <li>cluster.net.rx.bps</li>
                  <li>cluster.net.tx.bps</li>
                </ul>
              </div>
            </div>

            {series.length > 0 && (
              <LineCard
                title="All Metrics Combined"
                subtitle="Custom chart showing all available time series"
                series={series}
                height={250}
                yFormatter={(value) => value.toFixed(2)}
              />
            )}
          </div>
        </CardContent>
      </Card>

      {/* Usage Documentation */}
      <Card>
        <CardHeader>
          <CardTitle>Usage Guide</CardTitle>
          <CardDescription>
            How to use the time series chart components
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="font-medium mb-2">Quick Start</h4>
            <pre className="p-3 bg-muted rounded-md text-xs overflow-x-auto">
{`import { ClusterCPUChart, ClusterNetworkChart } from '@/components/charts';

// Basic usage
<ClusterCPUChart />
<ClusterNetworkChart />

// With custom height
<ClusterCPUChart height={400} />
<ClusterNetworkChart height={300} />`}
            </pre>
          </div>

          <div>
            <h4 className="font-medium mb-2">Custom Hook Usage</h4>
            <pre className="p-3 bg-muted rounded-md text-xs overflow-x-auto">
{`import { useClusterTimeseries } from '@/hooks/useClusterTimeseries';

const { series, capabilities, connectionState } = useClusterTimeseries([
  'cluster.cpu.used.cores',
  'cluster.net.rx.bps'
], {
  timeWindow: '30m',
  enableStreaming: true
});`}
            </pre>
          </div>

          <div>
            <h4 className="font-medium mb-2">Prerequisites</h4>
            <ul className="text-sm space-y-1 ml-4 list-disc">
              <li>metrics-server installed for CPU metrics</li>
              <li>Kubelet Summary API accessible for network metrics</li>
              <li>Proper RBAC permissions for the backend service</li>
              <li>Backend time series aggregator running</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

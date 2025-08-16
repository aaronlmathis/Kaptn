"use client"

import * as React from "react"
import { SharedProviders } from "@/components/shared-providers"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { RefreshCw, Activity, Database, Zap, CheckCircle, XCircle, AlertTriangle } from "lucide-react"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { ChevronDown } from "lucide-react"

interface HealthData {
	series_count?: number
	total_data_points?: number
	memory_usage_bytes?: number
	websocket_clients?: number
	last_collection_time?: string
	errors?: string[]
}

interface Capabilities {
	metrics_api_available?: boolean
	summary_api_available?: boolean
	node_proxy_available?: boolean
	prometheus_integration?: boolean
}

interface SeriesInfo {
	exists: boolean
	hi_points?: number
	lo_points?: number
	last_hi_points?: Array<{ timestamp: string; value: number }>
	last_lo_points?: Array<{ timestamp: string; value: number }>
}

interface DebugData {
	health?: HealthData
	capabilities?: Capabilities
	series?: Record<string, SeriesInfo>
	config?: {
		timeseries_enabled: boolean
		service_available: boolean
		aggregator_available: boolean
	}
}

function DebugTimeSeriesContent() {
	const [data, setData] = React.useState<DebugData | null>(null)
	const [loading, setLoading] = React.useState(true)
	const [error, setError] = React.useState<string | null>(null)
	const [lastUpdated, setLastUpdated] = React.useState<string | null>(null)
	const [autoRefresh, setAutoRefresh] = React.useState(true)

	const fetchDebugData = React.useCallback(async () => {
		try {
			setLoading(true)
			const response = await fetch('/api/v1/timeseries/cluster')
			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`)
			}
			const timeseriesData = await response.json()

			// Fetch health data
			const healthResponse = await fetch('/api/v1/timeseries/health')
			const healthData = healthResponse.ok ? await healthResponse.json() : null

			// Fetch capabilities
			const capabilitiesResponse = await fetch('/api/v1/capabilities')
			const capabilitiesData = capabilitiesResponse.ok ? await capabilitiesResponse.json() : null

			// Simulate debug data structure (you can modify this based on actual API structure)
			const debugData: DebugData = {
				health: healthData || {
					series_count: Object.keys(timeseriesData?.data || {}).length,
					total_data_points: 0,
					memory_usage_bytes: 0,
					websocket_clients: 0,
					last_collection_time: new Date().toISOString(),
					errors: []
				},
				capabilities: capabilitiesData || {
					metrics_api_available: true,
					summary_api_available: true,
					node_proxy_available: true,
					prometheus_integration: true
				},
				series: timeseriesData?.data ? Object.keys(timeseriesData.data).reduce((acc, key) => {
					const series = timeseriesData.data[key]
					acc[key] = {
						exists: !!series,
						hi_points: series?.hi?.length || 0,
						lo_points: series?.lo?.length || 0,
						last_hi_points: series?.hi?.slice(-10) || [],
						last_lo_points: series?.lo?.slice(-10) || []
					}
					return acc
				}, {} as Record<string, SeriesInfo>) : {},
				config: {
					timeseries_enabled: true,
					service_available: !!timeseriesData,
					aggregator_available: true
				}
			}

			setData(debugData)
			setError(null)
			setLastUpdated(new Date().toISOString())
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to fetch debug data')
		} finally {
			setLoading(false)
		}
	}, [])

	// Initial fetch
	React.useEffect(() => {
		fetchDebugData()
	}, [fetchDebugData])

	// Auto refresh every 30 seconds
	React.useEffect(() => {
		if (!autoRefresh) return

		const interval = setInterval(fetchDebugData, 30000)
		return () => clearInterval(interval)
	}, [autoRefresh, fetchDebugData])

	const getHealthStatus = (health?: HealthData) => {
		if (!health) return { status: 'unknown', icon: AlertTriangle, color: 'text-yellow-500' }

		const hasErrors = health.errors && health.errors.length > 0
		const hasData = (health.series_count || 0) > 0

		if (hasErrors) {
			return { status: 'error', icon: XCircle, color: 'text-red-500' }
		} else if (hasData) {
			return { status: 'healthy', icon: CheckCircle, color: 'text-green-500' }
		} else {
			return { status: 'warning', icon: AlertTriangle, color: 'text-yellow-500' }
		}
	}

	const health = getHealthStatus(data?.health)

	if (loading && !data) {
		return (
			<div className="container mx-auto px-4 py-6">
				<div className="flex items-center justify-center h-96">
					<div className="flex items-center space-x-2">
						<RefreshCw className="h-6 w-6 animate-spin" />
						<span>Loading debug data...</span>
					</div>
				</div>
			</div>
		)
	}

	return (
		<div className="container mx-auto px-4 py-6 space-y-6">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-3xl font-bold">TimeSeries Debug</h1>
					<p className="text-muted-foreground">Live view of ring buffer data and telemetry collection status</p>
				</div>
				<div className="flex items-center space-x-2">
					<Button
						variant="outline"
						size="sm"
						onClick={() => setAutoRefresh(!autoRefresh)}
						className={autoRefresh ? 'bg-green-50 border-green-200' : ''}
					>
						<Activity className={`h-4 w-4 mr-2 ${autoRefresh ? 'animate-pulse' : ''}`} />
						Auto Refresh {autoRefresh ? 'ON' : 'OFF'}
					</Button>
					<Button variant="outline" size="sm" onClick={fetchDebugData} disabled={loading}>
						<RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
						Refresh
					</Button>
				</div>
			</div>

			{error && (
				<Card className="border-red-200 bg-red-50">
					<CardContent className="pt-6">
						<div className="flex items-center space-x-2 text-red-600">
							<XCircle className="h-5 w-5" />
							<span>Error: {error}</span>
						</div>
					</CardContent>
				</Card>
			)}

			{lastUpdated && (
				<div className="text-sm text-muted-foreground">
					Last updated: {new Date(lastUpdated).toLocaleString()}
				</div>
			)}

			{/* Status Overview */}
			<div className="grid grid-cols-1 md:grid-cols-4 gap-4">
				<Card>
					<CardHeader className="pb-2">
						<CardTitle className="text-sm font-medium flex items-center">
							<health.icon className={`h-4 w-4 mr-2 ${health.color}`} />
							Health Status
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">
							<Badge variant={health.status === 'healthy' ? 'default' : health.status === 'error' ? 'destructive' : 'secondary'}>
								{health.status.toUpperCase()}
							</Badge>
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="pb-2">
						<CardTitle className="text-sm font-medium flex items-center">
							<Database className="h-4 w-4 mr-2" />
							Series Count
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">{data?.health?.series_count || 0}</div>
						<p className="text-sm text-muted-foreground">Active series</p>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="pb-2">
						<CardTitle className="text-sm font-medium flex items-center">
							<Activity className="h-4 w-4 mr-2" />
							Data Points
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">{data?.health?.total_data_points || 0}</div>
						<p className="text-sm text-muted-foreground">Total points stored</p>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="pb-2">
						<CardTitle className="text-sm font-medium flex items-center">
							<Zap className="h-4 w-4 mr-2" />
							WebSocket Clients
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">{data?.health?.websocket_clients || 0}</div>
						<p className="text-sm text-muted-foreground">Connected clients</p>
					</CardContent>
				</Card>
			</div>

			{/* Capabilities */}
			<Card>
				<CardHeader>
					<CardTitle>System Capabilities</CardTitle>
					<CardDescription>Available integrations and API access</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="grid grid-cols-2 md:grid-cols-4 gap-4">
						{Object.entries(data?.capabilities || {}).map(([key, value]) => (
							<div key={key} className="flex items-center space-x-2">
								{value ? (
									<CheckCircle className="h-4 w-4 text-green-500" />
								) : (
									<XCircle className="h-4 w-4 text-red-500" />
								)}
								<span className="text-sm">{key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</span>
							</div>
						))}
					</div>
				</CardContent>
			</Card>

			{/* Series Data */}
			<Card>
				<CardHeader>
					<CardTitle>Time Series Data</CardTitle>
					<CardDescription>Individual series status and recent data points</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
						{Object.entries(data?.series || {}).map(([key, series]) => (
							<Card key={key} className={series.exists ? 'border-green-200' : 'border-gray-200'}>
								<CardHeader className="pb-2">
									<CardTitle className="text-sm flex items-center">
										{series.exists ? (
											<CheckCircle className="h-4 w-4 text-green-500 mr-2" />
										) : (
											<XCircle className="h-4 w-4 text-gray-400 mr-2" />
										)}
										{key}
									</CardTitle>
								</CardHeader>
								<CardContent>
									{series.exists ? (
										<div className="space-y-2">
											<div className="text-sm">
												<span className="font-medium">Hi-res:</span> {series.hi_points || 0} points
											</div>
											<div className="text-sm">
												<span className="font-medium">Lo-res:</span> {series.lo_points || 0} points
											</div>
											{(series.last_hi_points?.length || 0) > 0 && (
												<Collapsible>
													<CollapsibleTrigger className="flex items-center text-sm hover:text-primary">
														<ChevronDown className="h-3 w-3 mr-1" />
														Recent points
													</CollapsibleTrigger>
													<CollapsibleContent>
														<ScrollArea className="h-20 mt-2">
															<div className="text-xs font-mono space-y-1">
																{series.last_hi_points?.slice(-5).map((point, idx) => (
																	<div key={idx}>
																		{new Date(point.timestamp).toLocaleTimeString()}: {point.value.toFixed(2)}
																	</div>
																))}
															</div>
														</ScrollArea>
													</CollapsibleContent>
												</Collapsible>
											)}
										</div>
									) : (
										<div className="text-sm text-muted-foreground">No data available</div>
									)}
								</CardContent>
							</Card>
						))}
					</div>
				</CardContent>
			</Card>

			{/* Configuration */}
			<Card>
				<CardHeader>
					<CardTitle>Configuration</CardTitle>
					<CardDescription>TimeSeries service configuration status</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
						{Object.entries(data?.config || {}).map(([key, value]) => (
							<div key={key} className="flex items-center space-x-2">
								{value ? (
									<CheckCircle className="h-4 w-4 text-green-500" />
								) : (
									<XCircle className="h-4 w-4 text-red-500" />
								)}
								<span className="text-sm">{key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</span>
							</div>
						))}
					</div>
				</CardContent>
			</Card>

			{/* Quick Links */}
			<Card>
				<CardHeader>
					<CardTitle>Quick API Links</CardTitle>
					<CardDescription>Direct access to related APIs</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="flex flex-wrap gap-2">
						<Button variant="outline" size="sm" asChild>
							<a href="/api/v1/timeseries/cluster" target="_blank">TimeSeries API</a>
						</Button>
						<Button variant="outline" size="sm" asChild>
							<a href="/api/v1/timeseries/cluster?res=hi&since=5m" target="_blank">Hi-Res (5m)</a>
						</Button>
						<Button variant="outline" size="sm" asChild>
							<a href="/api/v1/timeseries/cluster?res=lo&since=1h" target="_blank">Lo-Res (1h)</a>
						</Button>
						<Button variant="outline" size="sm" asChild>
							<a href="/metrics" target="_blank">Prometheus Metrics</a>
						</Button>
					</div>
				</CardContent>
			</Card>
		</div>
	)
}

export function DebugTimeSeriesContainer() {
	return (
		<SharedProviders>
			<DebugTimeSeriesContent />
		</SharedProviders>
	)
}

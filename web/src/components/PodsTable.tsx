import React, { useState, useEffect } from 'react';

interface Pod {
	name: string;
	namespace: string;
	phase: string;
	ready: boolean;
	readyContainers: number;
	totalContainers: number;
	nodeName: string;
	podIP: string;
	labels: Record<string, string>;
	creationTimestamp: string;
	restartPolicy: string;
}

interface PodsTableProps {
	className?: string;
}

const PodsTable: React.FC<PodsTableProps> = ({ className = '' }) => {
	const [pods, setPods] = useState<Pod[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [wsStatus, setWsStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');

	// Filters
	const [namespaceFilter, setNamespaceFilter] = useState('');
	const [nodeFilter, setNodeFilter] = useState('');
	const [namespaces, setNamespaces] = useState<string[]>([]);
	const [nodes, setNodes] = useState<string[]>([]);

	// Fetch initial pods data
	useEffect(() => {
		const fetchPods = async () => {
			try {
				const response = await fetch('/api/v1/pods');
				if (!response.ok) {
					throw new Error(`HTTP error! status: ${response.status}`);
				}
				const data = await response.json();
				setPods(data);

				// Extract unique namespaces and nodes for filters
				const uniqueNamespaces = [...new Set(data.map((pod: Pod) => pod.namespace))].sort();
				const uniqueNodes = [...new Set(data.map((pod: Pod) => pod.nodeName).filter(Boolean))].sort();
				setNamespaces(uniqueNamespaces as string[]);
				setNodes(uniqueNodes as string[]);

				setError(null);
			} catch (err) {
				console.error('Failed to fetch pods:', err);
				setError(err instanceof Error ? err.message : 'Failed to fetch pods');
			} finally {
				setLoading(false);
			}
		};

		fetchPods();
	}, []);

	// WebSocket connection for real-time updates
	useEffect(() => {
		const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
		const wsUrl = `${wsProtocol}//${window.location.host}/api/v1/stream/pods`;

		let ws: WebSocket;
		let reconnectTimeout: NodeJS.Timeout;

		const connect = () => {
			try {
				ws = new WebSocket(wsUrl);
				setWsStatus('connecting');

				ws.onopen = () => {
					console.log('WebSocket connected to pods stream');
					setWsStatus('connected');
				};

				ws.onmessage = (event) => {
					try {
						const message = JSON.parse(event.data);
						console.log('Received WebSocket message:', message);

						// Handle different message types
						switch (message.type) {
							case 'pod_added':
							case 'pod_updated':
								setPods(prev => {
									const index = prev.findIndex(p => p.name === message.data.name && p.namespace === message.data.namespace);
									if (index >= 0) {
										// Update existing pod
										const updated = [...prev];
										updated[index] = message.data;
										return updated;
									} else {
										// Add new pod
										return [...prev, message.data];
									}
								});
								break;
							case 'pod_deleted':
								setPods(prev => prev.filter(p => !(p.name === message.data.name && p.namespace === message.data.namespace)));
								break;
						}
					} catch (err) {
						console.error('Failed to parse WebSocket message:', err);
					}
				};

				ws.onclose = () => {
					console.log('WebSocket disconnected from pods stream');
					setWsStatus('disconnected');
					// Attempt to reconnect after 3 seconds
					reconnectTimeout = setTimeout(connect, 3000);
				};

				ws.onerror = (error) => {
					console.error('WebSocket error:', error);
					setWsStatus('disconnected');
				};
			} catch (err) {
				console.error('Failed to create WebSocket connection:', err);
				setWsStatus('disconnected');
				reconnectTimeout = setTimeout(connect, 3000);
			}
		};

		connect();

		return () => {
			if (reconnectTimeout) {
				clearTimeout(reconnectTimeout);
			}
			if (ws) {
				ws.close();
			}
		};
	}, []);

	const formatAge = (timestamp: string) => {
		const now = new Date();
		const created = new Date(timestamp);
		const diffMs = now.getTime() - created.getTime();
		const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
		const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
		const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

		if (diffDays > 0) return `${diffDays}d`;
		if (diffHours > 0) return `${diffHours}h`;
		return `${diffMinutes}m`;
	};

	const getPhaseColor = (phase: string) => {
		switch (phase.toLowerCase()) {
			case 'running': return 'bg-green-400';
			case 'pending': return 'bg-yellow-400';
			case 'succeeded': return 'bg-blue-400';
			case 'failed': return 'bg-red-400';
			default: return 'bg-gray-400';
		}
	};

	// Filter pods based on selected filters
	const filteredPods = pods.filter(pod => {
		if (namespaceFilter && pod.namespace !== namespaceFilter) return false;
		if (nodeFilter && pod.nodeName !== nodeFilter) return false;
		return true;
	});

	if (loading) {
		return (
			<div className={`${className} flex items-center justify-center h-64`}>
				<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
			</div>
		);
	}

	if (error) {
		return (
			<div className={`${className} bg-red-50 dark:bg-red-900 border border-red-200 dark:border-red-700 rounded-lg p-4`}>
				<p className="text-red-700 dark:text-red-200">Error: {error}</p>
			</div>
		);
	}

	return (
		<div className={className}>
			{/* Status indicator and filters */}
			<div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-2 sm:space-y-0">
				<div className="flex items-center space-x-2">
					<div className={`w-3 h-3 rounded-full ${wsStatus === 'connected' ? 'bg-green-400' :
							wsStatus === 'connecting' ? 'bg-yellow-400' :
								'bg-red-400'
						}`}></div>
					<span className="text-sm text-gray-600 dark:text-gray-300">
						WebSocket: {wsStatus}
					</span>
				</div>

				<div className="flex space-x-2">
					<select
						value={namespaceFilter}
						onChange={(e) => setNamespaceFilter(e.target.value)}
						className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
					>
						<option value="">All Namespaces</option>
						{namespaces.map(ns => (
							<option key={ns} value={ns}>{ns}</option>
						))}
					</select>

					<select
						value={nodeFilter}
						onChange={(e) => setNodeFilter(e.target.value)}
						className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
					>
						<option value="">All Nodes</option>
						{nodes.map(node => (
							<option key={node} value={node}>{node}</option>
						))}
					</select>
				</div>
			</div>

			{/* Pods table */}
			<div className="bg-white dark:bg-gray-800 shadow overflow-hidden sm:rounded-lg">
				<div className="px-4 py-5 sm:px-6">
					<h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-white">
						Cluster Pods ({filteredPods.length})
					</h3>
					<p className="mt-1 max-w-2xl text-sm text-gray-500 dark:text-gray-400">
						Real-time view of running workloads
					</p>
				</div>
				<div className="border-t border-gray-200 dark:border-gray-700">
					<div className="overflow-x-auto">
						<table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
							<thead className="bg-gray-50 dark:bg-gray-700">
								<tr>
									<th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
										Name
									</th>
									<th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
										Namespace
									</th>
									<th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
										Status
									</th>
									<th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
										Ready
									</th>
									<th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
										Node
									</th>
									<th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
										IP
									</th>
									<th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
										Age
									</th>
								</tr>
							</thead>
							<tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
								{filteredPods.map((pod) => (
									<tr key={`${pod.namespace}/${pod.name}`} className="hover:bg-gray-50 dark:hover:bg-gray-700">
										<td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
											{pod.name}
										</td>
										<td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
											<span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-200">
												{pod.namespace}
											</span>
										</td>
										<td className="px-6 py-4 whitespace-nowrap">
											<div className="flex items-center">
												<div className={`flex-shrink-0 h-2.5 w-2.5 rounded-full ${getPhaseColor(pod.phase)}`}></div>
												<div className="ml-2 text-sm text-gray-900 dark:text-white">
													{pod.phase}
												</div>
											</div>
										</td>
										<td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
											<span className={`${pod.ready ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
												{pod.readyContainers}/{pod.totalContainers}
											</span>
										</td>
										<td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
											{pod.nodeName || '-'}
										</td>
										<td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
											{pod.podIP || '-'}
										</td>
										<td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
											{formatAge(pod.creationTimestamp)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</div>
			</div>
		</div>
	);
};

export default PodsTable;

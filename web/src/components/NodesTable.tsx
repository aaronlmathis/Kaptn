import React, { useState, useEffect } from 'react';
import ConfirmationDialog from './ConfirmationDialog';
import JobProgressModal from './JobProgressModal';
import { useToast } from './Toast';

interface Node {
	name: string;
	roles: string[];
	kubeletVersion: string;
	ready: boolean;
	unschedulable: boolean;
	taints: Array<{
		key: string;
		value: string;
		effect: string;
	}>;
	capacity: {
		cpu: string;
		memory: string;
	};
	allocatable: {
		cpu: string;
		memory: string;
	};
	creationTimestamp: string;
}

interface NodesTableProps {
	className?: string;
}

const NodesTable: React.FC<NodesTableProps> = ({ className = '' }) => {
	const [nodes, setNodes] = useState<Node[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [wsStatus, setWsStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
	
	// Action states
	const [confirmationDialog, setConfirmationDialog] = useState<{
		isOpen: boolean;
		type: 'cordon' | 'uncordon' | 'drain' | null;
		nodeName: string;
		title: string;
		message: string;
	}>({
		isOpen: false,
		type: null,
		nodeName: '',
		title: '',
		message: '',
	});
	
	const [jobProgress, setJobProgress] = useState<{
		isOpen: boolean;
		jobId: string | null;
	}>({
		isOpen: false,
		jobId: null,
	});
	
	const [actionLoading, setActionLoading] = useState<string | null>(null);
	const { addToast } = useToast();

	// Fetch initial nodes data
	useEffect(() => {
		const fetchNodes = async () => {
			try {
				const response = await fetch('/api/v1/nodes');
				if (!response.ok) {
					throw new Error(`HTTP error! status: ${response.status}`);
				}
				const data = await response.json();
				setNodes(data);
				setError(null);
			} catch (err) {
				console.error('Failed to fetch nodes:', err);
				setError(err instanceof Error ? err.message : 'Failed to fetch nodes');
			} finally {
				setLoading(false);
			}
		};

		fetchNodes();
	}, []);

	// WebSocket connection for real-time updates
	useEffect(() => {
		const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
		const wsUrl = `${wsProtocol}//${window.location.host}/api/v1/stream/nodes`;

		let ws: WebSocket;
		let reconnectTimeout: NodeJS.Timeout;

		const connect = () => {
			try {
				ws = new WebSocket(wsUrl);
				setWsStatus('connecting');

				ws.onopen = () => {
					console.log('WebSocket connected to nodes stream');
					setWsStatus('connected');
				};

				ws.onmessage = (event) => {
					try {
						const message = JSON.parse(event.data);
						console.log('Received WebSocket message:', message);

						// Handle different message types
						switch (message.type) {
							case 'node_added':
							case 'node_updated':
								setNodes(prev => {
									const index = prev.findIndex(n => n.name === message.data.name);
									if (index >= 0) {
										// Update existing node
										const updated = [...prev];
										updated[index] = message.data;
										return updated;
									} else {
										// Add new node
										return [...prev, message.data];
									}
								});
								break;
							case 'node_deleted':
								setNodes(prev => prev.filter(n => n.name !== message.data.name));
								break;
						}
					} catch (err) {
						console.error('Failed to parse WebSocket message:', err);
					}
				};

				ws.onclose = () => {
					console.log('WebSocket disconnected from nodes stream');
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

	const formatMemory = (memory: string) => {
		if (memory.endsWith('Ki')) {
			const kb = parseInt(memory.slice(0, -2));
			return `${Math.round(kb / 1024 / 1024)} GB`;
		}
		return memory;
	};

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

	// Action handlers
	const handleCordonClick = (nodeName: string) => {
		setConfirmationDialog({
			isOpen: true,
			type: 'cordon',
			nodeName,
			title: 'Cordon Node',
			message: `Are you sure you want to cordon node "${nodeName}"? This will mark the node as unschedulable, preventing new pods from being scheduled on it.`,
		});
	};

	const handleUncordonClick = (nodeName: string) => {
		setConfirmationDialog({
			isOpen: true,
			type: 'uncordon',
			nodeName,
			title: 'Uncordon Node',
			message: `Are you sure you want to uncordon node "${nodeName}"? This will mark the node as schedulable again.`,
		});
	};

	const handleDrainClick = (nodeName: string) => {
		setConfirmationDialog({
			isOpen: true,
			type: 'drain',
			nodeName,
			title: 'Drain Node',
			message: `Are you sure you want to drain node "${nodeName}"? This will:
			
• Cordon the node (mark as unschedulable)
• Evict all pods from the node
• Respect Pod Disruption Budgets
• Skip DaemonSet and static pods

This operation may take several minutes to complete.`,
		});
	};

	const performAction = async (action: 'cordon' | 'uncordon' | 'drain', nodeName: string) => {
		setActionLoading(nodeName);
		
		try {
			let response: Response;
			
			switch (action) {
				case 'cordon':
					response = await fetch(`/api/v1/nodes/${nodeName}/cordon`, { method: 'POST' });
					break;
				case 'uncordon':
					response = await fetch(`/api/v1/nodes/${nodeName}/uncordon`, { method: 'POST' });
					break;
				case 'drain':
					response = await fetch(`/api/v1/nodes/${nodeName}/drain`, {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							timeoutSeconds: 300,
							force: false,
							ignoreDaemonSets: true,
						}),
					});
					break;
			}

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(errorText || `Failed to ${action} node`);
			}

			if (action === 'drain') {
				const result = await response.json();
				setJobProgress({
					isOpen: true,
					jobId: result.jobId,
				});
				addToast({
					type: 'info',
					title: 'Drain Started',
					message: `Node drain operation has been started. Job ID: ${result.jobId}`,
				});
			} else {
				addToast({
					type: 'success',
					title: `Node ${action === 'cordon' ? 'Cordoned' : 'Uncordoned'}`,
					message: `Successfully ${action === 'cordon' ? 'cordoned' : 'uncordoned'} node "${nodeName}"`,
				});
			}
		} catch (error) {
			console.error(`Failed to ${action} node:`, error);
			addToast({
				type: 'error',
				title: `${action.charAt(0).toUpperCase() + action.slice(1)} Failed`,
				message: error instanceof Error ? error.message : `Failed to ${action} node "${nodeName}"`,
			});
		} finally {
			setActionLoading(null);
		}
	};

	const handleConfirmAction = () => {
		if (confirmationDialog.type && confirmationDialog.nodeName) {
			performAction(confirmationDialog.type, confirmationDialog.nodeName);
		}
		setConfirmationDialog({
			isOpen: false,
			type: null,
			nodeName: '',
			title: '',
			message: '',
		});
	};

	const handleCancelAction = () => {
		setConfirmationDialog({
			isOpen: false,
			type: null,
			nodeName: '',
			title: '',
			message: '',
		});
	};

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
			{/* Status indicator */}
			<div className="mb-4 flex items-center space-x-2">
				<div className={`w-3 h-3 rounded-full ${wsStatus === 'connected' ? 'bg-green-400' :
						wsStatus === 'connecting' ? 'bg-yellow-400' :
							'bg-red-400'
					}`}></div>
				<span className="text-sm text-gray-600 dark:text-gray-300">
					WebSocket: {wsStatus}
				</span>
			</div>

			{/* Nodes table */}
			<div className="bg-white dark:bg-gray-800 shadow overflow-hidden sm:rounded-lg">
				<div className="px-4 py-5 sm:px-6">
					<h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-white">
						Cluster Nodes ({nodes.length})
					</h3>
					<p className="mt-1 max-w-2xl text-sm text-gray-500 dark:text-gray-400">
						Real-time view of cluster nodes
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
										Status
									</th>
									<th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
										Roles
									</th>
									<th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
										Version
									</th>
									<th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
										CPU
									</th>
									<th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
										Memory
									</th>
									<th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
										Age
									</th>
									<th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
										Actions
									</th>
								</tr>
							</thead>
							<tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
								{nodes.map((node) => (
									<tr key={node.name} className="hover:bg-gray-50 dark:hover:bg-gray-700">
										<td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
											{node.name}
										</td>
										<td className="px-6 py-4 whitespace-nowrap">
											<div className="flex items-center">
												<div className={`flex-shrink-0 h-2.5 w-2.5 rounded-full ${node.ready ? 'bg-green-400' : 'bg-red-400'
													}`}></div>
												<div className="ml-2">
													<div className="text-sm text-gray-900 dark:text-white">
														{node.ready ? 'Ready' : 'NotReady'}
													</div>
													{node.unschedulable && (
														<div className="text-sm text-orange-600 dark:text-orange-400">
															SchedulingDisabled
														</div>
													)}
												</div>
											</div>
										</td>
										<td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
											{node.roles.join(', ')}
										</td>
										<td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
											{node.kubeletVersion}
										</td>
										<td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
											{node.allocatable.cpu}
										</td>
										<td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
											{formatMemory(node.allocatable.memory)}
										</td>
										<td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
											{formatAge(node.creationTimestamp)}
										</td>
										<td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
											<div className="flex space-x-2">
												{node.unschedulable ? (
													<button
														onClick={() => handleUncordonClick(node.name)}
														disabled={actionLoading === node.name}
														className="inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded-md text-green-700 bg-green-100 hover:bg-green-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
													>
														{actionLoading === node.name ? (
															<div className="animate-spin rounded-full h-3 w-3 border-b border-green-700 mr-1"></div>
														) : null}
														Uncordon
													</button>
												) : (
													<button
														onClick={() => handleCordonClick(node.name)}
														disabled={actionLoading === node.name}
														className="inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded-md text-yellow-700 bg-yellow-100 hover:bg-yellow-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500 disabled:opacity-50 disabled:cursor-not-allowed"
													>
														{actionLoading === node.name ? (
															<div className="animate-spin rounded-full h-3 w-3 border-b border-yellow-700 mr-1"></div>
														) : null}
														Cordon
													</button>
												)}
												<button
													onClick={() => handleDrainClick(node.name)}
													disabled={actionLoading === node.name}
													className="inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded-md text-red-700 bg-red-100 hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
												>
													{actionLoading === node.name ? (
														<div className="animate-spin rounded-full h-3 w-3 border-b border-red-700 mr-1"></div>
													) : null}
													Drain
												</button>
											</div>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</div>
			</div>

			{/* Confirmation Dialog */}
			<ConfirmationDialog
				isOpen={confirmationDialog.isOpen}
				title={confirmationDialog.title}
				message={confirmationDialog.message}
				type={confirmationDialog.type === 'drain' ? 'danger' : 'warning'}
				confirmText={confirmationDialog.type === 'drain' ? 'Start Drain' : 'Confirm'}
				onConfirm={handleConfirmAction}
				onCancel={handleCancelAction}
			/>

			{/* Job Progress Modal */}
			<JobProgressModal
				isOpen={jobProgress.isOpen}
				jobId={jobProgress.jobId}
				onClose={() => setJobProgress({ isOpen: false, jobId: null })}
			/>
		</div>
	);
};

export default NodesTable;

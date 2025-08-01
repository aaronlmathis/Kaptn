import React, { useEffect, useState } from 'react';

interface JobProgress {
	id: string;
	type: string;
	status: 'running' | 'completed' | 'error';
	progress: string[];
	error?: string;
	startTime: string;
	endTime?: string;
}

interface JobProgressModalProps {
	isOpen: boolean;
	jobId: string | null;
	onClose: () => void;
}

const JobProgressModal: React.FC<JobProgressModalProps> = ({ isOpen, jobId, onClose }) => {
	const [job, setJob] = useState<JobProgress | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!isOpen || !jobId) {
			setJob(null);
			setError(null);
			return;
		}

		setLoading(true);
		setError(null);

		const fetchJob = async () => {
			try {
				const response = await fetch(`/api/v1/jobs/${jobId}`);
				if (!response.ok) {
					throw new Error(`HTTP error! status: ${response.status}`);
				}
				const data = await response.json();
				setJob(data);
			} catch (err) {
				console.error('Failed to fetch job:', err);
				setError(err instanceof Error ? err.message : 'Failed to fetch job');
			} finally {
				setLoading(false);
			}
		};

		// Initial fetch
		fetchJob();

		// Poll for updates if job is running
		const interval = setInterval(() => {
			if (job?.status === 'running' || !job) {
				fetchJob();
			}
		}, 2000);

		return () => clearInterval(interval);
	}, [isOpen, jobId, job?.status]);

	if (!isOpen) return null;

	const getStatusIcon = () => {
		if (loading) {
			return (
				<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
			);
		}

		switch (job?.status) {
			case 'running':
				return (
					<div className="flex items-center justify-center h-8 w-8 rounded-full bg-blue-100">
						<div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
					</div>
				);
			case 'completed':
				return (
					<div className="flex items-center justify-center h-8 w-8 rounded-full bg-green-100">
						<svg className="h-5 w-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
							<path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
						</svg>
					</div>
				);
			case 'error':
				return (
					<div className="flex items-center justify-center h-8 w-8 rounded-full bg-red-100">
						<svg className="h-5 w-5 text-red-600" fill="currentColor" viewBox="0 0 20 20">
							<path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
						</svg>
					</div>
				);
			default:
				return null;
		}
	};

	const getStatusText = () => {
		if (loading) return 'Loading...';

		switch (job?.status) {
			case 'running':
				return 'In Progress';
			case 'completed':
				return 'Completed';
			case 'error':
				return 'Failed';
			default:
				return 'Unknown';
		}
	};

	const formatTime = (timeStr: string) => {
		return new Date(timeStr).toLocaleTimeString();
	};

	return (
		<div className="fixed inset-0 z-50 overflow-y-auto">
			<div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
				{/* Background overlay */}
				<div
					className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
					onClick={onClose}
				></div>

				{/* Center modal */}
				<span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

				<div className="inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full">
					<div className="flex items-center justify-between mb-4">
						<div className="flex items-center space-x-3">
							{getStatusIcon()}
							<div>
								<h3 className="text-lg font-medium text-gray-900 dark:text-white">
									{job?.type === 'drain' ? 'Node Drain Operation' : 'Job Progress'}
								</h3>
								<p className="text-sm text-gray-500 dark:text-gray-400">
									Status: {getStatusText()}
								</p>
							</div>
						</div>
						<button
							onClick={onClose}
							className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
						>
							<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
							</svg>
						</button>
					</div>

					{error && (
						<div className="mb-4 bg-red-50 dark:bg-red-900 border border-red-200 dark:border-red-700 rounded-lg p-4">
							<p className="text-red-700 dark:text-red-200">Error: {error}</p>
						</div>
					)}

					{job && (
						<div className="space-y-4">
							{/* Job info */}
							<div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
								<div className="grid grid-cols-2 gap-4 text-sm">
									<div>
										<span className="font-medium text-gray-900 dark:text-white">Job ID:</span>
										<p className="text-gray-600 dark:text-gray-300 font-mono">{job.id}</p>
									</div>
									<div>
										<span className="font-medium text-gray-900 dark:text-white">Started:</span>
										<p className="text-gray-600 dark:text-gray-300">{formatTime(job.startTime)}</p>
									</div>
									{job.endTime && (
										<div>
											<span className="font-medium text-gray-900 dark:text-white">Ended:</span>
											<p className="text-gray-600 dark:text-gray-300">{formatTime(job.endTime)}</p>
										</div>
									)}
								</div>
							</div>

							{/* Error message */}
							{job.error && (
								<div className="bg-red-50 dark:bg-red-900 border border-red-200 dark:border-red-700 rounded-lg p-4">
									<h4 className="font-medium text-red-900 dark:text-red-200 mb-2">Error Details</h4>
									<p className="text-red-700 dark:text-red-300 text-sm">{job.error}</p>
								</div>
							)}

							{/* Progress log */}
							<div>
								<h4 className="font-medium text-gray-900 dark:text-white mb-2">Progress Log</h4>
								<div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 max-h-64 overflow-y-auto">
									{job.progress.length > 0 ? (
										<div className="space-y-1">
											{job.progress.map((entry, index) => (
												<div key={index} className="text-sm font-mono text-gray-700 dark:text-gray-300">
													{entry}
												</div>
											))}
										</div>
									) : (
										<p className="text-gray-500 dark:text-gray-400 text-sm">No progress entries yet...</p>
									)}
								</div>
							</div>
						</div>
					)}

					<div className="mt-6 flex justify-end">
						<button
							onClick={onClose}
							className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-md text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
						>
							Close
						</button>
					</div>
				</div>
			</div>
		</div>
	);
};

export default JobProgressModal;

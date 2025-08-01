import React from 'react';

interface ResourceResult {
	name: string;
	namespace?: string;
	kind: string;
	apiVersion: string;
	action: string; // "created", "updated", "unchanged", "error"
	error?: string;
	diff?: Record<string, any>;
}

interface ApplyResult {
	success: boolean;
	resources: ResourceResult[];
	errors?: string[];
	message?: string;
}

interface ApplyResultsProps {
	result: ApplyResult;
	isDryRun: boolean;
	className?: string;
}

const ApplyResults: React.FC<ApplyResultsProps> = ({ result, isDryRun, className = '' }) => {
	const getActionIcon = (action: string) => {
		switch (action) {
			case 'created':
				return <span className="text-green-500">✓</span>;
			case 'updated':
				return <span className="text-blue-500">↻</span>;
			case 'unchanged':
				return <span className="text-gray-500">−</span>;
			case 'error':
				return <span className="text-red-500">✗</span>;
			default:
				return <span className="text-gray-500">?</span>;
		}
	};

	const getActionLabel = (action: string, isDryRun: boolean) => {
		if (isDryRun) {
			switch (action) {
				case 'created':
					return 'Would be created';
				case 'updated':
					return 'Would be updated';
				case 'unchanged':
					return 'No changes';
				case 'error':
					return 'Error';
				default:
					return action;
			}
		}

		switch (action) {
			case 'created':
				return 'Created';
			case 'updated':
				return 'Updated';
			case 'unchanged':
				return 'Unchanged';
			case 'error':
				return 'Error';
			default:
				return action;
		}
	};

	const formatResourceName = (resource: ResourceResult) => {
		const name = resource.namespace ? `${resource.namespace}/${resource.name}` : resource.name;
		return `${resource.kind}/${name}`;
	};

	const renderDiff = (diff: Record<string, any>) => {
		if (!diff || Object.keys(diff).length === 0) {
			return null;
		}

		return (
			<div className="mt-2 p-3 bg-gray-50 dark:bg-gray-800 rounded text-xs">
				<div className="font-medium text-gray-700 dark:text-gray-300 mb-2">Changes:</div>
				<pre className="whitespace-pre-wrap text-gray-600 dark:text-gray-400 overflow-x-auto">
					{JSON.stringify(diff, null, 2)}
				</pre>
			</div>
		);
	};

	return (
		<div className={`bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 ${className}`}>
			<div className="flex items-center justify-between mb-4">
				<h3 className="text-lg font-medium text-gray-900 dark:text-white">
					{isDryRun ? 'Dry Run Results' : 'Apply Results'}
				</h3>
				<div className={`px-3 py-1 rounded-full text-sm font-medium ${result.success
						? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
						: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
					}`}>
					{result.success ? 'Success' : 'Failed'}
				</div>
			</div>

			{result.message && (
				<div className={`p-3 rounded-md mb-4 ${result.success
						? 'bg-green-50 text-green-700 dark:bg-green-900 dark:text-green-200'
						: 'bg-red-50 text-red-700 dark:bg-red-900 dark:text-red-200'
					}`}>
					{result.message}
				</div>
			)}

			{result.errors && result.errors.length > 0 && (
				<div className="mb-4">
					<h4 className="text-sm font-medium text-red-700 dark:text-red-300 mb-2">Errors:</h4>
					<div className="space-y-1">
						{result.errors.map((error, index) => (
							<div key={index} className="p-2 bg-red-50 dark:bg-red-900 text-red-700 dark:text-red-200 rounded text-sm">
								{error}
							</div>
						))}
					</div>
				</div>
			)}

			{result.resources && result.resources.length > 0 && (
				<div>
					<h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
						Resources ({result.resources.length}):
					</h4>
					<div className="space-y-3">
						{result.resources.map((resource, index) => (
							<div key={index} className="border border-gray-200 dark:border-gray-600 rounded-md p-3">
								<div className="flex items-center justify-between">
									<div className="flex items-center space-x-3">
										{getActionIcon(resource.action)}
										<div>
											<div className="font-medium text-gray-900 dark:text-white">
												{formatResourceName(resource)}
											</div>
											<div className="text-sm text-gray-500 dark:text-gray-400">
												{resource.apiVersion}
											</div>
										</div>
									</div>
									<div className={`px-2 py-1 rounded text-xs font-medium ${resource.action === 'created' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
											resource.action === 'updated' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' :
												resource.action === 'unchanged' ? 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200' :
													'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
										}`}>
										{getActionLabel(resource.action, isDryRun)}
									</div>
								</div>

								{resource.error && (
									<div className="mt-2 p-2 bg-red-50 dark:bg-red-900 text-red-700 dark:text-red-200 rounded text-sm">
										{resource.error}
									</div>
								)}

								{resource.diff && renderDiff(resource.diff)}
							</div>
						))}
					</div>
				</div>
			)}

			{(!result.resources || result.resources.length === 0) && !result.errors && (
				<div className="text-center py-8 text-gray-500 dark:text-gray-400">
					No resources to display
				</div>
			)}
		</div>
	);
};

export default ApplyResults;

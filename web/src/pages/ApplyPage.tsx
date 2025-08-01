import React, { useState, useEffect } from 'react';
import YamlEditor from '../components/YamlEditor';
import ApplyResults from '../components/ApplyResults';
import { useToast } from '../components/Toast';

interface ApplyOptions {
	dryRun: boolean;
	force: boolean;
	namespace: string;
}

interface ApplyResult {
	success: boolean;
	resources: Array<{
		name: string;
		namespace?: string;
		kind: string;
		apiVersion: string;
		action: string;
		error?: string;
		diff?: Record<string, any>;
	}>;
	errors?: string[];
	message?: string;
}

const ApplyPage: React.FC = () => {
	const [yamlContent, setYamlContent] = useState('');
	const [namespace, setNamespace] = useState('default');
	const [loading, setLoading] = useState(false);
	const [dryRunLoading, setDryRunLoading] = useState(false);
	const [result, setResult] = useState<ApplyResult | null>(null);
	const [isDryRun, setIsDryRun] = useState(false);
	const { addToast } = useToast();

	// Load saved content from localStorage on mount
	useEffect(() => {
		const savedContent = localStorage.getItem('kad-yaml-editor-content');
		if (savedContent) {
			setYamlContent(savedContent);
		} else {
			// Set default example YAML
			setYamlContent(`apiVersion: v1
kind: ConfigMap
metadata:
  name: example-config
  namespace: default
data:
  app.properties: |
    database.url=localhost:5432
    database.name=myapp
  config.yaml: |
    server:
      port: 8080
      host: 0.0.0.0`);
		}
	}, []);

	// Save content to localStorage whenever it changes
	useEffect(() => {
		if (yamlContent) {
			localStorage.setItem('kad-yaml-editor-content', yamlContent);
		}
	}, [yamlContent]);

	const handleApply = async (dryRun: boolean = false) => {
		if (!yamlContent.trim()) {
			addToast({ type: 'error', title: 'Please enter YAML content' });
			return;
		}

		const loadingSetter = dryRun ? setDryRunLoading : setLoading;
		loadingSetter(true);
		setResult(null);

		try {
			const options: ApplyOptions = {
				dryRun,
				force: false,
				namespace,
			};

			const queryParams = new URLSearchParams({
				dryRun: dryRun.toString(),
				force: options.force.toString(),
			});

			const response = await fetch(`/api/v1/namespaces/${namespace}/apply?${queryParams}`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/yaml',
				},
				body: yamlContent,
			});

			const data = await response.json();

			if (!response.ok) {
				// Handle HTTP errors
				if (data.error) {
					addToast({ type: 'error', title: 'Apply failed', message: data.error });
				} else if (data.errors && data.errors.length > 0) {
					addToast({ type: 'error', title: 'Apply failed', message: data.errors[0] });
				} else {
					addToast({ type: 'error', title: `Apply failed with status ${response.status}` });
				}
				setResult(data);
				return;
			}

			setResult(data);
			setIsDryRun(dryRun);

			if (data.success) {
				if (dryRun) {
					addToast({
						type: 'success',
						title: `Dry run completed successfully for ${data.resources?.length || 0} resources`
					});
				} else {
					addToast({
						type: 'success',
						title: `Successfully applied ${data.resources?.length || 0} resources`
					});
				}
			} else {
				addToast({ type: 'warning', title: 'Operation completed with errors' });
			}
		} catch (error) {
			console.error('Apply error:', error);
			addToast({
				type: 'error',
				title: 'Network error',
				message: error instanceof Error ? error.message : 'Unknown error'
			});
		} finally {
			loadingSetter(false);
		}
	};

	const handleClearEditor = () => {
		setYamlContent('');
		setResult(null);
		localStorage.removeItem('kad-yaml-editor-content');
		addToast({ type: 'info', title: 'Editor cleared' });
	};

	const handleLoadExample = (example: string) => {
		let exampleYaml = '';

		switch (example) {
			case 'configmap':
				exampleYaml = `apiVersion: v1
kind: ConfigMap
metadata:
  name: example-config
  namespace: ${namespace}
data:
  app.properties: |
    database.url=localhost:5432
    database.name=myapp
  config.yaml: |
    server:
      port: 8080
      host: 0.0.0.0`;
				break;
			case 'deployment':
				exampleYaml = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: nginx-deployment
  namespace: ${namespace}
  labels:
    app: nginx
spec:
  replicas: 3
  selector:
    matchLabels:
      app: nginx
  template:
    metadata:
      labels:
        app: nginx
    spec:
      containers:
      - name: nginx
        image: nginx:1.21
        ports:
        - containerPort: 80
        resources:
          requests:
            memory: "64Mi"
            cpu: "250m"
          limits:
            memory: "128Mi"
            cpu: "500m"`;
				break;
			case 'service':
				exampleYaml = `apiVersion: v1
kind: Service
metadata:
  name: nginx-service
  namespace: ${namespace}
spec:
  selector:
    app: nginx
  ports:
  - protocol: TCP
    port: 80
    targetPort: 80
  type: ClusterIP`;
				break;
			default:
				return;
		}

		setYamlContent(exampleYaml);
		setResult(null);
		addToast({ type: 'info', title: `Loaded ${example} example` });
	};

	return (
		<div className="space-y-6">
			<div className="bg-white dark:bg-gray-800 shadow overflow-hidden sm:rounded-lg">
				<div className="px-4 py-5 sm:px-6 border-b border-gray-200 dark:border-gray-700">
					<div className="flex items-center justify-between">
						<div>
							<h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-white">
								Apply YAML
							</h3>
							<p className="mt-1 max-w-2xl text-sm text-gray-500 dark:text-gray-400">
								Create or update Kubernetes resources using YAML manifests
							</p>
						</div>
						<div className="flex items-center space-x-3">
							<select
								value={namespace}
								onChange={(e) => setNamespace(e.target.value)}
								className="block w-40 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white text-sm"
							>
								<option value="default">default</option>
								<option value="kube-system">kube-system</option>
								<option value="kube-public">kube-public</option>
							</select>
						</div>
					</div>
				</div>

				<div className="px-4 py-5 sm:p-6">
					{/* Toolbar */}
					<div className="flex items-center justify-between mb-4">
						<div className="flex items-center space-x-2">
							<span className="text-sm font-medium text-gray-700 dark:text-gray-300">Load Example:</span>
							<button
								onClick={() => handleLoadExample('configmap')}
								className="px-3 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
							>
								ConfigMap
							</button>
							<button
								onClick={() => handleLoadExample('deployment')}
								className="px-3 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
							>
								Deployment
							</button>
							<button
								onClick={() => handleLoadExample('service')}
								className="px-3 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
							>
								Service
							</button>
						</div>
						<button
							onClick={handleClearEditor}
							className="px-3 py-1 text-xs bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 rounded hover:bg-red-200 dark:hover:bg-red-800"
						>
							Clear
						</button>
					</div>

					{/* YAML Editor */}
					<div className="mb-6">
						<YamlEditor
							value={yamlContent}
							onChange={setYamlContent}
							height="500px"
							className="w-full"
						/>
					</div>

					{/* Action Buttons */}
					<div className="flex items-center space-x-3">
						<button
							onClick={() => handleApply(true)}
							disabled={dryRunLoading || loading || !yamlContent.trim()}
							className={`inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 shadow-sm text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed`}
						>
							{dryRunLoading ? (
								<>
									<svg className="animate-spin -ml-1 mr-3 h-4 w-4 text-gray-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
										<circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
										<path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
									</svg>
									Running Dry Run...
								</>
							) : (
								'Dry Run'
							)}
						</button>
						<button
							onClick={() => handleApply(false)}
							disabled={loading || dryRunLoading || !yamlContent.trim()}
							className={`inline-flex items-center px-6 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed`}
						>
							{loading ? (
								<>
									<svg className="animate-spin -ml-1 mr-3 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
										<circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
										<path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
									</svg>
									Applying...
								</>
							) : (
								'Apply'
							)}
						</button>
					</div>
				</div>
			</div>

			{/* Results */}
			{result && (
				<ApplyResults
					result={result}
					isDryRun={isDryRun}
					className="mt-6"
				/>
			)}
		</div>
	);
};

export default ApplyPage;

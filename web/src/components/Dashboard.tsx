import React, { useState } from 'react';
import NodesTable from './NodesTable';
import PodsTable from './PodsTable';
import ApplyPage from '../pages/ApplyPage';
import { UserProfile } from './UserProfile';

type TabType = 'overview' | 'nodes' | 'pods' | 'apply' | 'events';

interface DashboardProps { }

const Dashboard: React.FC<DashboardProps> = () => {
	const [darkMode, setDarkMode] = useState(false);
	const [activeTab, setActiveTab] = useState<TabType>('overview');

	const toggleTheme = () => {
		setDarkMode(!darkMode);
		document.documentElement.classList.toggle('dark');
	};

	const renderContent = () => {
		switch (activeTab) {
			case 'nodes':
				return <NodesTable className="mt-6" />;
			case 'pods':
				return <PodsTable className="mt-6" />;
			case 'apply':
				return <ApplyPage />;
			case 'events':
				return (
					<div className="mt-6 bg-white dark:bg-gray-800 shadow overflow-hidden sm:rounded-lg p-6">
						<h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-white mb-4">
							Cluster Events
						</h3>
						<p className="text-gray-600 dark:text-gray-300">Events view coming soon...</p>
					</div>
				);
			default:
				return (
					<div className="mt-6">
						<div className="border-4 border-dashed border-gray-200 dark:border-gray-700 rounded-lg h-96 flex items-center justify-center">
							<div className="text-center">
								<h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
									Welcome to Kubernetes Admin Dashboard
								</h2>
								<p className="text-lg text-gray-600 dark:text-gray-300 mb-8">
									Monitor and manage your Kubernetes cluster with ease
								</p>
								<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 max-w-4xl mx-auto">
									<button
										onClick={() => setActiveTab('nodes')}
										className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 border border-gray-200 dark:border-gray-700 hover:shadow-lg transition-shadow"
									>
										<h3 className="text-lg font-semibold mb-2">Nodes</h3>
										<p className="text-gray-600 dark:text-gray-300">View and manage cluster nodes</p>
									</button>
									<button
										onClick={() => setActiveTab('pods')}
										className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 border border-gray-200 dark:border-gray-700 hover:shadow-lg transition-shadow"
									>
										<h3 className="text-lg font-semibold mb-2">Pods</h3>
										<p className="text-gray-600 dark:text-gray-300">Monitor running workloads</p>
									</button>
									<button
										onClick={() => setActiveTab('apply')}
										className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 border border-gray-200 dark:border-gray-700 hover:shadow-lg transition-shadow"
									>
										<h3 className="text-lg font-semibold mb-2">Apply YAML</h3>
										<p className="text-gray-600 dark:text-gray-300">Deploy resources declaratively</p>
									</button>
									<button
										onClick={() => setActiveTab('events')}
										className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 border border-gray-200 dark:border-gray-700 hover:shadow-lg transition-shadow"
									>
										<h3 className="text-lg font-semibold mb-2">Events</h3>
										<p className="text-gray-600 dark:text-gray-300">View cluster events</p>
									</button>
								</div>
							</div>
						</div>
					</div>
				);
		}
	};

	return (
		<div className={`min-h-screen ${darkMode ? 'dark' : ''}`}>
			<div className="bg-white dark:bg-gray-900 text-gray-900 dark:text-white min-h-screen">
				{/* Header */}
				<header className="bg-blue-600 dark:bg-blue-800 text-white shadow-lg">
					<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
						<div className="flex justify-between items-center py-4">
							<div className="flex items-center">
								<h1 className="text-2xl font-bold">Kubernetes Admin Dashboard</h1>
							</div>
							<div className="flex items-center space-x-4">
								<UserProfile />
								<button
									onClick={toggleTheme}
									className="p-2 rounded-lg bg-blue-700 hover:bg-blue-800 dark:bg-blue-900 dark:hover:bg-blue-800 transition-colors"
									aria-label="Toggle theme"
								>
									{darkMode ? (
										<svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
											<path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd" />
										</svg>
									) : (
										<svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
											<path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
										</svg>
									)}
								</button>
							</div>
						</div>
					</div>
				</header>

				{/* Navigation */}
				<nav className="bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
					<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
						<div className="flex space-x-8">
							<button
								onClick={() => setActiveTab('overview')}
								className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium ${activeTab === 'overview'
									? 'border-blue-500 text-blue-600 dark:text-blue-400'
									: 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-200'
									}`}
							>
								Cluster Status
							</button>
							<button
								onClick={() => setActiveTab('nodes')}
								className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium ${activeTab === 'nodes'
									? 'border-blue-500 text-blue-600 dark:text-blue-400'
									: 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-200'
									}`}
							>
								Nodes
							</button>
							<button
								onClick={() => setActiveTab('pods')}
								className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium ${activeTab === 'pods'
									? 'border-blue-500 text-blue-600 dark:text-blue-400'
									: 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-200'
									}`}
							>
								Pods
							</button>
							<button
								onClick={() => setActiveTab('apply')}
								className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium ${activeTab === 'apply'
									? 'border-blue-500 text-blue-600 dark:text-blue-400'
									: 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-200'
									}`}
							>
								Apply YAML
							</button>
							<button
								onClick={() => setActiveTab('events')}
								className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium ${activeTab === 'events'
									? 'border-blue-500 text-blue-600 dark:text-blue-400'
									: 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-200'
									}`}
							>
								Events
							</button>
						</div>
					</div>
				</nav>

				{/* Main Content */}
				<main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
					<div className="px-4 py-6 sm:px-0">
						{renderContent()}
					</div>
				</main>
			</div>
		</div>
	);
};

export default Dashboard;

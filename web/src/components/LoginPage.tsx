import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

export const LoginPage: React.FC = () => {
	const { login, isLoading } = useAuth();
	const [isLoggingIn, setIsLoggingIn] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleLogin = async () => {
		try {
			setIsLoggingIn(true);
			setError(null);
			await login();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Login failed');
		} finally {
			setIsLoggingIn(false);
		}
	};

	const handleDevLogin = async () => {
		try {
			setIsLoggingIn(true);
			setError(null);

			// Try the regular login first to see if we're in dev mode
			await login();
		} catch (err) {
			// If login fails, create a development user manually
			const devUser = {
				id: 'dev-user',
				email: 'dev@localhost',
				name: 'Development User',
				groups: ['admin'],
				claims: {
					sub: 'dev-user',
					email: 'dev@localhost',
					name: 'Development User',
					groups: ['admin'],
				},
			};

			// Store in localStorage for development
			window.localStorage.setItem('dev_user', JSON.stringify(devUser));
			window.location.reload();
		} finally {
			setIsLoggingIn(false);
		}
	};

	if (isLoading) {
		return (
			<div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
				<div className="flex items-center justify-center">
					<div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div>
				</div>
			</div>
		);
	}

	return (
		<div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
			<div className="sm:mx-auto sm:w-full sm:max-w-md">
				<div className="text-center">
					<h1 className="text-4xl font-bold text-gray-900 mb-2">
						Kubernetes Admin Dashboard
					</h1>
					<h2 className="text-2xl font-semibold text-gray-700">
						Sign in to your account
					</h2>
					<p className="mt-2 text-sm text-gray-600">
						Secure access to your Kubernetes cluster
					</p>
				</div>
			</div>

			<div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
				<div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
					<div className="space-y-6">
						{error && (
							<div className="rounded-md bg-red-50 p-4">
								<div className="flex">
									<div className="ml-3">
										<h3 className="text-sm font-medium text-red-800">
											Login Error
										</h3>
										<div className="mt-2 text-sm text-red-700">
											<p>{error}</p>
										</div>
									</div>
								</div>
							</div>
						)}

						<div>
							<button
								onClick={handleLogin}
								disabled={isLoggingIn}
								className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
							>
								{isLoggingIn ? (
									<div className="flex items-center">
										<div className="animate-spin -ml-1 mr-3 h-5 w-5 text-white">
											<div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full"></div>
										</div>
										Signing in...
									</div>
								) : (
									'Sign in with OIDC'
								)}
							</button>
						</div>

						{/* Development mode login */}
						{process.env.NODE_ENV === 'development' && (
							<div className="mt-6">
								<div className="relative">
									<div className="absolute inset-0 flex items-center">
										<div className="w-full border-t border-gray-300" />
									</div>
									<div className="relative flex justify-center text-sm">
										<span className="px-2 bg-white text-gray-500">Development Only</span>
									</div>
								</div>

								<div className="mt-6">
									<button
										onClick={handleDevLogin}
										className="w-full flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
									>
										<svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
											<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
										</svg>
										Dev Login (Admin)
									</button>
								</div>
							</div>
						)}

						<div className="mt-6">
							<div className="text-center text-sm text-gray-600">
								<p>
									Need help? Contact your cluster administrator for access.
								</p>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
};

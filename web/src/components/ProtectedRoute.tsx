import React from 'react';
import type { ReactNode } from 'react';
import { useAuth } from '../contexts/AuthContext';

interface ProtectedRouteProps {
	children: ReactNode;
	requireAuth?: boolean;
	requireWrite?: boolean;
	requiredRoles?: string[];
	fallback?: ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
	children,
	requireAuth = true,
	requireWrite = false,
	requiredRoles = [],
	fallback,
}) => {
	const { isAuthenticated, isLoading, hasRole, canWrite } = useAuth();

	// Show loading state
	if (isLoading) {
		return (
			<div className="flex items-center justify-center min-h-screen">
				<div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div>
			</div>
		);
	}

	// Check authentication requirement
	if (requireAuth && !isAuthenticated) {
		return fallback || <LoginRequired />;
	}

	// Check write permission requirement
	if (requireWrite && !canWrite()) {
		return fallback || <InsufficientPermissions message="Write permissions required" />;
	}

	// Check specific role requirements
	if (requiredRoles.length > 0) {
		const hasRequiredRole = requiredRoles.some(role => hasRole(role));
		if (!hasRequiredRole) {
			return (
				fallback || (
					<InsufficientPermissions
						message={`One of these roles is required: ${requiredRoles.join(', ')}`}
					/>
				)
			);
		}
	}

	return <>{children}</>;
};

const LoginRequired: React.FC = () => {
	const { login } = useAuth();

	const handleLogin = () => {
		login(window.location.pathname).catch(error => {
			console.error('Login failed:', error);
		});
	};

	return (
		<div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
			<div className="sm:mx-auto sm:w-full sm:max-w-md">
				<div className="text-center">
					<h2 className="mt-6 text-3xl font-extrabold text-gray-900">
						Authentication Required
					</h2>
					<p className="mt-2 text-sm text-gray-600">
						Please log in to access this page
					</p>
				</div>
			</div>

			<div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
				<div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
					<button
						onClick={handleLogin}
						className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
					>
						Log In
					</button>
				</div>
			</div>
		</div>
	);
};

interface InsufficientPermissionsProps {
	message: string;
}

const InsufficientPermissions: React.FC<InsufficientPermissionsProps> = ({ message }) => {
	return (
		<div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
			<div className="sm:mx-auto sm:w-full sm:max-w-md">
				<div className="text-center">
					<div className="mx-auto h-12 w-12 text-red-400">
						<svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636m12.728 12.728L18.364 5.636" />
						</svg>
					</div>
					<h2 className="mt-6 text-3xl font-extrabold text-gray-900">
						Access Denied
					</h2>
					<p className="mt-2 text-sm text-gray-600">
						{message}
					</p>
				</div>
			</div>

			<div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
				<div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10 text-center">
					<p className="text-sm text-gray-500">
						Contact your administrator if you believe you should have access to this resource.
					</p>
				</div>
			</div>
		</div>
	);
};

import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

export const UserProfile: React.FC = () => {
	const { user, logout, isAuthenticated } = useAuth();
	const [isOpen, setIsOpen] = useState(false);

	if (!isAuthenticated || !user) {
		return null;
	}

	const handleLogout = () => {
		logout();
		setIsOpen(false);
	};

	return (
		<div className="relative">
			<button
				onClick={() => setIsOpen(!isOpen)}
				className="flex items-center space-x-2 text-gray-700 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded-md p-2"
			>
				<div className="h-8 w-8 bg-blue-500 rounded-full flex items-center justify-center">
					<span className="text-white font-medium text-sm">
						{user.name ? user.name.charAt(0).toUpperCase() : user.email.charAt(0).toUpperCase()}
					</span>
				</div>
				<div className="hidden md:block text-left">
					<div className="text-sm font-medium">{user.name || user.email}</div>
					<div className="text-xs text-gray-500">{user.groups.join(', ') || 'No roles'}</div>
				</div>
				<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
				</svg>
			</button>

			{isOpen && (
				<>
					{/* Backdrop */}
					<div
						className="fixed inset-0 z-10"
						onClick={() => setIsOpen(false)}
					/>

					{/* Dropdown menu */}
					<div className="absolute right-0 mt-2 w-64 bg-white rounded-md shadow-lg ring-1 ring-black ring-opacity-5 z-20">
						<div className="py-1">
							{/* User info */}
							<div className="px-4 py-3 border-b border-gray-200">
								<div className="text-sm font-medium text-gray-900">{user.name || 'Unknown User'}</div>
								<div className="text-sm text-gray-500">{user.email}</div>
								<div className="text-xs text-gray-400 mt-1">
									ID: {user.id}
								</div>
							</div>

							{/* Roles */}
							<div className="px-4 py-3 border-b border-gray-200">
								<div className="text-xs font-medium text-gray-700 uppercase tracking-wider">Roles</div>
								<div className="mt-1">
									{user.groups.length > 0 ? (
										<div className="flex flex-wrap gap-1">
											{user.groups.map((role, index) => (
												<span
													key={index}
													className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
												>
													{role}
												</span>
											))}
										</div>
									) : (
										<span className="text-xs text-gray-500">No roles assigned</span>
									)}
								</div>
							</div>

							{/* Permissions summary */}
							<div className="px-4 py-3 border-b border-gray-200">
								<div className="text-xs font-medium text-gray-700 uppercase tracking-wider">Permissions</div>
								<div className="mt-1 space-y-1">
									<div className="flex items-center justify-between">
										<span className="text-xs text-gray-600">Read</span>
										<span className={`text-xs ${user.groups.length > 0 ? 'text-green-600' : 'text-red-600'}`}>
											{user.groups.length > 0 ? '✓' : '✗'}
										</span>
									</div>
									<div className="flex items-center justify-between">
										<span className="text-xs text-gray-600">Write</span>
										<span className={`text-xs ${user.groups.some(g => ['admin', 'cluster-admin', 'kad-admin', 'editor', 'kad-editor'].includes(g))
												? 'text-green-600' : 'text-red-600'
											}`}>
											{user.groups.some(g => ['admin', 'cluster-admin', 'kad-admin', 'editor', 'kad-editor'].includes(g)) ? '✓' : '✗'}
										</span>
									</div>
								</div>
							</div>

							{/* Logout button */}
							<button
								onClick={handleLogout}
								className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 focus:outline-none focus:bg-gray-100"
							>
								<div className="flex items-center">
									<svg className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
										<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
									</svg>
									Log out
								</div>
							</button>
						</div>
					</div>
				</>
			)}
		</div>
	);
};

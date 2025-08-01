import React from 'react';

interface ConfirmationDialogProps {
	isOpen: boolean;
	title: string;
	message: string;
	confirmText?: string;
	cancelText?: string;
	type?: 'danger' | 'warning' | 'info';
	onConfirm: () => void;
	onCancel: () => void;
}

const ConfirmationDialog: React.FC<ConfirmationDialogProps> = ({
	isOpen,
	title,
	message,
	confirmText = 'Confirm',
	cancelText = 'Cancel',
	type = 'info',
	onConfirm,
	onCancel,
}) => {
	if (!isOpen) return null;

	const getButtonStyles = () => {
		switch (type) {
			case 'danger':
				return 'bg-red-600 hover:bg-red-700 focus:ring-red-500';
			case 'warning':
				return 'bg-yellow-600 hover:bg-yellow-700 focus:ring-yellow-500';
			default:
				return 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500';
		}
	};

	const getIcon = () => {
		switch (type) {
			case 'danger':
				return (
					<div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100">
						<svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.732L13.732 4.268c-.77-1.064-2.694-1.064-3.464 0L3.34 16.268C2.57 17.333 3.532 19 5.072 19z" />
						</svg>
					</div>
				);
			case 'warning':
				return (
					<div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-yellow-100">
						<svg className="h-6 w-6 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.732L13.732 4.268c-.77-1.064-2.694-1.064-3.464 0L3.34 16.268C2.57 17.333 3.532 19 5.072 19z" />
						</svg>
					</div>
				);
			default:
				return (
					<div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-blue-100">
						<svg className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
						</svg>
					</div>
				);
		}
	};

	return (
		<div className="fixed inset-0 z-50 overflow-y-auto">
			<div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
				{/* Background overlay */}
				<div
					className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
					onClick={onCancel}
				></div>

				{/* Center modal */}
				<span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

				<div className="inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full sm:p-6">
					<div className="sm:flex sm:items-start">
						<div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left w-full">
							{getIcon()}
							<h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-white mt-4">
								{title}
							</h3>
							<div className="mt-2">
								<p className="text-sm text-gray-500 dark:text-gray-300">
									{message}
								</p>
							</div>
						</div>
					</div>
					<div className="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse">
						<button
							type="button"
							className={`w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 text-base font-medium text-white focus:outline-none focus:ring-2 focus:ring-offset-2 sm:ml-3 sm:w-auto sm:text-sm ${getButtonStyles()}`}
							onClick={onConfirm}
						>
							{confirmText}
						</button>
						<button
							type="button"
							className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 dark:border-gray-600 shadow-sm px-4 py-2 bg-white dark:bg-gray-700 text-base font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:w-auto sm:text-sm"
							onClick={onCancel}
						>
							{cancelText}
						</button>
					</div>
				</div>
			</div>
		</div>
	);
};

export default ConfirmationDialog;

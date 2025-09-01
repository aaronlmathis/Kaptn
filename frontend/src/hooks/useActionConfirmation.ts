import { useState } from 'react';

// Hook for managing action confirmation dialogs
export function useActionConfirmation() {
	const [confirmationDialog, setConfirmationDialog] = useState<{
		open: boolean;
		action: string;
		resources: string[];
		onConfirm: (token?: string) => void;
	} | null>(null);

	const showConfirmation = (action: string, resources: string[], onConfirm: (token?: string) => void) => {
		setConfirmationDialog({
			open: true,
			action,
			resources,
			onConfirm,
		});
	};

	const hideConfirmation = () => {
		setConfirmationDialog(null);
	};

	return {
		showConfirmation,
		hideConfirmation,
		confirmationDialog
	};
}

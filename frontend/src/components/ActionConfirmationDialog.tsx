// Example integration for frontend confirmation dialogs
// This shows how to implement the confirmation dialogs for destructive actions

import { useState } from 'react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Trash2, Power, RotateCcw } from 'lucide-react';

interface ConfirmationDialogProps {
	action: string;
	resources: string[];
	onConfirm: (confirmationToken?: string) => void;
	onCancel: () => void;
	open: boolean;
}

export function ActionConfirmationDialog({
	action,
	resources,
	onConfirm,
	onCancel,
	open
}: ConfirmationDialogProps) {
	const [confirmationText, setConfirmationText] = useState('');
	const [isConfirming, setIsConfirming] = useState(false);

	const isDestructive = ['delete-pod', 'delete-deployment', 'delete-service'].includes(action);
	const confirmationRequired = isDestructive && resources.length > 1;
	const expectedConfirmation = confirmationRequired ? `DELETE ${resources.length} RESOURCES` : '';

	const getActionIcon = () => {
		if (action.includes('delete')) return <Trash2 className="h-4 w-4 text-red-500" />;
		if (action.includes('restart')) return <RotateCcw className="h-4 w-4 text-blue-500" />;
		return <Power className="h-4 w-4 text-orange-500" />;
	};

	const getActionColor = () => {
		if (action.includes('delete')) return 'destructive';
		if (action.includes('restart')) return 'default';
		return 'secondary';
	};

	const handleConfirm = async () => {
		setIsConfirming(true);
		try {
			onConfirm(confirmationRequired ? confirmationText : undefined);
		} finally {
			setIsConfirming(false);
			setConfirmationText('');
		}
	};

	const canConfirm = !confirmationRequired || confirmationText === expectedConfirmation;

	return (
		<AlertDialog open={open} onOpenChange={(isOpen: boolean) => !isOpen && onCancel()}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle className="flex items-center gap-2">
						{getActionIcon()}
						Confirm {action.replace('-', ' ')}
					</AlertDialogTitle>
					<AlertDialogDescription>
						You are about to <strong>{action.replace('-', ' ')}</strong> the following resources:
						<div className="mt-2 max-h-32 overflow-y-auto bg-muted p-2 rounded text-sm">
							{resources.map((resource, index) => (
								<div key={index} className="font-mono">{resource}</div>
							))}
						</div>
						{isDestructive && (
							<div className="mt-3 p-3 bg-red-50 border border-red-200 rounded">
								<p className="text-red-800 font-medium">⚠️ This action cannot be undone!</p>
							</div>
						)}
					</AlertDialogDescription>
				</AlertDialogHeader>

				{confirmationRequired && (
					<div className="space-y-2">
						<label className="text-sm font-medium">
							Type <code className="bg-muted px-1 rounded">{expectedConfirmation}</code> to confirm:
						</label>
						<Input
							value={confirmationText}
							onChange={(e) => setConfirmationText(e.target.value)}
							placeholder={expectedConfirmation}
							className="font-mono"
						/>
					</div>
				)}

				<AlertDialogFooter>
					<AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
					<AlertDialogAction
						onClick={handleConfirm}
						disabled={!canConfirm || isConfirming}
						variant={getActionColor()}
					>
						{isConfirming ? 'Processing...' : `Confirm ${action.replace('-', ' ')}`}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

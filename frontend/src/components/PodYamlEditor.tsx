import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { IconLoader2 } from '@tabler/icons-react';
import * as yaml from 'js-yaml';

import { Button } from '@/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogTrigger,
} from '@/components/ui/dialog';
import { k8sService } from '@/lib/k8s-service';

// Dynamic import for Monaco Editor (client-side only)
const MonacoEditor = React.lazy(() =>
	import('@monaco-editor/react').then(module => ({
		default: module.Editor
	}))
);

interface PodYamlEditorProps {
	podName: string;
	namespace: string;
	children: React.ReactNode;
}

/**
 * PodYamlEditor component provides a modal with Monaco editor for editing Pod YAML.
 * 
 * API Used: 
 * - GET /api/v1/export/{namespace}/Pod/{name} - Retrieves current Pod YAML
 * - POST /api/v1/namespaces/{namespace}/apply - Updates Pod via YAML apply
 */
export function PodYamlEditor({ podName, namespace, children }: PodYamlEditorProps) {
	const [isOpen, setIsOpen] = useState(false);
	const [yamlContent, setYamlContent] = useState<string>('');
	const [isLoading, setIsLoading] = useState(false);
	const [isSaving, setIsSaving] = useState(false);

	// Load Pod YAML when dialog opens
	useEffect(() => {
		if (isOpen) {
			loadPodYaml();
		}
	}, [isOpen, podName, namespace]);

	const loadPodYaml = async () => {
		setIsLoading(true);
		try {
			// Use the existing export API to get Pod YAML
			const yamlData = await k8sService.exportResource(namespace, 'Pod', podName);

			// Convert the ResourceExport object to YAML format
			const yamlString = convertResourceExportToYaml(yamlData);
			setYamlContent(yamlString);
		} catch (error) {
			console.error('Failed to load Pod YAML:', error);
			toast.error('Failed to load Pod YAML. Please try again.');
		} finally {
			setIsLoading(false);
		}
	};

	const handleSave = async () => {
		if (!yamlContent.trim()) {
			toast.error('YAML content cannot be empty');
			return;
		}

		// Validate YAML syntax before sending
		try {
			yaml.load(yamlContent);
		} catch (error: any) {
			toast.error(`Invalid YAML syntax: ${error.message}`);
			return;
		}

		setIsSaving(true);
		try {
			// Use the existing applyYaml API to update the Pod
			const result = await k8sService.applyYaml(namespace, yamlContent, {
				force: true // Force update to handle conflicts
			});

			if (result.success) {
				toast.success('Pod YAML updated successfully');
				setIsOpen(false);
				// Reset content after successful save
				setYamlContent('');
			} else {
				const errorMessage = result.errors?.join(', ') || 'Unknown error occurred';
				toast.error(`Failed to update Pod YAML: ${errorMessage}`);
			}
		} catch (error: any) {
			console.error('Failed to save Pod YAML:', error);
			const errorMessage = error.message || 'Please check your YAML syntax and try again.';
			toast.error(`Failed to save Pod YAML: ${errorMessage}`);
		} finally {
			setIsSaving(false);
		}
	};

	const handleCancel = () => {
		setIsOpen(false);
		// Reset content when closing without saving
		setYamlContent('');
	};

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				{children}
			</DialogTrigger>
			<DialogContent className="max-w-6xl sm:max-w-6xl h-[80vh] flex flex-col">
				<DialogHeader>
					<DialogTitle>Edit Pod YAML</DialogTitle>
					<DialogDescription className="text-base font-mono text-muted-foreground">
						{podName}
					</DialogDescription>
				</DialogHeader>

				<div className="flex-1 overflow-hidden border rounded-lg">
					{isLoading ? (
						<div className="flex items-center justify-center h-full">
							<IconLoader2 className="h-8 w-8 animate-spin" />
							<span className="ml-2">Loading Pod YAML...</span>
						</div>
					) : (
						<React.Suspense fallback={
							<div className="flex items-center justify-center h-full">
								<IconLoader2 className="h-8 w-8 animate-spin" />
								<span className="ml-2">Loading editor...</span>
							</div>
						}>
							<MonacoEditor
								height="100%"
								defaultLanguage="yaml"
								value={yamlContent}
								onChange={(value: string | undefined) => setYamlContent(value || '')}
								options={{
									minimap: { enabled: false },
									automaticLayout: true,
									scrollBeyondLastLine: false,
									fontSize: 14,
									tabSize: 2,
									wordWrap: 'on',
									lineNumbers: 'on',
									folding: true,
									renderWhitespace: 'boundary',
								}}
								theme="vs-dark"
							/>
						</React.Suspense>
					)}
				</div>

				<DialogFooter className="gap-2">
					<Button
						variant="outline"
						onClick={handleCancel}
						disabled={isSaving}
					>
						Cancel
					</Button>
					<Button
						onClick={handleSave}
						disabled={isLoading || isSaving || !yamlContent.trim()}
					>
						{isSaving ? (
							<>
								<IconLoader2 className="h-4 w-4 animate-spin mr-2" />
								Saving...
							</>
						) : (
							'Save'
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

/**
 * Converts a ResourceExport object to YAML string format
 */
function convertResourceExportToYaml(resourceExport: any): string {
	const yamlObject = {
		apiVersion: resourceExport.apiVersion,
		kind: resourceExport.kind,
		metadata: resourceExport.metadata,
		spec: resourceExport.spec,
		// Include status if available (read-only for reference)
		...(resourceExport.status && { status: resourceExport.status }),
	};

	// Use js-yaml library for proper YAML formatting
	return yaml.dump(yamlObject, {
		indent: 2,
		lineWidth: -1,
		noRefs: true,
		sortKeys: false,
	});
}

"use client"

import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { IconLoader2, IconDotsVertical, IconDownload, IconX, IconFileText, IconEye, IconFileDiff } from '@tabler/icons-react';
import * as yaml from 'js-yaml';

import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useApplyYaml } from '@/hooks/useApplyYaml';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';

// Dynamic import for Monaco Editor (client-side only)
const MonacoEditor = React.lazy(() =>
    import('@monaco-editor/react').then(module => ({
        default: module.Editor
    }))
);
const MonacoDiffEditor = React.lazy(() =>
    import('@monaco-editor/react').then(module => ({
        default: module.DiffEditor
    }))
);

interface ResourceYamlEditorProps {
	resourceName: string;
	namespace: string;
	resourceKind: string;
	children: React.ReactNode;
}

/**
 * Generic ResourceYamlEditor component provides a modal with Monaco editor for editing any Kubernetes resource YAML.
 * 
 * API Used: 
 * - GET /api/v1/export/{namespace}/{kind}/{name} - Retrieves current resource YAML
 * - POST /api/v1/namespaces/{namespace}/apply - Updates resource via YAML apply
 */
export function ResourceYamlEditor({ resourceName, namespace, resourceKind, children }: ResourceYamlEditorProps) {
	const [isOpen, setIsOpen] = useState(false);
    const [yamlContent, setYamlContent] = useState<string>('');
    const [originalYaml, setOriginalYaml] = useState<string>('');
	const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [dryRun, setDryRun] = useState(false);
    const [validate, setValidate] = useState(true);

    // Enhanced apply hook (handles toasts + server-side validation/dry-run)
    const { applyYaml: applyYamlEnhanced, isLoading: isApplying } = useApplyYaml();

    // Store last response for rendering results when dry-run is enabled
    const [lastResponse, setLastResponse] = useState<any | null>(null);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [resultsTab, setResultsTab] = useState<'summary' | 'diff'>('summary');

    // Helper: collect all {old,new} pairs anywhere in a diff object (handles nested shapes like diff.spec.old/new)
    type DiffPair = { old?: any; new?: any; path: string };
    const collectPairs = useCallback((obj: any, base: string = ''): DiffPair[] => {
        const result: DiffPair[] = [];
        if (!obj || typeof obj !== 'object') return result;
        const hasOld = Object.prototype.hasOwnProperty.call(obj, 'old');
        const hasNew = Object.prototype.hasOwnProperty.call(obj, 'new');
        if (hasOld || hasNew) {
            result.push({ old: (obj as any).old, new: (obj as any).new, path: base || '/' });
        }
        for (const key of Object.keys(obj)) {
            const val = (obj as any)[key];
            if (val && typeof val === 'object') {
                const childPath = base ? `${base}.${key}` : key;
                result.push(...collectPairs(val, childPath));
            }
        }
        return result;
    }, []);

    // Monaco theme override to remove blue focus borders and match app borders
    const beforeMount = (monaco: any) => {
        try {
            monaco.editor.defineTheme('kaptn-dark', {
                base: 'vs-dark',
                inherit: true,
                rules: [],
                colors: {
                    focusBorder: '#00000000',
                    contrastBorder: '#00000000',
                    'editorWidget.border': '#00000000',
                    'editor.lineHighlightBorder': '#00000000',
                    'editor.selectionHighlightBorder': '#00000000',
                    'editorOverviewRuler.border': '#00000000',
                    'panel.border': '#00000000',
                    'input.border': '#00000000',
                },
            });
        } catch {
            // no-op if theme define fails
        }
    };

	// Load resource YAML when dialog opens
	const loadResourceYaml = useCallback(async () => {
		setIsLoading(true);
		try {
			let yamlData;

			// For cluster-scoped resources, use the different endpoint
			const clusterScopedResources = ['Namespace', 'Node', 'StorageClass', 'PersistentVolume', 'CSIDriver'];

			if (clusterScopedResources.includes(resourceKind)) {
				// Use the cluster-scoped export API endpoint
				const response = await fetch(`/api/v1/export/${resourceKind}/${resourceName}`);
				if (!response.ok) {
					throw new Error(`HTTP error! status: ${response.status}`);
				}
				yamlData = await response.json();
			} else {
				// Use the existing export API to get resource YAML
				yamlData = await k8sService.exportResource(namespace, resourceKind, resourceName);
			}

			// Convert the ResourceExport object to YAML format
			const yamlString = convertResourceExportToYaml(yamlData);
            setYamlContent(yamlString);
            setOriginalYaml(yamlString);
		} catch (error) {
			console.error(`Failed to load ${resourceKind} YAML:`, error);
			toast.error(`Failed to load ${resourceKind} YAML. Please try again.`);
		} finally {
			setIsLoading(false);
		}
	}, [resourceName, namespace, resourceKind]);

	useEffect(() => {
		if (isOpen) {
			loadResourceYaml();
		}
	}, [isOpen, loadResourceYaml]);

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
            // Use enhanced apply to support validate/dry-run with toasts
            const response = await applyYamlEnhanced(yamlContent, {
                namespace: namespace || undefined,
                dryRun,
                validate,
                force: true,
                showDiff: dryRun || true, // request diffs, especially for dry-run
            });

            // Close only on real apply success; keep open on dry-run for review
            if (response?.success && !dryRun) {
                setIsOpen(false);
                setYamlContent('');
                setLastResponse(null);
            } else if (response) {
                setLastResponse(response);
                setResultsTab('summary');
                setSelectedIndex(0);
            }
        } catch (error: any) {
            // Errors are toasted by the hook; keep for console context
            console.error(`Failed to ${dryRun ? 'dry run' : 'apply'} ${resourceKind} YAML:`, error);
        } finally {
            setIsSaving(false);
        }
    };

    const handleCancel = () => {
        setIsOpen(false);
        // Reset content when closing without saving
        setYamlContent('');
    };

    const handleDownload = () => {
        try {
            const blob = new Blob([yamlContent || ''], { type: 'text/yaml;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            const name = resourceName || 'resource';
            a.href = url;
            a.download = `${name}.yaml`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error('Failed to download YAML', err);
            toast.error('Failed to download YAML');
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                {children}
            </DialogTrigger>
            <DialogContent showCloseButton={false} className="max-w-6xl sm:max-w-6xl h-[80vh] flex flex-col p-0">
                {/* A11y: Hidden title for screen readers to satisfy Dialog a11y contract */}
                <DialogTitle className="sr-only">Edit {resourceKind} YAML — {resourceName}</DialogTitle>
                {/* Titlebar */}
                <div className="flex items-center justify-between px-6 py-3 border-b border-border rounded-t-lg">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <IconFileText className="size-4" />
                        <span className="font-medium text-foreground">Edit {resourceKind} YAML</span>
                        <span className="text-muted-foreground">•</span>
                        <span className="font-mono">{resourceName}</span>
                    </div>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="text-muted-foreground data-[state=open]:bg-muted focus-visible:ring-0 focus-visible:border-transparent"
                            >
                                <IconDotsVertical />
                                <span className="sr-only">Open menu</span>
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuItem onClick={handleDownload}>
                                <IconDownload className="size-4 mr-2" />
                                Download
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => setIsOpen(false)}>
                                <IconX className="size-4 mr-2" />
                                Close
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>

                {/* Editor */}
                <div className="flex-1 px-6 py-3 overflow-hidden">
                    <div className="h-full w-full border border-border rounded-lg overflow-hidden">
                    {isLoading ? (
                        <div className="flex items-center justify-center h-full">
                            <IconLoader2 className="h-8 w-8 animate-spin" />
                            <span className="ml-2">Loading {resourceKind} YAML...</span>
                        </div>
                    ) : (
                        <React.Suspense fallback={
                            <div className="flex items-center justify-center h-full">
                                <IconLoader2 className="h-8 w-8 animate-spin" />
                                <span className="ml-2">Loading editor...</span>
                            </div>
                        }>
                            <MonacoEditor
                                beforeMount={beforeMount}
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
                                    // Remove any editor-side borders/frames for a clean integration
                                    renderLineHighlight: 'line',
                                }}
                                theme="kaptn-dark"
                            />
                        </React.Suspense>
                    )}
                    </div>
                </div>

                {/* Dry run results */}
                {dryRun && lastResponse && (
                    <div className="px-6 pb-3 border-t border-border">
                        <div className="flex items-center justify-between py-3">
                            <div className="flex items-center gap-2">
                                <IconFileDiff className="size-4 text-muted-foreground" />
                                <span className="font-medium">Dry Run Results</span>
                                {lastResponse?.summary && (
                                    <span className="text-sm text-muted-foreground">
                                        {lastResponse.summary.totalResources} resources • {lastResponse.summary.updatedCount} updates • {lastResponse.summary.createdCount} creates
                                    </span>
                                )}
                            </div>
                            <Tabs value={resultsTab} onValueChange={(v) => setResultsTab(v as any)}>
                                <TabsList>
                                    <TabsTrigger value="summary"><IconEye className="size-4" /> Summary</TabsTrigger>
                                    <TabsTrigger value="diff"><IconFileDiff className="size-4" /> Diff</TabsTrigger>
                                </TabsList>
                            </Tabs>
                        </div>

                        <Tabs value={resultsTab} onValueChange={(v) => setResultsTab(v as any)}>
                            <TabsContent value="summary">
                                <div className="rounded-md border border-border overflow-hidden">
                                    {Array.isArray(lastResponse.resources) && lastResponse.resources.length > 0 ? (
                                        <ul className="divide-y divide-border">
                                            {lastResponse.resources.map((res: any, idx: number) => {
                                                const action = String(res.action || '').toLowerCase();
                                                const badgeVariant = action.includes('create')
                                                    ? 'secondary'
                                                    : action.includes('update')
                                                    ? 'default'
                                                    : 'outline';
                                                return (
                                                    <li key={idx} className="flex items-center justify-between px-3 py-2">
                                                        <div className="flex items-center gap-2">
                                                            <Badge variant={badgeVariant as any} className="text-xs capitalize">{res.action || 'unknown'}</Badge>
                                                            <span className="text-sm font-mono">{res.kind}</span>
                                                            <span className="text-sm">{res.namespace ? `${res.namespace}/` : ''}{res.name}</span>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            {Array.isArray(res.links) && res.links.map((l: any, i: number) => (
                                                                <a key={i} href={l.url} className="text-xs text-primary hover:underline">{l.text}</a>
                                                            ))}
                                                            {res.diff && (
                                                                <Button variant="ghost" size="sm" className="h-7 px-2"
                                                                    onClick={() => { setResultsTab('diff'); setSelectedIndex(idx); }}>
                                                                    <IconFileDiff className="size-4 mr-1" /> View Diff
                                                                </Button>
                                                            )}
                                                        </div>
                                                    </li>
                                                )
                                            })}
                                        </ul>
                                    ) : (
                                        <div className="p-4 text-sm text-muted-foreground">No resources in response.</div>
                                    )}
                                </div>
                            </TabsContent>
                            <TabsContent value="diff">
                                {(() => {
                                    const diffObj = lastResponse.resources?.[selectedIndex]?.diff;
                                    const pairs = Array.isArray(diffObj) ? [] : collectPairs(diffObj);
                                    // Prefer a pair that actually changes; otherwise fallback to first; otherwise to editor diff
                                    let best: DiffPair | undefined = pairs.find(p => yaml.dump(p.old ?? {}, { noRefs: true, lineWidth: -1 }) !== yaml.dump(p.new ?? {}, { noRefs: true, lineWidth: -1 }));
                                    if (!best && pairs.length > 0) best = pairs[0];

                                    const hasPair = !!best;
                                    const origStr = hasPair ? yaml.dump(best!.old ?? {}, { noRefs: true, lineWidth: -1 }) : (originalYaml || '');
                                    const modStr = hasPair ? yaml.dump(best!.new ?? {}, { noRefs: true, lineWidth: -1 }) : (yamlContent || '');
                                    if (!hasPair && (!originalYaml || originalYaml === yamlContent)) {
                                        return <div className="p-4 text-sm text-muted-foreground">No diff available for the selected resource.</div>;
                                    }
                                    if (origStr === modStr) {
                                        return <div className="p-4 text-sm text-muted-foreground">No changes detected.</div>;
                                    }
                                    return (
                                        <div className="h-[300px] border border-border rounded-md overflow-hidden">
                                            <React.Suspense fallback={<div className="flex items-center justify-center h-full"><IconLoader2 className="h-5 w-5 animate-spin" /></div>}>
                                                <MonacoDiffEditor
                                                    original={origStr}
                                                    modified={modStr}
                                                    language="yaml"
                                                    options={{
                                                        readOnly: true,
                                                        renderSideBySide: true,
                                                        minimap: { enabled: false },
                                                        automaticLayout: true,
                                                    }}
                                                    theme="kaptn-dark"
                                                />
                                            </React.Suspense>
                                        </div>
                                    );
                                })()}
                                {/* Resource selector */}
                                <div className="mt-2 flex flex-wrap gap-2">
                                    {lastResponse.resources?.map((res: any, idx: number) => (
                                        <Button key={idx} variant={idx === selectedIndex ? 'secondary' : 'outline'} size="sm" className="h-7"
                                            onClick={() => setSelectedIndex(idx)}>
                                            {res.kind} {res.namespace ? `${res.namespace}/` : ''}{res.name}
                                        </Button>
                                    ))}
                                </div>
                            </TabsContent>
                        </Tabs>
                    </div>
                )}

                {/* Footer */}
                <div className="flex items-center justify-between gap-4 px-6 py-3 border-t border-border">
                    {/* Options */}
                    <div className="flex items-center gap-6 text-sm">
                        <div className="flex items-center gap-2">
                            <Switch id="yaml-dry-run" checked={dryRun} onCheckedChange={setDryRun} />
                            <Label htmlFor="yaml-dry-run">Dry Run</Label>
                        </div>
                        <div className="flex items-center gap-2">
                            <Switch id="yaml-validate" checked={validate} onCheckedChange={setValidate} />
                            <Label htmlFor="yaml-validate">Validate</Label>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            onClick={handleCancel}
                            disabled={isSaving || isApplying}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleSave}
                            disabled={isLoading || isSaving || isApplying || !yamlContent.trim()}
                        >
                            {isSaving || isApplying ? (
                                <>
                                    <IconLoader2 className="h-4 w-4 animate-spin mr-2" />
                                    {dryRun ? 'Running Dry Run...' : 'Saving...'}
                                </>
                            ) : (
                                dryRun ? 'Run Dry Run' : 'Save'
                            )}
                        </Button>
                    </div>
                </div>
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

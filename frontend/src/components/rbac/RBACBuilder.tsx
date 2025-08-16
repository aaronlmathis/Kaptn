"use client"

import * as React from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Plus, Trash2, Download, Copy, Play, Save, RotateCcw } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Checkbox } from "@/components/ui/checkbox"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
	Form,
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form"
import { Combobox } from "@/components/ui/combobox"
import { MultiSelectCombobox } from "@/components/ui/multi-select-combobox"

import type {
	RBACPermissionRule,
	Identity,
	Namespace,
	ApiResource,
	ApiGroup
} from "@/types/rbac"
import {
	getIdentities,
	getNamespaces,
	getApiResources,
	generateRBACYAML,
	dryRunRBAC,
	applyRBAC
} from "@/lib/rbac-api"

// Form validation schema
const rbacFormSchema = z.object({
	identityType: z.enum(['User', 'Group']),
	identityName: z.string().min(1, "Identity name is required"),
	scope: z.enum(['Cluster', 'Namespace']),
	namespace: z.string().optional(),
	roleName: z.string().min(1, "Role name is required"),
	permissions: z.array(z.object({
		apiGroups: z.array(z.string()).min(1, "At least one API group is required"),
		resources: z.array(z.string()).min(1, "At least one resource is required"),
		resourceNames: z.array(z.string()).optional(),
		verbs: z.array(z.string()).min(1, "At least one verb is required"),
	})).min(1, "At least one permission rule is required"),
	labels: z.record(z.string()).optional(),
	annotations: z.record(z.string()).optional(),
}).refine((data) => {
	if (data.scope === 'Namespace') {
		return data.namespace && data.namespace.length > 0;
	}
	return true;
}, {
	message: "Namespace is required when scope is Namespace",
	path: ["namespace"],
});

type FormData = z.infer<typeof rbacFormSchema>;

const STORAGE_KEY = 'kaptn-rbac-draft';

export function RBACBuilder() {
	// Form state
	const form = useForm<FormData>({
		resolver: zodResolver(rbacFormSchema),
		defaultValues: {
			identityType: 'User',
			identityName: '',
			scope: 'Namespace',
			namespace: '',
			roleName: '',
			permissions: [{
				apiGroups: [''],
				resources: [],
				resourceNames: [],
				verbs: [],
			}],
			labels: {},
			annotations: {},
		}
	});

	// API data state
	const [identities, setIdentities] = React.useState<Identity[]>([]);
	const [namespaces, setNamespaces] = React.useState<Namespace[]>([]);
	const [apiGroups, setApiGroups] = React.useState<ApiGroup[]>([]);
	const [apiResources, setApiResources] = React.useState<ApiResource[]>([]);

	// Loading states
	const [isLoadingData, setIsLoadingData] = React.useState(true);
	const [isGeneratingYAML, setIsGeneratingYAML] = React.useState(false);
	const [isDryRunning, setIsDryRunning] = React.useState(false);
	const [isApplying, setIsApplying] = React.useState(false);

	// Generated YAML and results
	const [generatedYAML, setGeneratedYAML] = React.useState<{ role: string; binding: string }>({ role: '', binding: '' });
	const [applyResult, setApplyResult] = React.useState<{ success?: boolean; error?: string; message?: string } | null>(null);

	// Watch form values for auto-generating role name
	const watchedValues = form.watch();

	// Load initial data
	React.useEffect(() => {
		const loadData = async () => {
			setIsLoadingData(true);
			try {
				console.log('Loading RBAC form data...');

				const [identitiesData, namespacesData, apiData] = await Promise.all([
					getIdentities().catch(err => {
						console.error('Failed to load identities:', err);
						return [];
					}),
					getNamespaces().catch(err => {
						console.error('Failed to load namespaces:', err);
						return [];
					}),
					getApiResources().catch(err => {
						console.error('Failed to load API resources:', err);
						return { groups: [], resources: [] };
					}),
				]);

				console.log('Raw API responses:', {
					identitiesData,
					namespacesData,
					apiData
				});

				console.log('Loaded data:', {
					identities: identitiesData?.length || 0,
					namespaces: namespacesData?.length || 0,
					apiGroups: apiData?.groups?.length || 0,
					apiResources: apiData?.resources?.length || 0
				});

				// Ensure all data is arrays, fallback to empty arrays
				const safeIdentities = Array.isArray(identitiesData) ? identitiesData : [];
				const safeNamespaces = Array.isArray(namespacesData) ? namespacesData : [];
				const safeApiGroups = Array.isArray(apiData?.groups) ? apiData.groups : [];
				const safeApiResources = Array.isArray(apiData?.resources) ? apiData.resources : [];

				setIdentities(safeIdentities);
				setNamespaces(safeNamespaces);
				setApiGroups(safeApiGroups);
				setApiResources(safeApiResources);
			} catch (error) {
				console.error('Failed to load initial data:', error);
				toast.error('Failed to load form data');
				// Set default empty arrays on error
				setIdentities([]);
				setNamespaces([]);
				setApiGroups([]);
				setApiResources([]);
			} finally {
				setIsLoadingData(false);
			}
		};

		loadData();
	}, []);

	// Load saved draft from localStorage
	React.useEffect(() => {
		const savedDraft = localStorage.getItem(STORAGE_KEY);
		if (savedDraft) {
			try {
				const parsedDraft = JSON.parse(savedDraft);
				form.reset(parsedDraft);
			} catch (error) {
				console.error('Failed to load saved draft:', error);
			}
		}
	}, [form]);

	// Auto-generate role name
	React.useEffect(() => {
		if (watchedValues.identityName && watchedValues.scope) {
			const sanitizedIdentity = watchedValues.identityName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
			const scopePrefix = watchedValues.scope.toLowerCase();
			const namespacePrefix = watchedValues.namespace ? `-${watchedValues.namespace}` : '';
			const autoName = `${scopePrefix}${namespacePrefix}-${sanitizedIdentity}-${watchedValues.identityType.toLowerCase()}`;

			if (form.getValues('roleName') === '' || form.getValues('roleName').startsWith('cluster-') || form.getValues('roleName').startsWith('namespace-')) {
				form.setValue('roleName', autoName);
			}
		}
	}, [watchedValues.identityName, watchedValues.scope, watchedValues.namespace, watchedValues.identityType, form]);

	// Save draft to localStorage
	const saveDraft = React.useCallback(() => {
		const formData = form.getValues();
		localStorage.setItem(STORAGE_KEY, JSON.stringify(formData));
		toast.success('Draft saved');
	}, [form]);

	// Auto-save draft on form changes
	React.useEffect(() => {
		const subscription = form.watch(() => {
			const formData = form.getValues();
			localStorage.setItem(STORAGE_KEY, JSON.stringify(formData));
		});
		return () => subscription.unsubscribe();
	}, [form]);

	// Generate YAML
	const handlePreviewYAML = async () => {
		const isValid = await form.trigger();
		if (!isValid) return;

		setIsGeneratingYAML(true);
		try {
			const formData = form.getValues();
			const yaml = await generateRBACYAML(formData);
			setGeneratedYAML(yaml);
			toast.success('YAML generated successfully');
		} catch (error) {
			console.error('Failed to generate YAML:', error);
			toast.error('Failed to generate YAML');
		} finally {
			setIsGeneratingYAML(false);
		}
	};

	// Copy YAML to clipboard
	const handleCopyYAML = async () => {
		if (!generatedYAML.role && !generatedYAML.binding) {
			toast.error('No YAML to copy');
			return;
		}

		const fullYAML = `${generatedYAML.role}\n---\n${generatedYAML.binding}`;
		await navigator.clipboard.writeText(fullYAML);
		toast.success('YAML copied to clipboard');
	};

	// Download YAML
	const handleDownloadYAML = () => {
		if (!generatedYAML.role && !generatedYAML.binding) {
			toast.error('No YAML to download');
			return;
		}

		const fullYAML = `${generatedYAML.role}\n---\n${generatedYAML.binding}`;
		const blob = new Blob([fullYAML], { type: 'text/yaml' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `${form.getValues('roleName')}-rbac.yaml`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
		toast.success('YAML downloaded');
	};

	// Dry run
	const handleDryRun = async () => {
		const isValid = await form.trigger();
		if (!isValid) return;

		setIsDryRunning(true);
		try {
			const formData = form.getValues();
			const result = await dryRunRBAC(formData);
			setApplyResult(result);
			if (result.success) {
				toast.success('Dry run successful');
			} else {
				toast.error(`Dry run failed: ${result.error}`);
			}
		} catch (error) {
			console.error('Failed to perform dry run:', error);
			toast.error('Failed to perform dry run');
		} finally {
			setIsDryRunning(false);
		}
	};

	// Apply RBAC
	const handleApply = async () => {
		const isValid = await form.trigger();
		if (!isValid) return;

		setIsApplying(true);
		try {
			const formData = form.getValues();
			const result = await applyRBAC(formData);
			setApplyResult(result);
			if (result.success) {
				toast.success('RBAC applied successfully');
				// Clear draft after successful apply
				localStorage.removeItem(STORAGE_KEY);
			} else {
				toast.error(`Apply failed: ${result.error}`);
			}
		} catch (error) {
			console.error('Failed to apply RBAC:', error);
			toast.error('Failed to apply RBAC');
		} finally {
			setIsApplying(false);
		}
	};

	// Reset form
	const handleReset = () => {
		form.reset();
		setGeneratedYAML({ role: '', binding: '' });
		setApplyResult(null);
		localStorage.removeItem(STORAGE_KEY);
		toast.success('Form reset');
	};

	// Add permission rule
	const addPermissionRule = () => {
		const currentPermissions = form.getValues('permissions');
		form.setValue('permissions', [
			...currentPermissions,
			{
				apiGroups: [''],
				resources: [],
				resourceNames: [],
				verbs: [],
			}
		]);
	};

	// Remove permission rule
	const removePermissionRule = (index: number) => {
		const currentPermissions = form.getValues('permissions');
		if (currentPermissions.length > 1) {
			form.setValue('permissions', currentPermissions.filter((_, i) => i !== index));
		}
	};

	if (isLoadingData) {
		return (
			<div className="flex items-center justify-center h-64">
				<div className="text-muted-foreground">Loading form data...</div>
			</div>
		);
	}

	return (
		<div className="container mx-auto px-4 lg:px-6 py-6">
			<div className="grid grid-cols-1 xl:grid-cols-[1fr_400px] gap-8">
				{/* Form Column */}
				<Card className="shadow-sm border-0 ring-1 ring-border">
					<CardHeader className="pb-6 space-y-1">
						<CardTitle className="text-2xl font-semibold tracking-tight">RBAC Configuration</CardTitle>
						<p className="text-sm text-muted-foreground">
							Create role-based access control rules for your Kubernetes cluster
						</p>
					</CardHeader>
					<CardContent className="px-6 pb-6">
						<Form {...form}>
							<form className="space-y-8">
								{/* Identity Section */}
								<div className="space-y-6">
									<div className="flex items-center gap-3 pb-3 border-b border-border/50">
										<div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
											<span className="text-sm font-semibold">1</span>
										</div>
										<div>
											<h3 className="font-semibold text-foreground">Identity</h3>
											<p className="text-sm text-muted-foreground">Define who this permission applies to</p>
										</div>
									</div>

									<div className="grid gap-6">
										<FormField
											control={form.control}
											name="identityType"
											render={({ field }) => (
												<FormItem className="space-y-3">
													<FormLabel className="text-sm font-medium">Identity Type</FormLabel>
													<FormControl>
														<RadioGroup
															value={field.value as string}
															onValueChange={field.onChange}
															className="grid grid-cols-2 gap-4"
														>
															<div className="flex items-center space-x-3 rounded-lg border border-border p-4 hover:bg-accent/50 transition-colors cursor-pointer">
																<RadioGroupItem value="User" id="user" className="text-primary" />
																<Label htmlFor="user" className="font-medium cursor-pointer">User</Label>
															</div>
															<div className="flex items-center space-x-3 rounded-lg border border-border p-4 hover:bg-accent/50 transition-colors cursor-pointer">
																<RadioGroupItem value="Group" id="group" className="text-primary" />
																<Label htmlFor="group" className="font-medium cursor-pointer">Group</Label>
															</div>
														</RadioGroup>
													</FormControl>
													<FormMessage />
												</FormItem>
											)}
										/>

										<FormField
											control={form.control}
											name="identityName"
											render={({ field }) => (
												<FormItem className="space-y-3">
													<FormLabel className="text-sm font-medium">Identity Name</FormLabel>
													<FormControl>
														<Combobox
															options={(identities || []).map(identity => ({
																value: identity.name,
																label: `${identity.name} (${identity.kind})`
															}))}
															value={field.value as string}
															onValueChange={field.onChange}
															placeholder="Select or enter identity name..."
															allowCustom={true}
														/>
													</FormControl>
													<FormDescription className="text-xs">
														Select an existing identity or enter a new one
													</FormDescription>
													<FormMessage />
												</FormItem>
											)}
										/>
									</div>
								</div>

								{/* Scope Section */}
								<div className="space-y-6">
									<div className="flex items-center gap-3 pb-3 border-b border-border/50">
										<div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
											<span className="text-sm font-semibold">2</span>
										</div>
										<div>
											<h3 className="font-semibold text-foreground">Scope</h3>
											<p className="text-sm text-muted-foreground">Define where these permissions apply</p>
										</div>
									</div>

									<div className="grid gap-6">
										<FormField
											control={form.control}
											name="scope"
											render={({ field }) => (
												<FormItem className="space-y-3">
													<FormLabel className="text-sm font-medium">Permission Scope</FormLabel>
													<FormControl>
														<RadioGroup
															value={field.value as string}
															onValueChange={field.onChange}
															className="grid grid-cols-2 gap-4"
														>
															<div className="flex items-center space-x-3 rounded-lg border border-border p-4 hover:bg-accent/50 transition-colors cursor-pointer">
																<RadioGroupItem value="Cluster" id="cluster" className="text-primary" />
																<div className="cursor-pointer">
																	<Label htmlFor="cluster" className="font-medium cursor-pointer">Cluster</Label>
																	<p className="text-xs text-muted-foreground">Entire cluster access</p>
																</div>
															</div>
															<div className="flex items-center space-x-3 rounded-lg border border-border p-4 hover:bg-accent/50 transition-colors cursor-pointer">
																<RadioGroupItem value="Namespace" id="namespace" className="text-primary" />
																<div className="cursor-pointer">
																	<Label htmlFor="namespace" className="font-medium cursor-pointer">Namespace</Label>
																	<p className="text-xs text-muted-foreground">Single namespace access</p>
																</div>
															</div>
														</RadioGroup>
													</FormControl>
													<FormMessage />
												</FormItem>
											)}
										/>

										{watchedValues.scope === 'Namespace' && (
											<FormField
												control={form.control}
												name="namespace"
												render={({ field }) => (
													<FormItem className="space-y-3">
														<FormLabel className="text-sm font-medium">Target Namespace</FormLabel>
														<FormControl>
															<Combobox
																options={(namespaces || []).map(ns => ({
																	value: ns.name,
																	label: ns.name
																}))}
																value={(field.value as string) || ''}
																onValueChange={field.onChange}
																placeholder="Select namespace..."
															/>
														</FormControl>
														<FormMessage />
													</FormItem>
												)}
											/>
										)}
									</div>
								</div>

								{/* Permissions Builder */}
								<div className="space-y-6">
									<div className="flex items-center gap-3 pb-3 border-b border-border/50">
										<div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
											<span className="text-sm font-semibold">3</span>
										</div>
										<div>
											<h3 className="font-semibold text-foreground">Permissions</h3>
											<p className="text-sm text-muted-foreground">Configure what actions are allowed</p>
										</div>
									</div>

									<PermissionsBuilder
										form={form}
										apiGroups={apiGroups}
										apiResources={apiResources}
										addPermissionRule={addPermissionRule}
										removePermissionRule={removePermissionRule}
									/>
								</div>

								{/* Metadata Section */}
								<div className="space-y-6">
									<div className="flex items-center gap-3 pb-3 border-b border-border/50">
										<div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
											<span className="text-sm font-semibold">4</span>
										</div>
										<div>
											<h3 className="font-semibold text-foreground">Metadata</h3>
											<p className="text-sm text-muted-foreground">Role identification and labeling</p>
										</div>
									</div>

									<FormField
										control={form.control}
										name="roleName"
										render={({ field }) => (
											<FormItem className="space-y-3">
												<FormLabel className="text-sm font-medium">Role Name</FormLabel>
												<FormControl>
													<Input
														value={field.value as string}
														onChange={field.onChange}
														placeholder="Enter role name..."
														className="h-10"
													/>
												</FormControl>
												<FormDescription className="text-xs">
													Auto-generated based on identity and scope, but fully editable
												</FormDescription>
												<FormMessage />
											</FormItem>
										)}
									/>
								</div>

								{/* Footer Actions */}
								<div className="flex flex-col sm:flex-row gap-3 pt-6 border-t border-border/50">
									<Button
										type="button"
										onClick={handlePreviewYAML}
										disabled={isGeneratingYAML}
										className="flex-1 sm:flex-none h-10"
									>
										{isGeneratingYAML ? 'Generating...' : 'Preview YAML'}
									</Button>
									<div className="flex gap-2 flex-1 sm:flex-none">
										<Button type="button" variant="outline" onClick={handleReset} className="flex-1 sm:flex-none h-10">
											<RotateCcw className="h-4 w-4 mr-2" />
											Reset
										</Button>
										<Button type="button" variant="outline" onClick={saveDraft} className="flex-1 sm:flex-none h-10">
											<Save className="h-4 w-4 mr-2" />
											Save Draft
										</Button>
									</div>
								</div>
							</form>
						</Form>
					</CardContent>
				</Card>

				{/* Preview Column */}
				<PreviewPanel
					generatedYAML={generatedYAML}
					applyResult={applyResult}
					onCopy={handleCopyYAML}
					onDownload={handleDownloadYAML}
					onDryRun={handleDryRun}
					onApply={handleApply}
					isDryRunning={isDryRunning}
					isApplying={isApplying}
				/>
			</div>
		</div>
	);
}

// Permissions Builder Component
interface PermissionsBuilderProps {
	form: ReturnType<typeof useForm<FormData>>;
	apiGroups: ApiGroup[];
	apiResources: ApiResource[];
	addPermissionRule: () => void;
	removePermissionRule: (index: number) => void;
}

function PermissionsBuilder({
	form,
	apiGroups,
	apiResources,
	addPermissionRule,
	removePermissionRule
}: PermissionsBuilderProps) {
	const permissions = form.watch('permissions') || [];

	// Ensure apiGroups and apiResources are arrays
	const safeApiGroups = Array.isArray(apiGroups) ? apiGroups : [];
	const safeApiResources = Array.isArray(apiResources) ? apiResources : [];

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div className="space-y-1">
					<p className="text-sm font-medium text-foreground">Permission Rules</p>
					<p className="text-xs text-muted-foreground">
						Configure specific API access permissions
					</p>
				</div>
				<Button
					type="button"
					variant="outline"
					size="sm"
					onClick={addPermissionRule}
					className="h-9 px-3"
				>
					<Plus className="h-4 w-4 mr-2" />
					Add Rule
				</Button>
			</div>

			<div className="space-y-4">
				{(permissions || []).map((permission: RBACPermissionRule, index: number) => (
					<Card key={index} className="border border-border/60 shadow-sm">
						<CardContent className="p-6">
							<div className="space-y-6">
								<div className="flex items-center justify-between">
									<div className="flex items-center gap-3">
										<div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-muted-foreground">
											<span className="text-xs font-medium">{index + 1}</span>
										</div>
										<div>
											<span className="text-sm font-medium text-foreground">Permission Rule {index + 1}</span>
											<p className="text-xs text-muted-foreground">Define API group access and verbs</p>
										</div>
									</div>
									{permissions.length > 1 && (
										<Button
											type="button"
											variant="ghost"
											size="sm"
											onClick={() => removePermissionRule(index)}
											className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
										>
											<Trash2 className="h-4 w-4" />
										</Button>
									)}
								</div>

								<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
									<FormField
										control={form.control}
										name={`permissions.${index}.apiGroups`}
										render={({ field }) => (
											<FormItem className="space-y-3">
												<FormLabel className="text-sm font-medium">API Groups</FormLabel>
												<FormControl>
													<MultiSelectCombobox
														options={[
															{ value: '', label: 'Core (empty)' },
															...safeApiGroups.map(group => ({
																value: group.name,
																label: group.name || 'Core'
															}))
														]}
														values={(field.value as string[]) || []}
														onValuesChange={field.onChange}
														placeholder="Select API groups..."
													/>
												</FormControl>
												<FormDescription className="text-xs">
													Choose which API groups to grant access to
												</FormDescription>
												<FormMessage />
											</FormItem>
										)}
									/>

									<FormField
										control={form.control}
										name={`permissions.${index}.resources`}
										render={({ field }) => {
											const selectedApiGroups = form.watch(`permissions.${index}.apiGroups`) || [];
											const filteredResources = safeApiResources.filter(resource =>
												selectedApiGroups.includes(resource.group)
											);

											return (
												<FormItem className="space-y-3">
													<FormLabel className="text-sm font-medium">Resources</FormLabel>
													<FormControl>
														<MultiSelectCombobox
															options={filteredResources.map(resource => ({
																value: resource.name,
																label: resource.name
															}))}
															values={(field.value as string[]) || []}
															onValuesChange={field.onChange}
															placeholder="Select resources..."
														/>
													</FormControl>
													<FormDescription className="text-xs">
														Select specific resources within the API groups
													</FormDescription>
													<FormMessage />
												</FormItem>
											);
										}}
									/>
								</div>

								<FormField
									control={form.control}
									name={`permissions.${index}.resourceNames`}
									render={({ field }) => (
										<FormItem className="space-y-3">
											<FormLabel className="text-sm font-medium">Resource Names (Optional)</FormLabel>
											<FormControl>
												<Input
													placeholder="e.g., my-deployment, my-configmap..."
													value={(field.value as string[])?.join(', ') || ''}
													onChange={(e) => {
														const names = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
														field.onChange(names);
													}}
													className="h-10"
												/>
											</FormControl>
											<FormDescription className="text-xs">
												Comma-separated list of specific resource names to limit access to
											</FormDescription>
											<FormMessage />
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name={`permissions.${index}.verbs`}
									render={({ field }) => (
										<FormItem className="space-y-3">
											<FormLabel className="text-sm font-medium">Allowed Actions (Verbs)</FormLabel>
											<FormControl>
												<VerbsSelector
													selectedVerbs={(field.value as string[]) || []}
													onVerbsChange={field.onChange}
												/>
											</FormControl>
											<FormDescription className="text-xs">
												Select what actions are permitted on the selected resources
											</FormDescription>
											<FormMessage />
										</FormItem>
									)}
								/>
							</div>
						</CardContent>
					</Card>
				))}
			</div>
		</div>
	);
}

// Verbs Selector Component
interface VerbsSelectorProps {
	selectedVerbs: string[];
	onVerbsChange: (verbs: string[]) => void;
}

function VerbsSelector({ selectedVerbs, onVerbsChange }: VerbsSelectorProps) {
	const verbs = ['get', 'list', 'watch', 'create', 'update', 'patch', 'delete', 'deletecollection'];

	const handleVerbChange = (verb: string, checked: boolean) => {
		if (checked) {
			onVerbsChange([...selectedVerbs, verb]);
		} else {
			onVerbsChange(selectedVerbs.filter(v => v !== verb));
		}
	};

	const handleSelectAll = () => {
		onVerbsChange(verbs);
	};

	const handleClearAll = () => {
		onVerbsChange([]);
	};

	return (
		<div className="space-y-4">
			<div className="flex gap-2">
				<Button
					type="button"
					variant="outline"
					size="sm"
					onClick={handleSelectAll}
					className="h-8 px-3 text-xs"
				>
					Select All
				</Button>
				<Button
					type="button"
					variant="outline"
					size="sm"
					onClick={handleClearAll}
					className="h-8 px-3 text-xs"
				>
					Clear All
				</Button>
			</div>
			<div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
				{verbs.map((verb) => (
					<div key={verb} className="flex items-center space-x-3 rounded-lg border border-border p-3 hover:bg-accent/50 transition-colors">
						<Checkbox
							id={verb}
							checked={selectedVerbs.includes(verb)}
							onCheckedChange={(checked) => handleVerbChange(verb, !!checked)}
							className="text-primary"
						/>
						<Label htmlFor={verb} className="text-sm font-medium cursor-pointer flex-1">
							{verb}
						</Label>
					</div>
				))}
			</div>
		</div>
	);
}

// Preview Panel Component
interface PreviewPanelProps {
	generatedYAML: { role: string; binding: string };
	applyResult: { success?: boolean; error?: string; message?: string } | null;
	onCopy: () => void;
	onDownload: () => void;
	onDryRun: () => void;
	onApply: () => void;
	isDryRunning: boolean;
	isApplying: boolean;
}

function PreviewPanel({
	generatedYAML,
	applyResult,
	onCopy,
	onDownload,
	onDryRun,
	onApply,
	isDryRunning,
	isApplying,
}: PreviewPanelProps) {
	const hasYAML = generatedYAML.role || generatedYAML.binding;

	return (
		<Card className="shadow-sm border-0 ring-1 ring-border h-fit sticky top-6">
			<CardHeader className="pb-4 space-y-1">
				<CardTitle className="text-xl font-semibold tracking-tight">Preview & Deploy</CardTitle>
				<p className="text-sm text-muted-foreground">
					Review generated YAML and apply to cluster
				</p>
			</CardHeader>
			<CardContent className="p-6 pt-0 space-y-6">
				<Tabs defaultValue="yaml" className="w-full">
					<TabsList className="grid w-full grid-cols-2 h-9">
						<TabsTrigger value="yaml" className="text-sm">YAML</TabsTrigger>
						<TabsTrigger value="summary" className="text-sm">Summary</TabsTrigger>
					</TabsList>

					<TabsContent value="yaml" className="space-y-4 mt-4">
						{hasYAML ? (
							<div className="space-y-4">
								<div className="relative">
									<pre className="bg-muted/50 border border-border rounded-lg p-4 text-xs overflow-auto max-h-[400px] font-mono leading-relaxed">
										{generatedYAML.role}
										{generatedYAML.role && generatedYAML.binding && '\n---\n'}
										{generatedYAML.binding}
									</pre>
								</div>
								<div className="flex gap-2">
									<Button size="sm" variant="outline" onClick={onCopy} className="flex-1 h-9">
										<Copy className="h-4 w-4 mr-2" />
										Copy
									</Button>
									<Button size="sm" variant="outline" onClick={onDownload} className="flex-1 h-9">
										<Download className="h-4 w-4 mr-2" />
										Download
									</Button>
								</div>
							</div>
						) : (
							<div className="flex flex-col items-center justify-center py-12 text-center border border-dashed border-border rounded-lg">
								<div className="rounded-full bg-muted p-3 mb-4">
									<Copy className="h-6 w-6 text-muted-foreground" />
								</div>
								<p className="text-sm font-medium text-foreground mb-1">No YAML Generated</p>
								<p className="text-xs text-muted-foreground">
									Click "Preview YAML" to generate the configuration
								</p>
							</div>
						)}
					</TabsContent>

					<TabsContent value="summary" className="space-y-4 mt-4">
						<div className="flex flex-col items-center justify-center py-12 text-center border border-dashed border-border rounded-lg">
							<div className="rounded-full bg-muted p-3 mb-4">
								<Play className="h-6 w-6 text-muted-foreground" />
							</div>
							<p className="text-sm font-medium text-foreground mb-1">Summary View</p>
							<p className="text-xs text-muted-foreground">
								Coming soon - visual permission summary
							</p>
						</div>
					</TabsContent>
				</Tabs>

				{hasYAML && (
					<>
						<div className="h-px bg-border" />

						<div className="space-y-4">
							<div className="space-y-3">
								<p className="text-sm font-medium text-foreground">Deployment Actions</p>
								<div className="grid grid-cols-2 gap-2">
									<Button
										onClick={onDryRun}
										disabled={isDryRunning || !hasYAML}
										variant="outline"
										size="sm"
										className="h-9"
									>
										<Play className="h-4 w-4 mr-2" />
										{isDryRunning ? 'Testing...' : 'Dry Run'}
									</Button>
									<Button
										onClick={onApply}
										disabled={isApplying || !hasYAML}
										size="sm"
										className="h-9"
									>
										{isApplying ? 'Applying...' : 'Apply to Cluster'}
									</Button>
								</div>
							</div>

							{applyResult && (
								<Alert className={cn(
									"border-l-4",
									applyResult.success
										? "border-l-green-500 bg-green-50/50 border-green-200"
										: "border-l-red-500 bg-red-50/50 border-red-200"
								)}>
									<AlertDescription className={cn(
										"text-sm",
										applyResult.success ? "text-green-800" : "text-red-800"
									)}>
										{applyResult.success ? (
											applyResult.message || 'Operation completed successfully'
										) : (
											applyResult.error || 'Operation failed'
										)}
									</AlertDescription>
								</Alert>
							)}
						</div>
					</>
				)}
			</CardContent>
		</Card>
	);
}

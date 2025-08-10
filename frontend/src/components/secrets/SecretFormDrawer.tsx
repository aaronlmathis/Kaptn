import * as React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { IconPlus, IconTrash, IconLoader, IconShieldLock, IconChevronDown } from "@tabler/icons-react"
import { useIsMobile } from "@/hooks/use-mobile"
import {
	Drawer,
	DrawerClose,
	DrawerContent,
	DrawerDescription,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
} from "@/components/ui/drawer"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { createSecret, updateSecret, type DashboardSecret } from "@/lib/k8s-storage"
import { useNamespace } from "@/contexts/namespace-context"

interface SecretFormDrawerProps {
	secret?: DashboardSecret | null
	open: boolean
	onOpenChange: (open: boolean) => void
	onSave?: () => void
}

interface SecretFormData {
	name: string
	namespace: string
	type: string
	data: Array<{ key: string; value: string }>
	labels: Array<{ key: string; value: string }>
	annotations: Array<{ key: string; value: string }>
}

const SECRET_TYPES = [
	{ value: 'Opaque', label: 'Opaque', description: 'Generic secret for arbitrary data' },
	{ value: 'kubernetes.io/tls', label: 'TLS', description: 'TLS certificate and key' },
	{ value: 'kubernetes.io/dockerconfigjson', label: 'Docker Config', description: 'Docker registry credentials' },
	{ value: 'kubernetes.io/basic-auth', label: 'Basic Auth', description: 'Username and password' },
	{ value: 'kubernetes.io/ssh-auth', label: 'SSH Auth', description: 'SSH private key' },
	{ value: 'kubernetes.io/service-account-token', label: 'Service Account Token', description: 'Service account token' },
]

/**
 * Form drawer for creating and editing secrets
 */
export function SecretFormDrawer({ secret, open, onOpenChange, onSave }: SecretFormDrawerProps) {
	const isMobile = useIsMobile()
	const { selectedNamespace } = useNamespace()
	const [loading, setLoading] = React.useState(false)
	const [error, setError] = React.useState<string | null>(null)

	// Initialize form data
	const [formData, setFormData] = React.useState<SecretFormData>(() => ({
		name: secret?.name || '',
		namespace: secret?.namespace || (selectedNamespace !== 'all' ? selectedNamespace : 'default'),
		type: secret?.type || 'Opaque',
		data: secret ? secret.keys.map(key => ({ key, value: '' })) : [{ key: '', value: '' }],
		labels: [{ key: '', value: '' }],
		annotations: [{ key: '', value: '' }]
	}))

	// Reset form when secret changes
	React.useEffect(() => {
		if (open) {
			setFormData({
				name: secret?.name || '',
				namespace: secret?.namespace || (selectedNamespace !== 'all' ? selectedNamespace : 'default'),
				type: secret?.type || 'Opaque',
				data: secret ? secret.keys.map(key => ({ key, value: '' })) : [{ key: '', value: '' }],
				labels: [{ key: '', value: '' }],
				annotations: [{ key: '', value: '' }]
			})
			setError(null)
		}
	}, [secret, open, selectedNamespace])

	// Form handlers
	const updateFormData = (field: keyof SecretFormData, value: string | Array<{ key: string; value: string }>) => {
		setFormData(prev => ({ ...prev, [field]: value }))
	}

	const addDataEntry = () => {
		setFormData(prev => ({
			...prev,
			data: [...prev.data, { key: '', value: '' }]
		}))
	}

	const removeDataEntry = (index: number) => {
		setFormData(prev => ({
			...prev,
			data: prev.data.filter((_, i) => i !== index)
		}))
	}

	const updateDataEntry = (index: number, field: 'key' | 'value', value: string) => {
		setFormData(prev => ({
			...prev,
			data: prev.data.map((item, i) =>
				i === index ? { ...item, [field]: value } : item
			)
		}))
	}

	const addLabelEntry = () => {
		setFormData(prev => ({
			...prev,
			labels: [...prev.labels, { key: '', value: '' }]
		}))
	}

	const removeLabelEntry = (index: number) => {
		setFormData(prev => ({
			...prev,
			labels: prev.labels.filter((_, i) => i !== index)
		}))
	}

	const updateLabelEntry = (index: number, field: 'key' | 'value', value: string) => {
		setFormData(prev => ({
			...prev,
			labels: prev.labels.map((item, i) =>
				i === index ? { ...item, [field]: value } : item
			)
		}))
	}

	// Validation
	const isValid = React.useMemo(() => {
		const hasName = formData.name.trim().length > 0
		const hasNamespace = formData.namespace.trim().length > 0
		const hasValidData = formData.data.some(item => item.key.trim().length > 0)

		return hasName && hasNamespace && hasValidData
	}, [formData])

	// Handle form submission
	const handleSubmit = async () => {
		if (!isValid) return

		setLoading(true)
		setError(null)

		try {
			// Prepare the secret data
			const secretData = {
				name: formData.name.trim(),
				namespace: formData.namespace.trim(),
				type: formData.type,
				// Filter out empty data entries and encode values as base64
				data: formData.data
					.filter(item => item.key.trim().length > 0)
					.reduce((acc, item) => {
						acc[item.key.trim()] = btoa(item.value) // Base64 encode
						return acc
					}, {} as Record<string, string>),
				// Filter out empty labels
				labels: formData.labels
					.filter(item => item.key.trim().length > 0 && item.value.trim().length > 0)
					.reduce((acc, item) => {
						acc[item.key.trim()] = item.value.trim()
						return acc
					}, {} as Record<string, string>),
				// Filter out empty annotations
				annotations: formData.annotations
					.filter(item => item.key.trim().length > 0 && item.value.trim().length > 0)
					.reduce((acc, item) => {
						acc[item.key.trim()] = item.value.trim()
						return acc
					}, {} as Record<string, string>)
			}

			if (secret) {
				// Update existing secret
				await updateSecret(formData.namespace, formData.name, secretData)
			} else {
				// Create new secret
				await createSecret(secretData)
			}

			// Success - close drawer and refresh data
			onOpenChange(false)
			onSave?.()
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to save secret')
		} finally {
			setLoading(false)
		}
	}

	const selectedSecretType = SECRET_TYPES.find(t => t.value === formData.type)

	return (
		<Drawer direction={isMobile ? "bottom" : "right"} open={open} onOpenChange={onOpenChange}>
			<DrawerContent className="flex flex-col h-full max-w-2xl">
				{/* Header */}
				<DrawerHeader className="flex justify-between items-start flex-shrink-0">
					<div className="space-y-1">
						<DrawerTitle className="flex items-center gap-2">
							<IconShieldLock className="size-5 text-blue-600" />
							{secret ? `Edit ${secret.name}` : 'Create New Secret'}
						</DrawerTitle>
						<DrawerDescription>
							{secret ? 'Update secret configuration and data' : 'Create a new Kubernetes secret'}
						</DrawerDescription>
					</div>
				</DrawerHeader>

				{/* Form content */}
				<ScrollArea className="flex-1 min-h-0">
					<div className="px-6 space-y-6">
						{error && (
							<div className="text-red-600 text-sm p-3 bg-red-50 rounded border border-red-200">
								{error}
							</div>
						)}

						{/* Basic Information */}
						<div className="space-y-4">
							<h3 className="text-sm font-medium">Basic Information</h3>

							<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
								<div className="space-y-2">
									<Label htmlFor="name">Name *</Label>
									<Input
										id="name"
										value={formData.name}
										onChange={(e) => updateFormData('name', e.target.value)}
										placeholder="my-secret"
										disabled={!!secret} // Can't change name when editing
									/>
								</div>

								<div className="space-y-2">
									<Label htmlFor="namespace">Namespace *</Label>
									<Input
										id="namespace"
										value={formData.namespace}
										onChange={(e) => updateFormData('namespace', e.target.value)}
										placeholder="default"
										disabled={!!secret} // Can't change namespace when editing
									/>
								</div>
							</div>

							<div className="space-y-2">
								<Label htmlFor="type">Type</Label>
								<DropdownMenu>
									<DropdownMenuTrigger asChild>
										<Button
											variant="outline"
											className="w-full justify-between py-3 px-3 h-auto"
											role="combobox"
										>
											<div className="flex flex-col items-start">
												<div className="font-medium">{selectedSecretType?.label || 'Select type'}</div>
												<div className="text-xs text-muted-foreground">{selectedSecretType?.description || 'Choose a secret type'}</div>
											</div>
											<IconChevronDown className="h-4 w-4 opacity-50" />
										</Button>
									</DropdownMenuTrigger>
									<DropdownMenuContent className="w-[--radix-dropdown-menu-trigger-width] min-w-[300px] p-0">
										{SECRET_TYPES.map((type) => (
											<DropdownMenuItem
												key={type.value}
												onClick={() => updateFormData('type', type.value)}
												className="gap-2 p-3 min-h-[60px]"
											>
												<div className="flex flex-col items-start w-full">
													<div className="font-medium">{type.label}</div>
													<div className="text-xs text-muted-foreground">{type.description}</div>
												</div>
											</DropdownMenuItem>
										))}
									</DropdownMenuContent>
								</DropdownMenu>
							</div>
						</div>

						{/* Data Section */}
						<div className="space-y-4">
							<div className="flex items-center justify-between">
								<h3 className="text-sm font-medium">Data Keys *</h3>
								<Button type="button" variant="outline" size="sm" onClick={addDataEntry}>
									<IconPlus className="size-4 mr-2" />
									Add Key
								</Button>
							</div>

							<div className="space-y-3">
								{formData.data.map((item, index) => (
									<div key={index} className="flex gap-2 items-start">
										<div className="flex-1 space-y-2">
											<Input
												placeholder="Key name"
												value={item.key}
												onChange={(e) => updateDataEntry(index, 'key', e.target.value)}
											/>
											<Input
												placeholder="Value (will be base64 encoded automatically)"
												value={item.value}
												onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateDataEntry(index, 'value', e.target.value)}
											/>
										</div>
										{formData.data.length > 1 && (
											<Button
												type="button"
												variant="ghost"
												size="icon"
												onClick={() => removeDataEntry(index)}
												className="text-red-600 hover:text-red-700 mt-1"
											>
												<IconTrash className="size-4" />
											</Button>
										)}
									</div>
								))}
							</div>
						</div>

						{/* Labels Section */}
						<div className="space-y-4">
							<div className="flex items-center justify-between">
								<h3 className="text-sm font-medium">Labels</h3>
								<Button type="button" variant="outline" size="sm" onClick={addLabelEntry}>
									<IconPlus className="size-4 mr-2" />
									Add Label
								</Button>
							</div>

							<div className="space-y-2">
								{formData.labels.map((item, index) => (
									<div key={index} className="flex gap-2 items-center">
										<Input
											placeholder="Label key"
											value={item.key}
											onChange={(e) => updateLabelEntry(index, 'key', e.target.value)}
											className="flex-1"
										/>
										<Input
											placeholder="Label value"
											value={item.value}
											onChange={(e) => updateLabelEntry(index, 'value', e.target.value)}
											className="flex-1"
										/>
										{formData.labels.length > 1 && (
											<Button
												type="button"
												variant="ghost"
												size="icon"
												onClick={() => removeLabelEntry(index)}
												className="text-red-600 hover:text-red-700"
											>
												<IconTrash className="size-4" />
											</Button>
										)}
									</div>
								))}
							</div>
						</div>

						{/* Type-specific helpers */}
						{formData.type === 'kubernetes.io/tls' && (
							<div className="p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
								<h4 className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-2">TLS Secret Format</h4>
								<p className="text-xs text-blue-700 dark:text-blue-300 mb-2">For TLS secrets, use these standard keys:</p>
								<ul className="text-xs text-blue-700 dark:text-blue-300 space-y-1">
									<li>• <code className="bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200 px-1 rounded">tls.crt</code> - The TLS certificate</li>
									<li>• <code className="bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200 px-1 rounded">tls.key</code> - The private key</li>
								</ul>
							</div>
						)}

						{formData.type === 'kubernetes.io/dockerconfigjson' && (
							<div className="p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
								<h4 className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-2">Docker Config Secret Format</h4>
								<p className="text-xs text-blue-700 dark:text-blue-300 mb-2">Use this key:</p>
								<ul className="text-xs text-blue-700 dark:text-blue-300 space-y-1">
									<li>• <code className="bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200 px-1 rounded">.dockerconfigjson</code> - Docker config JSON</li>
								</ul>
							</div>
						)}

						{formData.type === 'kubernetes.io/basic-auth' && (
							<div className="p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
								<h4 className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-2">Basic Auth Secret Format</h4>
								<p className="text-xs text-blue-700 dark:text-blue-300 mb-2">Use these standard keys:</p>
								<ul className="text-xs text-blue-700 dark:text-blue-300 space-y-1">
									<li>• <code className="bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200 px-1 rounded">username</code> - The username</li>
									<li>• <code className="bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200 px-1 rounded">password</code> - The password</li>
								</ul>
							</div>
						)}
					</div>
					<ScrollBar orientation="vertical" />
				</ScrollArea>

				{/* Footer with actions */}
				<DrawerFooter className="flex flex-col gap-2 px-6 pb-6 pt-4 flex-shrink-0">
					<Button
						onClick={handleSubmit}
						disabled={!isValid || loading}
						className="w-full"
					>
						{loading ? (
							<>
								<IconLoader className="size-4 mr-2 animate-spin" />
								{secret ? 'Updating...' : 'Creating...'}
							</>
						) : (
							<>
								<IconShieldLock className="size-4 mr-2" />
								{secret ? 'Update Secret' : 'Create Secret'}
							</>
						)}
					</Button>
					<DrawerClose asChild>
						<Button variant="outline" size="sm" className="w-full" disabled={loading}>
							Cancel
						</Button>
					</DrawerClose>
				</DrawerFooter>
			</DrawerContent>
		</Drawer>
	)
}

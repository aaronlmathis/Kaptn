import * as React from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { IconEye, IconEyeOff, IconCopy, IconDownload, IconLoader, IconAlertTriangle } from "@tabler/icons-react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { toast } from "sonner"
import { getSecretData, type SecretData } from "@/lib/k8s-storage"

interface SecretValueProps {
	secretKey: string
	namespace: string
	secretName: string
}

// Helper function to copy text to clipboard
const copyToClipboard = async (text: string) => {
	try {
		await navigator.clipboard.writeText(text)
	} catch (err) {
		console.error('Failed to copy text: ', err)
	}
}

// Helper function to detect if data is binary
const isBinary = (data: string): boolean => {
	// Simple heuristic: if it contains null bytes or many non-printable characters
	return data.includes('\0') || data.split('').some(char => {
		const code = char.charCodeAt(0)
		return (code >= 0 && code <= 8) || code === 11 || code === 12 || (code >= 14 && code <= 31) || (code >= 127 && code <= 159)
	})
}

// Helper function to format data size
const formatDataSize = (data: string): string => {
	const bytes = new Blob([data]).size
	if (bytes < 1024) return `${bytes} B`
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Component for displaying and managing individual secret key values
 * Provides secure viewing with reveal/hide functionality
 */
export function SecretValue({ secretKey, namespace, secretName }: SecretValueProps) {
	const [revealed, setRevealed] = React.useState(false)
	const [data, setData] = React.useState<string | null>(null)
	const [loading, setLoading] = React.useState(false)
	const [error, setError] = React.useState<string | null>(null)
	const [isBase64Decoded, setIsBase64Decoded] = React.useState(false)

	// Fetch secret data when revealed
	const fetchSecretData = React.useCallback(async () => {
		if (data !== null) return // Already fetched

		setLoading(true)
		setError(null)

		try {
			const secretData: SecretData = await getSecretData(namespace, secretName, secretKey)
			// The API should return the value for the specified key
			const value = secretData[secretKey] || secretData.value || JSON.stringify(secretData)
			setData(value)
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to fetch secret data')
		} finally {
			setLoading(false)
		}
	}, [namespace, secretName, secretKey, data])

	// Handle copy (works with or without revealing)
	const handleCopy = async () => {
		try {
			// If value is revealed and we have display data, use that (respects base64 decoding)
			if (revealed && displayData) {
				await copyToClipboard(displayData)
				toast.success("Copied to clipboard", {
					description: `Secret key "${secretKey}" value copied`,
					duration: 2000,
				})
				return
			}

			// If already fetched but not revealed, use cached data
			if (data !== null) {
				const processedData = isBase64Decoded && data ? (() => {
					try {
						const base64Pattern = /^[A-Za-z0-9+/]*={0,2}$/
						if (base64Pattern.test(data.replace(/\s/g, ''))) {
							return atob(data)
						}
					} catch {
						// If base64 decode fails, use original
					}
					return data
				})() : data
				await copyToClipboard(processedData || '')
				toast.success("Copied to clipboard", {
					description: `Secret key "${secretKey}" value copied`,
					duration: 2000,
				})
				return
			}

			// Otherwise, fetch the data just for copying
			setLoading(true)
			setError(null)

			try {
				const secretData: SecretData = await getSecretData(namespace, secretName, secretKey)
				const value = secretData[secretKey] || secretData.value || JSON.stringify(secretData)
				await copyToClipboard(value)
				// Cache the data for future use
				setData(value)
				toast.success("Copied to clipboard", {
					description: `Secret key "${secretKey}" value copied`,
					duration: 2000,
				})
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Failed to fetch secret data')
				toast.error("Failed to copy", {
					description: err instanceof Error ? err.message : 'Failed to fetch secret data',
					duration: 3000,
				})
			} finally {
				setLoading(false)
			}
		} catch (copyErr) {
			console.error('Copy failed:', copyErr)
			toast.error("Failed to copy", {
				description: "Could not copy to clipboard",
				duration: 3000,
			})
		}
	}

	// Handle reveal/hide toggle
	const handleToggleReveal = async () => {
		if (!revealed) {
			await fetchSecretData()
		}
		setRevealed(!revealed)
	}

	// Handle base64 decode toggle
	const handleToggleBase64 = () => {
		setIsBase64Decoded(!isBase64Decoded)
	}

	// Process the data for display
	const displayData = React.useMemo(() => {
		if (!data) return null

		let processedData = data

		// Try to decode base64 if requested and data looks like base64
		if (isBase64Decoded) {
			try {
				// Check if it's valid base64
				const base64Pattern = /^[A-Za-z0-9+/]*={0,2}$/
				if (base64Pattern.test(data.replace(/\s/g, ''))) {
					processedData = atob(data)
				}
			} catch {
				// If base64 decode fails, show original data
				processedData = data
			}
		}

		return processedData
	}, [data, isBase64Decoded])

	// Check if data appears to be base64 encoded
	const isLikelyBase64 = React.useMemo(() => {
		if (!data) return false

		// Simple heuristic: base64 strings are typically longer than 10 chars and match pattern
		const base64Pattern = /^[A-Za-z0-9+/]+=*$/
		return data.length > 10 && base64Pattern.test(data.replace(/\s/g, ''))
	}, [data])

	// Check if current display data is binary
	const isBinaryData = React.useMemo(() => {
		if (!displayData) return false
		return isBinary(displayData)
	}, [displayData])

	// Handle download
	const handleDownload = () => {
		if (!displayData) return

		const blob = new Blob([displayData], { type: 'application/octet-stream' })
		const url = URL.createObjectURL(blob)
		const a = document.createElement('a')
		a.href = url
		a.download = `${secretName}-${secretKey}.txt`
		document.body.appendChild(a)
		a.click()
		document.body.removeChild(a)
		URL.revokeObjectURL(url)
	}

	return (
		<div className="border rounded-lg p-4 space-y-3">
			{/* Key header */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					<div className="font-mono text-sm font-medium">{secretKey}</div>
					{data && (
						<Badge variant="outline" className="text-xs">
							{formatDataSize(data)}
						</Badge>
					)}
					{isBinaryData && (
						<Badge variant="outline" className="text-xs text-orange-600">
							Binary
						</Badge>
					)}
				</div>
				<div className="flex items-center gap-1">
					{/* Base64 decode toggle */}
					{isLikelyBase64 && revealed && (
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant="ghost"
									size="icon"
									className="size-6"
									onClick={handleToggleBase64}
								>
									<Badge variant={isBase64Decoded ? "default" : "outline"} className="text-xs">
										B64
									</Badge>
								</Button>
							</TooltipTrigger>
							<TooltipContent>
								{isBase64Decoded ? "Show base64 encoded" : "Decode base64"}
							</TooltipContent>
						</Tooltip>
					)}

					{/* Copy button - always available */}
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant="ghost"
								size="icon"
								className="size-6 text-muted-foreground hover:text-foreground"
								onClick={handleCopy}
								disabled={loading}
							>
								{loading ? (
									<IconLoader className="size-3 animate-spin" />
								) : (
									<IconCopy className="size-3" />
								)}
							</Button>
						</TooltipTrigger>
						<TooltipContent>Copy value</TooltipContent>
					</Tooltip>

					{/* Download button */}
					{revealed && displayData && (
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant="ghost"
									size="icon"
									className="size-6 text-muted-foreground hover:text-foreground"
									onClick={handleDownload}
								>
									<IconDownload className="size-3" />
								</Button>
							</TooltipTrigger>
							<TooltipContent>Download value</TooltipContent>
						</Tooltip>
					)}

					{/* Reveal/hide toggle */}
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant="ghost"
								size="icon"
								className="size-6 text-muted-foreground hover:text-foreground"
								onClick={handleToggleReveal}
								disabled={loading}
							>
								{loading ? (
									<IconLoader className="size-3 animate-spin" />
								) : revealed ? (
									<IconEyeOff className="size-3" />
								) : (
									<IconEye className="size-3" />
								)}
							</Button>
						</TooltipTrigger>
						<TooltipContent>
							{revealed ? "Hide value" : "Reveal value"}
						</TooltipContent>
					</Tooltip>
				</div>
			</div>

			{/* Value display */}
			{revealed && (
				<div className="space-y-2">
					{loading && (
						<div className="flex items-center justify-center py-4 text-muted-foreground">
							<IconLoader className="size-4 animate-spin mr-2" />
							Loading secret data...
						</div>
					)}

					{error && (
						<div className="text-red-600 dark:text-red-400 text-sm flex items-center gap-2 p-2 bg-red-50 dark:bg-red-950/20 rounded border border-red-200 dark:border-red-800">
							<IconAlertTriangle className="size-4" />
							{error}
						</div>
					)}

					{displayData && !loading && !error && (
						<div className="space-y-2">
							{isBinaryData ? (
								<div className="text-sm text-muted-foreground p-3 bg-muted rounded border">
									<div className="flex items-center gap-2 mb-2">
										<IconAlertTriangle className="size-4 text-orange-600 dark:text-orange-400" />
										<span>Binary data detected</span>
									</div>
									<p>This appears to be binary data. Use the download button to save the file.</p>
									<p className="text-xs mt-1">Size: {formatDataSize(displayData)}</p>
								</div>
							) : (
								<div className="relative">
									<pre className="text-xs bg-muted p-3 rounded border overflow-x-auto max-h-48 overflow-y-auto">
										{displayData}
									</pre>
									{displayData.length > 1000 && (
										<div className="text-xs text-muted-foreground mt-1">
											Showing {displayData.length} characters. Use download for full content.
										</div>
									)}
								</div>
							)}
						</div>
					)}
				</div>
			)}

			{/* Hidden state display */}
			{!revealed && (
				<div className="text-sm text-muted-foreground p-3 bg-muted rounded border">
					<div className="flex items-center gap-2">
						<IconEyeOff className="size-4" />
						<span>Secret value hidden for security</span>
					</div>
					<p className="text-xs mt-1">Click the eye icon to reveal the value</p>
				</div>
			)}
		</div>
	)
}

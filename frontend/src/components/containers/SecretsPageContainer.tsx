"use client"

import * as React from "react"
import { SharedProviders } from "@/components/shared-providers"
import { SecretsDataTable } from "@/components/data_tables/SecretsDataTable"
import { SummaryCards, type SummaryCard } from "@/components/SummaryCards"
import { useSecretsWithWebSocket } from "@/hooks/useSecretsWithWebSocket"
import { Badge } from "@/components/ui/badge"
import { IconShieldLock, IconKey, IconDatabase, IconExclamationCircle } from "@tabler/icons-react"

// Helper function to get secret type badge
function getSecretTypeBadge(type: string) {
	switch (type.toLowerCase()) {
		case 'opaque':
			return <Badge variant="secondary" className="text-xs">Opaque</Badge>
		case 'kubernetes.io/tls':
			return <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">TLS</Badge>
		case 'kubernetes.io/dockerconfigjson':
			return <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">Docker</Badge>
		case 'kubernetes.io/service-account-token':
			return <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200">ServiceAccount</Badge>
		case 'kubernetes.io/basic-auth':
			return <Badge variant="outline" className="text-xs bg-orange-50 text-orange-700 border-orange-200">BasicAuth</Badge>
		case 'kubernetes.io/ssh-auth':
			return <Badge variant="outline" className="text-xs bg-indigo-50 text-indigo-700 border-indigo-200">SSH</Badge>
		default:
			return <Badge variant="outline" className="text-xs">{type}</Badge>
	}
}

// Inner component that can access the namespace context
function SecretsContent() {
	const { data: secrets, loading: isLoading, error, isConnected, refetch } = useSecretsWithWebSocket(true)
	const [lastUpdated, setLastUpdated] = React.useState<string | null>(null)

	// Update lastUpdated when secrets change
	React.useEffect(() => {
		if (secrets.length > 0) {
			setLastUpdated(new Date().toISOString())
		}
	}, [secrets])

	// Generate summary cards from secret data
	const summaryData: SummaryCard[] = React.useMemo(() => {
		if (!secrets || secrets.length === 0) {
			return [
				{
					title: "Total Secrets",
					value: 0,
					subtitle: "No secrets found",
					icon: <IconShieldLock className="size-4 text-muted-foreground" />
				},
				{
					title: "Secret Types",
					value: 0,
					subtitle: "No types",
					icon: <IconKey className="size-4 text-muted-foreground" />
				},
				{
					title: "Total Keys",
					value: 0,
					subtitle: "No data keys",
					icon: <IconDatabase className="size-4 text-muted-foreground" />
				},
				{
					title: "Storage Used",
					value: "0 B",
					subtitle: "No data",
					icon: <IconDatabase className="size-4 text-muted-foreground" />
				}
			]
		}

		const totalSecrets = secrets.length

		// Count secrets by type
		const typeCount = new Set(secrets.map(s => s.type)).size
		const opaqueSecrets = secrets.filter(s => s.type === 'Opaque').length
		const tlsSecrets = secrets.filter(s => s.type === 'kubernetes.io/tls').length
		const dockerSecrets = secrets.filter(s => s.type === 'kubernetes.io/dockerconfigjson').length

		// Calculate total data
		const totalKeys = secrets.reduce((sum, s) => sum + s.keysCount, 0)
		const totalDataBytes = secrets.reduce((sum, s) => sum + s.dataSizeBytes, 0)

		// Format total data size
		let totalDataSize: string
		if (totalDataBytes < 1024) {
			totalDataSize = `${totalDataBytes} B`
		} else if (totalDataBytes < 1024 * 1024) {
			totalDataSize = `${(totalDataBytes / 1024).toFixed(1)} KB`
		} else {
			totalDataSize = `${(totalDataBytes / (1024 * 1024)).toFixed(1)} MB`
		}

		// Determine the most common secret type for subtitle
		let mostCommonType = "Mixed types"
		if (opaqueSecrets > 0 && opaqueSecrets === totalSecrets) {
			mostCommonType = "All Opaque"
		} else if (tlsSecrets > 0 && tlsSecrets === totalSecrets) {
			mostCommonType = "All TLS"
		} else if (opaqueSecrets > tlsSecrets && opaqueSecrets > dockerSecrets) {
			mostCommonType = `${opaqueSecrets} Opaque`
		} else if (tlsSecrets > 0) {
			mostCommonType = `${tlsSecrets} TLS`
		}

		return [
			{
				title: "Total Secrets",
				value: totalSecrets,
				subtitle: mostCommonType,
				badge: totalSecrets > 0 ? <Badge variant="secondary" className="text-xs">{totalSecrets}</Badge> : undefined,
				icon: <IconShieldLock className="size-4 text-green-600" />,
				footer: totalSecrets > 0 ? "Secure credential storage" : "No secrets found"
			},
			{
				title: "Secret Types",
				value: typeCount,
				subtitle: typeCount > 1 ? "Multiple types used" : typeCount === 1 ? "Single type" : "No types",
				badge: typeCount > 0 ? getSecretTypeBadge(secrets[0]?.type || 'Opaque') : undefined,
				footer: typeCount > 0 ? "Different credential formats" : "No secret types"
			},
			{
				title: "Total Keys",
				value: totalKeys,
				subtitle: totalKeys > 0 ? `${(totalKeys / totalSecrets).toFixed(1)} avg per secret` : "No data keys",
				badge: totalKeys > 10 ? <Badge variant="outline" className="text-xs text-blue-600">High</Badge> :
					totalKeys > 5 ? <Badge variant="outline" className="text-xs text-green-600">Medium</Badge> :
						totalKeys > 0 ? <Badge variant="outline" className="text-xs text-gray-600">Low</Badge> : undefined,
				icon: <IconKey className="size-4 text-blue-600" />,
				footer: totalKeys > 0 ? "Individual data entries" : "No data keys"
			},
			{
				title: "Storage Used",
				value: totalDataSize,
				subtitle: totalSecrets > 0 ? `${(totalDataBytes / totalSecrets / 1024).toFixed(1)} KB avg` : "No data",
				badge: totalDataBytes > 1024 * 1024 ? <Badge variant="outline" className="text-xs text-red-600">Large</Badge> :
					totalDataBytes > 1024 * 10 ? <Badge variant="outline" className="text-xs text-yellow-600">Medium</Badge> :
						totalDataBytes > 0 ? <Badge variant="outline" className="text-xs text-green-600">Small</Badge> : undefined,
				icon: <IconDatabase className="size-4 text-purple-600" />,
				footer: totalDataBytes > 0 ? "Encrypted at rest" : "No data stored"
			}
		]
	}, [secrets])

	return (
		<div className="space-y-6">
			{/* Header with connection status */}
			<div className="px-4 lg:px-6">
				<div className="flex items-center justify-between">
					<div className="space-y-2">
						<div className="flex items-center gap-2">
							<h1 className="text-2xl font-bold tracking-tight">Secrets</h1>
							{isConnected && (
								<div className="flex items-center gap-1.5 text-xs text-green-600">
									<div className="size-2 bg-green-500 rounded-full animate-pulse" />
									Live
								</div>
							)}
						</div>
						<p className="text-muted-foreground">
							Manage and monitor secret resources in your Kubernetes cluster
						</p>
						{/* Security reminder */}
						<div className="flex items-center gap-2 text-sm text-orange-700 dark:text-orange-300 bg-transparent px-4 py-3 rounded-lg border-2 border-orange-400 dark:border-orange-600">
							<IconExclamationCircle className="size-4 text-orange-600 dark:text-orange-400" />
							<span>Secret values are hidden by default for security. Click to reveal individual values.</span>
						</div>
					</div>
					{lastUpdated && typeof window !== 'undefined' && (
						<div className="text-sm text-muted-foreground">
							Last updated: {new Date(lastUpdated).toLocaleTimeString()}
						</div>
					)}
				</div>
			</div>

			{/* Summary Cards */}
			<SummaryCards
				cards={summaryData}
				loading={isLoading}
				error={error}
				lastUpdated={lastUpdated}
			/>

			<SecretsDataTable
				secrets={secrets}
				loading={isLoading}
				error={error}
				refetch={refetch}
				isConnected={isConnected}
			/>
		</div>
	)
}

export function SecretsPageContainer() {
	return (
		<SharedProviders>
			<SecretsContent />
		</SharedProviders>
	)
}

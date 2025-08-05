"use client"

import { Button } from "@/components/ui/button"
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet"
import { Badge } from "@/components/ui/badge"
import { IconX } from "@tabler/icons-react"
import { ResourceYamlEditor } from "@/components/ResourceYamlEditor"
import { useNetworkPolicyDetails } from "@/hooks/use-resource-details"
import { networkPolicySchema } from "@/lib/schemas/networkpolicy"
import { z } from "zod"

interface NetworkPolicyDetailDrawerProps {
	item: z.infer<typeof networkPolicySchema>
	open: boolean
	onOpenChange: (open: boolean) => void
}

export function NetworkPolicyDetailDrawer({
	item,
	open,
	onOpenChange,
}: NetworkPolicyDetailDrawerProps) {
	const { data: details, loading, error } = useNetworkPolicyDetails(
		item.name,
		item.namespace,
		open
	)

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
				<SheetHeader className="pb-6">
					<div className="flex items-center justify-between">
						<div>
							<SheetTitle className="text-xl font-semibold">
								{item.name}
							</SheetTitle>
							<SheetDescription className="flex items-center gap-2 mt-1">
								<Badge variant="outline" className="px-1.5">
									{item.namespace}
								</Badge>
								<span className="text-muted-foreground">Network Policy Details</span>
							</SheetDescription>
						</div>
						<Button
							variant="outline"
							size="icon"
							onClick={() => onOpenChange(false)}
						>
							<IconX className="size-4" />
						</Button>
					</div>
				</SheetHeader>

				{loading && (
					<div className="flex items-center justify-center py-8">
						<div className="text-muted-foreground">Loading details...</div>
					</div>
				)}

				{error && (
					<div className="flex items-center justify-center py-8">
						<div className="text-red-600">Error: {error}</div>
					</div>
				)}

				{details && (
					<div className="space-y-6">
						{/* Basic Information */}
						<div className="grid grid-cols-1 gap-4 p-4 bg-muted/50 rounded-lg">
							<div className="grid grid-cols-2 gap-4">
								<div>
									<div className="text-sm font-medium text-muted-foreground">
										Name
									</div>
									<div className="text-sm">{details.summary.name}</div>
								</div>
								<div>
									<div className="text-sm font-medium text-muted-foreground">
										Namespace
									</div>
									<Badge variant="outline" className="px-1.5">
										{details.summary.namespace}
									</Badge>
								</div>
								<div>
									<div className="text-sm font-medium text-muted-foreground">
										Age
									</div>
									<div className="text-sm font-mono">{details.summary.age}</div>
								</div>
								<div>
									<div className="text-sm font-medium text-muted-foreground">
										Created
									</div>
									<div className="text-sm font-mono">{details.summary.creationTimestamp}</div>
								</div>
							</div>
						</div>

						{/* Pod Selector */}
						<div className="space-y-2">
							<div className="text-sm font-medium">Pod Selector</div>
							<div className="p-3 bg-muted/50 rounded-lg">
								<div className="text-sm font-mono">{details.summary.podSelector}</div>
							</div>
						</div>

						{/* Policy Types */}
						<div className="space-y-2">
							<div className="text-sm font-medium">Policy Types</div>
							<div className="p-3 bg-muted/50 rounded-lg">
								<div className="text-sm">{details.summary.policyTypes}</div>
							</div>
						</div>

						{/* Ingress Rules */}
						<div className="space-y-2">
							<div className="text-sm font-medium">Ingress Rules ({details.summary.ingressRules})</div>
							<div className="p-3 bg-muted/50 rounded-lg">
								<div className="text-sm text-muted-foreground">
									{details.summary.ingressRules > 0 
										? `${details.summary.ingressRules} ingress rule(s) configured`
										: "No ingress rules - all ingress traffic blocked"
									}
								</div>
							</div>
						</div>

						{/* Egress Rules */}
						<div className="space-y-2">
							<div className="text-sm font-medium">Egress Rules ({details.summary.egressRules})</div>
							<div className="p-3 bg-muted/50 rounded-lg">
								<div className="text-sm text-muted-foreground">
									{details.summary.egressRules > 0 
										? `${details.summary.egressRules} egress rule(s) configured`
										: "No egress rules - all egress traffic allowed (if Egress policy type is set)"
									}
								</div>
							</div>
						</div>

						{/* Affected Pods */}
						<div className="space-y-2">
							<div className="text-sm font-medium">Affected Pods ({details.summary.affectedPods})</div>
							<div className="p-3 bg-muted/50 rounded-lg">
								<div className="text-sm text-muted-foreground">
									{details.summary.affectedPods > 0 
										? `${details.summary.affectedPods} pod(s) affected by this policy`
										: "No pods currently affected by this policy"
									}
								</div>
							</div>
						</div>

						{/* Labels */}
						{details.summary.labels && Object.keys(details.summary.labels).length > 0 && (
							<div className="space-y-2">
								<div className="text-sm font-medium">Labels</div>
								<div className="p-3 bg-muted/50 rounded-lg">
									<div className="flex flex-wrap gap-1">
										{Object.entries(details.summary.labels).map(([key, value]) => (
											<Badge key={key} variant="secondary" className="text-xs">
												{key}={value}
											</Badge>
										))}
									</div>
								</div>
							</div>
						)}

						{/* Annotations */}
						{details.summary.annotations && Object.keys(details.summary.annotations).length > 0 && (
							<div className="space-y-2">
								<div className="text-sm font-medium">Annotations</div>
								<div className="p-3 bg-muted/50 rounded-lg">
									<div className="space-y-1">
										{Object.entries(details.summary.annotations).map(([key, value]) => (
											<div key={key} className="text-xs">
												<span className="font-mono text-muted-foreground">{key}:</span>{" "}
												<span className="font-mono">{value}</span>
											</div>
										))}
									</div>
								</div>
							</div>
						)}

						{/* Actions */}
						<div className="flex gap-2 pt-4 border-t">
							<ResourceYamlEditor
								resourceName={item.name}
								namespace={item.namespace}
								resourceKind="NetworkPolicy"
							>
								<Button variant="outline" size="sm">
									Edit YAML
								</Button>
							</ResourceYamlEditor>
						</div>
					</div>
				)}
			</SheetContent>
		</Sheet>
	)
}

"use client"

import * as React from "react"
import { CodeEditor } from "@/components/CodeEditor"
import { RouteGuard } from "@/components/authz"
import { Badge } from "@/components/ui/badge"
import { ShieldCheck, PenSquare, Layers } from "lucide-react"

export function ApplyConfigContainer() {
	return (
		<RouteGuard requiredCapabilities={["services.get", "configmaps.create", "deployments.create"]} requireAll={false}>
			<div className="space-y-6 pb-16 pt-6">
				<div className="px-4 sm:px-6 lg:px-8">
					<div className="rounded-3xl border border-border bg-gradient-to-br from-background via-background to-muted shadow-sm overflow-hidden">
						<div className="px-6 py-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
							<div className="space-y-2">
								<div className="flex flex-wrap items-center gap-2">
									<Badge variant="outline" className="gap-1 border-border text-foreground">
										<PenSquare className="h-4 w-4" /> Apply manifests
									</Badge>
									<Badge variant="outline" className="border-border text-muted-foreground">Supports dry-run and validation</Badge>
									<Badge variant="outline" className="border-border text-muted-foreground">Namespace-aware</Badge>
								</div>
								<div>
									<h1 className="text-xl font-semibold tracking-tight">Configuration workbench</h1>
									<p className="text-sm text-muted-foreground max-w-2xl">
										Compose, validate, diff, and apply Kubernetes manifests from a single workspace. Dry runs, server-side apply, and policy checks are just a toggle away.
									</p>
								</div>
							</div>
							<div className="px-6 pb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
								<div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
									<span className="flex items-center gap-2">
										<ShieldCheck className="h-4 w-4" /> Backend validation, dry-run, diff support
									</span>
									<span className="flex items-center gap-2">
										<Layers className="h-4 w-4" /> Multi-file editing & uploads
									</span>
								</div>
							</div>
						</div>
					</div>

					</div>
				</div>

				<div className="px-4 sm:px-6 lg:px-8">
					<CodeEditor />
				</div>
		</RouteGuard>
	)
}

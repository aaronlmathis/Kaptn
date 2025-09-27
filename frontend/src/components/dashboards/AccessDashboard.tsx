"use client"

import * as React from "react"
import {
	ShieldCheck,
	Users,
	GitBranch,
	Pause,
	RefreshCw,
	MoreVertical,
	AlertTriangle,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Input } from "@/components/ui/input"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SectionHealthFooter } from "@/components/opsview/SectionHealthFooter"
import { MetricBarChart, type ChartSeries } from "@/components/opsview/charts"

import { useRolesWithWebSocket } from "@/hooks/useRolesWithWebSocket"
import { useRoleBindingsWithWebSocket } from "@/hooks/useRoleBindingsWithWebSocket"
import { useClusterRolesWithWebSocket } from "@/hooks/useClusterRolesWithWebSocket"
import { useClusterRoleBindingsWithWebSocket } from "@/hooks/useClusterRoleBindingsWithWebSocket"

const CLUSTER_KEY = "cluster"

interface NamespaceRBACStat {
	namespace: string
	roles: number
	bindings: number
	subjects: number
}

interface BindingSummary {
	label: string
	subjects: number
	roleRef?: string
	scope: "namespace" | "cluster"
}

const toneForCoverage = (value?: number): "ok" | "warn" | "crit" => {
	if (!Number.isFinite(value)) return "ok"
	if (value! >= 0.75) return "ok"
	if (value! >= 0.55) return "warn"
	return "crit"
}

export function AccessDashboard() {
	const rolesResult = useRolesWithWebSocket(true)
	const roleBindingsResult = useRoleBindingsWithWebSocket(true)
	const clusterRolesResult = useClusterRolesWithWebSocket(true)
	const clusterRoleBindingsResult = useClusterRoleBindingsWithWebSocket(true)

	const roles = rolesResult.data ?? []
	const roleBindings = roleBindingsResult.data ?? []
	const clusterRoles = clusterRolesResult.data ?? []
	const clusterRoleBindings = clusterRoleBindingsResult.data ?? []

	const combinedError = rolesResult.error || roleBindingsResult.error || clusterRolesResult.error || clusterRoleBindingsResult.error
	const anyLoading = rolesResult.loading || roleBindingsResult.loading || clusterRolesResult.loading || clusterRoleBindingsResult.loading
	const isConnected = rolesResult.isConnected || roleBindingsResult.isConnected || clusterRolesResult.isConnected || clusterRoleBindingsResult.isConnected

	const [isRefreshing, setRefreshing] = React.useState(false)

	const handleManualRefresh = React.useCallback(async () => {
		setRefreshing(true)
		try {
			await Promise.allSettled([
				rolesResult.refetch(),
				roleBindingsResult.refetch(),
				clusterRolesResult.refetch(),
				clusterRoleBindingsResult.refetch(),
			])
		} finally {
			setRefreshing(false)
		}
	}, [rolesResult, roleBindingsResult, clusterRolesResult, clusterRoleBindingsResult])

	const namespaceStats = React.useMemo<NamespaceRBACStat[]>(() => {
		const map = new Map<string, NamespaceRBACStat>()
		const ensure = (nsRaw?: string) => {
			const ns = nsRaw && nsRaw.length > 0 ? nsRaw : CLUSTER_KEY
			if (!map.has(ns)) {
				map.set(ns, { namespace: ns, roles: 0, bindings: 0, subjects: 0 })
			}
			return map.get(ns)!
		}

		roles.forEach(role => {
			ensure(role.namespace).roles += 1
		})

		roleBindings.forEach(binding => {
			const stat = ensure(binding.namespace)
			stat.bindings += 1
			stat.subjects += binding.subjects ?? 0
		})

		if (clusterRoles.length > 0) {
			ensure(CLUSTER_KEY).roles += clusterRoles.length
		}

		clusterRoleBindings.forEach(binding => {
			const stat = ensure(CLUSTER_KEY)
			stat.bindings += 1
			stat.subjects += binding.subjects ?? 0
		})

		return Array.from(map.values())
	}, [roles, roleBindings, clusterRoles, clusterRoleBindings])

	const roleNamespaces = React.useMemo(() => namespaceStats.filter(stat => stat.roles > 0), [namespaceStats])
	const bindingNamespaces = React.useMemo(() => namespaceStats.filter(stat => stat.bindings > 0), [namespaceStats])

	const coveragePct = React.useMemo(() => {
		if (roleNamespaces.length === 0) return undefined
		return bindingNamespaces.length / roleNamespaces.length
	}, [roleNamespaces.length, bindingNamespaces.length])

	const coverageDisplay = React.useMemo(() => {
		if (!Number.isFinite(coveragePct)) return undefined
		const pct = (coveragePct as number) * 100
		return pct >= 1 ? pct.toFixed(0) : pct.toFixed(1)
	}, [coveragePct])

	const missingNamespaces = React.useMemo(() => namespaceStats.filter(stat => stat.roles > 0 && stat.bindings === 0), [namespaceStats])
	const zeroSubjectBindings = React.useMemo(() => [
		...roleBindings.filter(binding => (binding.subjects ?? 0) === 0).map(binding => ({
			label: `${binding.namespace}/${binding.name}`,
			subjects: binding.subjects ?? 0,
			roleRef: binding.roleRef,
			scope: "namespace" as const,
		})),
		...clusterRoleBindings.filter(binding => (binding.subjects ?? 0) === 0).map(binding => ({
			label: binding.name,
			subjects: binding.subjects ?? 0,
			roleRef: binding.roleRef,
			scope: "cluster" as const,
		})),
	], [roleBindings, clusterRoleBindings])

	const rolesWithoutRules = React.useMemo(() => [
		...roles.filter(role => (role.rules ?? 0) === 0).map(role => `${role.namespace}/${role.name}`),
		...clusterRoles.filter(role => (role.rules ?? 0) === 0).map(role => role.name),
	], [roles, clusterRoles])

	const totalRoles = roles.length + clusterRoles.length
	const totalBindings = roleBindings.length + clusterRoleBindings.length
	const totalSubjects = React.useMemo(() => {
		return roleBindings.reduce((acc, binding) => acc + (binding.subjects ?? 0), 0) +
			clusterRoleBindings.reduce((acc, binding) => acc + (binding.subjects ?? 0), 0)
	}, [roleBindings, clusterRoleBindings])

	const namespaceLeaders = React.useMemo(() => namespaceStats
		.filter(stat => stat.namespace !== CLUSTER_KEY)
		.sort((a, b) => {
			if (b.bindings === a.bindings) return b.roles - a.roles
			return b.bindings - a.bindings
		})
		.slice(0, 8), [namespaceStats])

	const namespaceBindingSeries: ChartSeries[] = React.useMemo(() => {
		const timestamp = Date.now()
		return namespaceLeaders.map((stat, index) => ({
			key: `ns-binding-${index}`,
			name: stat.namespace,
			data: [[timestamp, stat.bindings]],
		}))
	}, [namespaceLeaders])

	const namespaceOverlay = React.useMemo(() => {
		return [
			{
				key: "namespace-roles",
				name: "Roles",
				values: namespaceLeaders.map(stat => ({ name: stat.namespace, value: stat.roles })),
			},
			{
				key: "namespace-subjects",
				name: "Subjects",
				values: namespaceLeaders.map(stat => ({ name: stat.namespace, value: stat.subjects })),
			},
		]
	}, [namespaceLeaders])

	const roleRuleLeaders = React.useMemo(() => {
		return [
			...roles.map(role => ({ label: `${role.namespace}/${role.name}`, rules: role.rules ?? 0 })),
			...clusterRoles.map(role => ({ label: role.name, rules: role.rules ?? 0 })),
		]
			.filter(entry => entry.rules > 0)
			.sort((a, b) => b.rules - a.rules)
			.slice(0, 6)
	}, [roles, clusterRoles])

	const roleRuleSeries: ChartSeries[] = React.useMemo(() => {
		const timestamp = Date.now()
		return roleRuleLeaders.map((role, index) => ({
			key: `role-rule-${index}`,
			name: role.label,
			data: [[timestamp, role.rules]],
		}))
	}, [roleRuleLeaders])

	const bindingLeaders = React.useMemo<BindingSummary[]>(() => {
		return [
			...roleBindings.map(binding => ({
				label: `${binding.namespace}/${binding.name}`,
				subjects: binding.subjects ?? 0,
				roleRef: binding.roleRef,
				scope: "namespace" as const,
			})),
			...clusterRoleBindings.map(binding => ({
				label: binding.name,
				subjects: binding.subjects ?? 0,
				roleRef: binding.roleRef,
				scope: "cluster" as const,
			})),
		]
			.filter(item => item.subjects > 0)
			.sort((a, b) => b.subjects - a.subjects)
			.slice(0, 6)
	}, [roleBindings, clusterRoleBindings])

	const bindingSeries: ChartSeries[] = React.useMemo(() => {
		const timestamp = Date.now()
		return bindingLeaders.map((item, index) => ({
			key: `binding-subjects-${index}`,
			name: item.label,
			data: [[timestamp, item.subjects]],
		}))
	}, [bindingLeaders])

	const issueList = React.useMemo(() => {
		const problems: string[] = []
		if (missingNamespaces.length > 0) {
			problems.push(`${missingNamespaces.length} namespace${missingNamespaces.length === 1 ? "" : "s"} with roles but no bindings`)
		}
		if (zeroSubjectBindings.length > 0) {
			problems.push(`${zeroSubjectBindings.length} binding${zeroSubjectBindings.length === 1 ? "" : "s"} without subjects`)
		}
		if (rolesWithoutRules.length > 0) {
			problems.push(`${rolesWithoutRules.length} role${rolesWithoutRules.length === 1 ? "" : "s"} missing rules`)
		}
		return problems
	}, [missingNamespaces, zeroSubjectBindings.length, rolesWithoutRules.length])

	const coverageTone = toneForCoverage(coveragePct)

	return (
		<div className="space-y-6 pb-16">
			<div className="px-4 lg:px-6">
				<div className="rounded-3xl border border-border bg-gradient-to-br from-background via-background to-muted shadow-sm overflow-hidden">
					<div className="px-6 py-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
						<div className="space-y-2">
							<div className="flex flex-wrap items-center gap-2">
								<Badge variant="outline" className="gap-1 border-border text-foreground">
									<ShieldCheck className="h-4 w-4" /> RBAC overview
								</Badge>
								<Badge variant="outline" className="border-border text-muted-foreground">Cluster + namespace scope</Badge>
								<Badge variant="outline" className={`gap-1 border-border ${isConnected ? "text-green-600" : "text-amber-600"}`}>
									{isConnected ? (
										<>
											<span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" /> Live
										</>
									) : (
										<>
											<span className="h-2 w-2 rounded-full bg-amber-500" /> Paused
										</>
									)}
								</Badge>
							</div>
							<div>
								<h1 className="text-xl font-semibold tracking-tight">Access & RBAC posture</h1>
								<p className="text-sm text-muted-foreground max-w-2xl">
									Track Kubernetes roles, bindings, and subjects at a glance. Live updates arrive via the overview WebSocket so you can catch risky access changes in real time.
								</p>
							</div>
						</div>
						<div className="px-6 pb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
							<div className="flex items-center gap-2">
								<Input className="w-72" placeholder="Search roles, bindings, groups…" disabled />
							</div>
							<div className="flex items-center gap-2">
								<Button size="sm" variant="outline" asChild>
									<a href="/access/rbac">Open RBAC builder</a>
								</Button>
								<Button size="sm" variant="outline" onClick={handleManualRefresh} disabled={isRefreshing}>
									<RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} /> Refresh data
								</Button>
								<DropdownMenu>
									<DropdownMenuTrigger asChild>
										<Button size="sm" variant="outline" className="gap-2">
											<MoreVertical className="h-4 w-4" />
										</Button>
									</DropdownMenuTrigger>
									<DropdownMenuContent align="end">
										<DropdownMenuItem onSelect={handleManualRefresh}>
											Manual refresh
										</DropdownMenuItem>
									</DropdownMenuContent>
								</DropdownMenu>
							</div>
						</div>
					</div>
				</div>
			</div>

			{combinedError && (
				<div className="px-4 lg:px-6">
					<Alert variant="destructive">
						<AlertTitle>Unable to load RBAC data</AlertTitle>
						<AlertDescription>{combinedError}</AlertDescription>
					</Alert>
				</div>
			)}

			<div className="px-4 lg:px-6">
				<div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
					<Card className="border-border">
						<CardHeader className="pb-3">
							<CardTitle className="flex items-center gap-2 text-base">
								<Users className="h-4 w-4 text-muted-foreground" /> Access coverage
							</CardTitle>
						</CardHeader>
						<CardContent>
								<SectionHealthFooter
								tone={coverageTone}
								summary={roleNamespaces.length === 0 ? "No roles detected" : `Bindings cover ${coverageDisplay}% of role namespaces`}
								usedPct={coveragePct}
								ratioPills={[
									{ label: "Namespaces w/roles", value: String(roleNamespaces.length) },
									{ label: "With bindings", value: String(bindingNamespaces.length), tone: coverageTone },
								]}
							>
								Align namespace role definitions with bindings to keep service accounts usable.
							</SectionHealthFooter>
						</CardContent>
					</Card>
					<Card className="border-border">
						<CardHeader className="pb-3">
							<CardTitle className="flex items-center gap-2 text-base">
								<GitBranch className="h-4 w-4 text-muted-foreground" /> Binding inventory
							</CardTitle>
						</CardHeader>
						<CardContent className="space-y-3 text-sm">
							<div className="flex items-center justify-between">
								<span>Total roles</span>
								<Badge variant="outline" className="border-border">{totalRoles}</Badge>
							</div>
							<div className="flex items-center justify-between">
								<span>Total bindings</span>
								<Badge variant="outline" className="border-border">{totalBindings}</Badge>
							</div>
							<div className="flex items-center justify-between">
								<span>Subjects tracked</span>
								<Badge variant="outline" className="border-border">{totalSubjects}</Badge>
							</div>
							<div className="flex items-center gap-2 pt-1">
								<Button asChild variant="link" className="px-0 h-6">
									<a href="/cluster/roles">Roles →</a>
								</Button>
								<Button asChild variant="link" className="px-0 h-6">
									<a href="/cluster/cluster-roles">Cluster roles →</a>
								</Button>
							</div>
						</CardContent>
					</Card>
					<Card className="border-border">
						<CardHeader className="pb-3">
							<CardTitle className="flex items-center gap-2 text-base">
								<AlertTriangle className="h-4 w-4 text-muted-foreground" /> Attention
							</CardTitle>
						</CardHeader>
						<CardContent>
							<SectionHealthFooter
								tone={issueList.length === 0 ? "ok" : issueList.length > 1 ? "warn" : "warn"}
								summary={issueList.length === 0 ? "No outstanding RBAC issues detected" : issueList.join(" · ")}
							>
								Review bindings without subjects and namespaces lacking role coverage.
							</SectionHealthFooter>
						</CardContent>
					</Card>
				</div>
			</div>

			<div className="px-4 lg:px-6 space-y-4">
				<div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
					<MetricBarChart
						title="Namespaces with RBAC activity"
						subtitle="Bindings as the primary bar, roles and subjects as overlays"
						series={namespaceBindingSeries}
						emptyMessage="No namespace RBAC activity"
						className="border-border"
						isLoading={anyLoading && namespaceBindingSeries.length === 0}
						overlaySeries={namespaceOverlay}
						formatter={value => `${value.toFixed(0)}`}
						layout="horizontal"
					/>
					<MetricBarChart
						title="Roles by rule depth"
						subtitle="Top roles sorted by rule count"
						series={roleRuleSeries}
						emptyMessage="No role rule data"
						className="border-border"
						isLoading={anyLoading && roleRuleSeries.length === 0}
						formatter={value => `${value.toFixed(0)} rules`}
					/>
				</div>
				<div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
					<MetricBarChart
						title="Bindings by subjects"
						subtitle="Highest subject fan-out"
						series={bindingSeries}
						emptyMessage="No bindings with subjects"
						className="border-border"
						isLoading={anyLoading && bindingSeries.length === 0}
						formatter={value => `${value.toFixed(0)} subjects`}
					/>
					<Card className="border-border">
						<CardHeader className="pb-3">
							<CardTitle className="text-base flex items-center gap-2">
								<Pause className="h-4 w-4 text-muted-foreground" /> Bindings without subjects
							</CardTitle>
						</CardHeader>
						<CardContent className="space-y-3">
							{zeroSubjectBindings.length === 0 ? (
								<div className="text-sm text-muted-foreground">All bindings reference at least one subject.</div>
							) : (
								<div className="space-y-2">
									{zeroSubjectBindings.slice(0, 6).map(item => (
										<div key={item.label} className="flex flex-col gap-1 border border-border rounded-xl p-3">
											<div className="flex items-center justify-between gap-2">
												<div className="font-medium text-sm truncate">{item.label}</div>
												<Badge variant="outline" className="text-muted-foreground border-border">{item.scope}</Badge>
											</div>
											<div className="text-xs text-muted-foreground truncate">{item.roleRef ?? "(no roleRef)"}</div>
										</div>
									))}
								</div>
							)}
						</CardContent>
					</Card>
				</div>
			</div>
		</div>
	)
}

import * as React from "react"
import {
	IconTrendingDown,
	IconTrendingUp,
	IconAlertTriangle,
	IconCheck,
	IconCube,
	IconNetwork,
	IconServer,
	IconCloudNetwork,
	IconActivity,
	IconShield
} from "@tabler/icons-react"
import { Badge } from "@/components/ui/badge"

// Badge color variants
type BadgeVariant = "healthy" | "warning" | "critical" | "info"

function getBadgeColors(variant: BadgeVariant) {
	switch (variant) {
		case "healthy":
			return "text-green-600 border-border bg-transparent"
		case "warning":
			return "text-yellow-600 border-border bg-transparent"
		case "critical":
			return "text-red-600 border-border bg-transparent"
		case "info":
			return "text-blue-600 border-border bg-transparent"
		default:
			return "text-gray-600 border-border bg-transparent"
	}
}

function createBadge(variant: BadgeVariant, icon: React.ReactNode, text: string) {
	return (
		<Badge variant="outline" className={getBadgeColors(variant)}>
			{icon}
			{text}
		</Badge>
	)
}

// Deployment-specific badges
export function getDeploymentStatusBadge(ready: number, total: number): React.ReactNode {
	if (total === 0) return createBadge("info", <IconCube className="size-3" />, "No Deployments")
	
	const percentage = (ready / total) * 100
	
	if (percentage === 100) {
		return createBadge("healthy", <IconCheck className="size-3" />, "All Ready")
	} else if (percentage >= 80) {
		return createBadge("warning", <IconAlertTriangle className="size-3" />, "Some Issues")
	} else {
		return createBadge("critical", <IconAlertTriangle className="size-3" />, "Critical")
	}
}

export function getReplicaStatusBadge(ready: number, total: number): React.ReactNode {
	if (total === 0) return createBadge("info", <IconActivity className="size-3" />, "No Replicas")
	
	const percentage = (ready / total) * 100
	
	if (percentage >= 95) {
		return createBadge("healthy", <IconCheck className="size-3" />, "Healthy")
	} else if (percentage >= 85) {
		return createBadge("warning", <IconTrendingUp className="size-3" />, "Degraded")
	} else {
		return createBadge("critical", <IconTrendingDown className="size-3" />, "Critical")
	}
}

export function getUpdateStatusBadge(upToDate: number, total: number): React.ReactNode {
	if (total === 0) return createBadge("info", <IconServer className="size-3" />, "N/A")
	
	const percentage = (upToDate / total) * 100
	
	if (percentage === 100) {
		return createBadge("healthy", <IconCheck className="size-3" />, "Current")
	} else if (percentage >= 80) {
		return createBadge("warning", <IconTrendingUp className="size-3" />, "Updating")
	} else {
		return createBadge("critical", <IconAlertTriangle className="size-3" />, "Outdated")
	}
}

// Service-specific badges
export function getServiceStatusBadge(total: number): React.ReactNode {
	if (total === 0) return createBadge("info", <IconNetwork className="size-3" />, "No Services")
	
	if (total >= 20) {
		return createBadge("healthy", <IconCheck className="size-3" />, "Well Connected")
	} else if (total >= 10) {
		return createBadge("info", <IconNetwork className="size-3" />, "Active")
	} else {
		return createBadge("warning", <IconNetwork className="size-3" />, "Minimal")
	}
}

export function getServiceTypeBadge(count: number, total: number, type: "ClusterIP" | "LoadBalancer" | "NodePort"): React.ReactNode {
	if (total === 0) return createBadge("info", <IconNetwork className="size-3" />, "None")
	
	const percentage = (count / total) * 100
	
	switch (type) {
		case "ClusterIP":
			return createBadge("info", <IconShield className="size-3" />, "Internal")
		case "LoadBalancer":
			if (count > 0) {
				return createBadge("healthy", <IconCloudNetwork className="size-3" />, "External Access")
			} else {
				return createBadge("info", <IconCloudNetwork className="size-3" />, "No LB")
			}
		case "NodePort":
			if (count > 0) {
				return createBadge("warning", <IconServer className="size-3" />, "Node Exposed")
			} else {
				return createBadge("info", <IconServer className="size-3" />, "No NodePort")
			}
		default:
			return createBadge("info", <IconNetwork className="size-3" />, "Unknown")
	}
}

// Generic resource icons
export function getResourceIcon(type: "deployments" | "services" | "pods" | "nodes"): React.ReactNode {
	switch (type) {
		case "deployments":
			return <IconCube className="size-4" />
		case "services":
			return <IconNetwork className="size-4" />
		case "pods":
			return <IconActivity className="size-4" />
		case "nodes":
			return <IconServer className="size-4" />
		default:
			return null
	}
}

// Health trend badges (for percentage-based metrics)
export function getHealthTrendBadge(percentage: number, isUpTrend?: boolean): React.ReactNode {
	const trendIcon = isUpTrend !== undefined 
		? (isUpTrend ? <IconTrendingUp className="size-3" /> : <IconTrendingDown className="size-3" />)
		: <IconCheck className="size-3" />
	
	if (percentage >= 90) {
		return createBadge("healthy", trendIcon, "Excellent")
	} else if (percentage >= 75) {
		return createBadge("warning", trendIcon, "Good")
	} else if (percentage >= 50) {
		return createBadge("warning", trendIcon, "Needs Attention")
	} else {
		return createBadge("critical", trendIcon, "Critical")
	}
}

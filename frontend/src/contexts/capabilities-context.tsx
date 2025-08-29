"use client"

import * as React from "react"
import { useAuth } from "./auth-context"
import type { CapabilityKey } from "@/lib/authz"

interface CapabilitiesState {
	capabilities: Record<string, boolean>
	isLoading: boolean
	error: string | null
	lastFetched: number | null
}

interface CapabilitiesContextValue extends CapabilitiesState {
	refetch: () => Promise<void>
	fetchAdditional: (features: string[]) => Promise<void>
	isAllowed: (capability: CapabilityKey) => boolean
	hasAnyCapability: (capabilities: CapabilityKey[]) => boolean
	hasAllCapabilities: (capabilities: CapabilityKey[]) => boolean
}

export type { CapabilitiesContextValue }

const CapabilitiesContext = React.createContext<CapabilitiesContextValue | undefined>(undefined)

export { CapabilitiesContext }

const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes

const DEFAULT_CAPABILITIES = {
	// Dashboard capabilities
	'dashboard.view': true,

	// Pod operations
	'pods.delete': true,
	'pods.logs': true,
	'pods.exec': true,
	'pods.portforward': true,
	'pods.get': true,
	'pods.list': true,
	'pods.watch': true,
	'pods.create': true,
	'pods.update': true,
	'pods.patch': true,
	'pods.attach': true,
	'pods.eviction': true,
	'pods.ephemeralcontainers': true,
	'pods.deletecollection': true,
	'pods.proxy.get': true,
	'pods.proxy.create': true,

	// Deployment operations
	'deployments.restart': true,
	'deployments.delete': true,
	'deployments.get': true,
	'deployments.list': true,
	'deployments.watch': true,
	'deployments.create': true,
	'deployments.update': true,
	'deployments.patch': true,
	'deployments.scale.get': true,
	'deployments.scale.update': true,
	'deployments.scale.patch': true,

	// ConfigMap operations
	'configmaps.edit': true,
	'configmaps.delete': true,
	'configmaps.get': true,
	'configmaps.list': true,
	'configmaps.create': true,
	'configmaps.update': true,
	'configmaps.watch': true,
	'configmaps.patch': true,

	// Secret operations
	'secrets.read': true,
	'secrets.list': true,
	'secrets.create': true,
	'secrets.update': true,
	'secrets.delete': true,
	'secrets.watch': true,
	'secrets.patch': true,

	// Service operations
	'services.get': true,
	'services.list': true,
	'services.create': true,
	'services.update': true,
	'services.delete': true,
	'services.watch': true,
	'services.patch': true,
	'services.proxy.get': true,
	'services.proxy.create': true,

	// StatefulSet operations
	'statefulsets.get': true,
	'statefulsets.list': true,
	'statefulsets.create': true,
	'statefulsets.update': true,
	'statefulsets.delete': true,
	'statefulsets.patch': true,
	'statefulsets.watch': true,
	'statefulsets.scale.get': true,
	'statefulsets.scale.update': true,
	'statefulsets.scale.patch': true,

	// DaemonSet operations
	'daemonsets.get': true,
	'daemonsets.list': true,
	'daemonsets.create': true,
	'daemonsets.update': true,
	'daemonsets.delete': true,
	'daemonsets.patch': true,
	'daemonsets.watch': true,

	// ReplicaSet operations
	'replicasets.get': true,
	'replicasets.list': true,
	'replicasets.create': true,
	'replicasets.update': true,
	'replicasets.delete': true,
	'replicasets.patch': true,
	'replicasets.watch': true,
	'replicasets.scale.get': true,
	'replicasets.scale.update': true,
	'replicasets.scale.patch': true,

	// Job operations
	'jobs.get': true,
	'jobs.list': true,
	'jobs.create': true,
	'jobs.update': true,
	'jobs.delete': true,
	'jobs.patch': true,
	'jobs.watch': true,

	// CronJob operations
	'cronjobs.get': true,
	'cronjobs.list': true,
	'cronjobs.create': true,
	'cronjobs.update': true,
	'cronjobs.delete': true,
	'cronjobs.patch': true,
	'cronjobs.watch': true,

	// Namespace operations
	'namespaces.get': true,
	'namespaces.list': true,
	'namespaces.create': true,
	'namespaces.update': true,
	'namespaces.delete': true,
	'namespaces.patch': true,
	'namespaces.watch': true,
	'namespaces.finalize.update': true,

	// Node operations (cluster-scoped)
	'nodes.get': true,
	'nodes.list': true,
	'nodes.update': true,
	'nodes.patch': true,
	'nodes.shell': true,
	'nodes.proxy.get': true,

	// RBAC operations
	'roles.get': true,
	'roles.list': true,
	'roles.create': true,
	'roles.update': true,
	'roles.delete': true,
	'rolebindings.get': true,
	'rolebindings.list': true,
	'rolebindings.create': true,
	'rolebindings.update': true,
	'rolebindings.delete': true,
	'clusterroles.get': true,
	'clusterroles.list': true,
	'clusterroles.create': true,
	'clusterroles.update': true,
	'clusterroles.delete': true,
	'clusterrolebindings.get': true,
	'clusterrolebindings.list': true,
	'clusterrolebindings.create': true,
	'clusterrolebindings.update': true,
	'clusterrolebindings.delete': true,

	// Event operations
	'events.get': true,
	'events.list': true,
	'events.watch': true,
	'events.create': true,
	'events.v1.get': true,
	'events.v1.list': true,
	'events.v1.watch': true,
	'events.v1.create': true,

	// Persistent Volume operations
	'persistentvolumes.get': true,
	'persistentvolumes.list': true,
	'persistentvolumes.create': true,
	'persistentvolumes.update': true,
	'persistentvolumes.delete': true,
	'persistentvolumes.patch': true,
	'persistentvolumes.watch': true,
	'persistentvolumeclaims.get': true,
	'persistentvolumeclaims.list': true,
	'persistentvolumeclaims.create': true,
	'persistentvolumeclaims.update': true,
	'persistentvolumeclaims.delete': true,
	'persistentvolumeclaims.patch': true,
	'persistentvolumeclaims.watch': true,

	// Storage operations
	'storageclasses.get': true,
	'storageclasses.list': true,
	'storageclasses.create': true,
	'storageclasses.update': true,
	'storageclasses.delete': true,
	'storageclasses.patch': true,
	'storageclasses.watch': true,

	// Ingress operations
	'ingresses.get': true,
	'ingresses.list': true,
	'ingresses.create': true,
	'ingresses.update': true,
	'ingresses.delete': true,
	'ingresses.patch': true,
	'ingresses.watch': true,

	// NetworkPolicy operations
	'networkpolicies.get': true,
	'networkpolicies.list': true,
	'networkpolicies.create': true,
	'networkpolicies.update': true,
	'networkpolicies.delete': true,
	'networkpolicies.patch': true,
	'networkpolicies.watch': true,

	// ReplicationController operations
	'replicationcontrollers.get': true,
	'replicationcontrollers.list': true,
	'replicationcontrollers.create': true,
	'replicationcontrollers.update': true,
	'replicationcontrollers.delete': true,
	'replicationcontrollers.patch': true,
	'replicationcontrollers.watch': true,
	'replicationcontrollers.scale.get': true,
	'replicationcontrollers.scale.update': true,
	'replicationcontrollers.scale.patch': true,

	// HorizontalPodAutoscaler operations
	'horizontalpodautoscalers.get': true,
	'horizontalpodautoscalers.list': true,
	'horizontalpodautoscalers.watch': true,
	'horizontalpodautoscalers.create': true,
	'horizontalpodautoscalers.update': true,
	'horizontalpodautoscalers.patch': true,
	'horizontalpodautoscalers.delete': true,

	// ControllerRevisions
	'controllerrevisions.get': true,
	'controllerrevisions.list': true,
	'controllerrevisions.watch': true,
	'controllerrevisions.create': true,
	'controllerrevisions.update': true,
	'controllerrevisions.patch': true,
	'controllerrevisions.delete': true,

	// PodTemplates
	'podtemplates.get': true,
	'podtemplates.list': true,
	'podtemplates.watch': true,
	'podtemplates.create': true,
	'podtemplates.update': true,
	'podtemplates.patch': true,
	'podtemplates.delete': true,

	// Bindings
	'bindings.create': true,

	// RuntimeClass operations
	'runtimeclasses.get': true,
	'runtimeclasses.list': true,
	'runtimeclasses.watch': true,
	'runtimeclasses.create': true,
	'runtimeclasses.update': true,
	'runtimeclasses.patch': true,
	'runtimeclasses.delete': true,

	// Endpoints operations
	'endpoints.get': true,
	'endpoints.list': true,
	'endpoints.watch': true,
	'endpoints.create': true,
	'endpoints.update': true,
	'endpoints.patch': true,
	'endpoints.delete': true,

	// EndpointSlices operations
	'endpointslices.get': true,
	'endpointslices.list': true,
	'endpointslices.watch': true,
	'endpointslices.create': true,
	'endpointslices.update': true,
	'endpointslices.delete': true,
	'endpointslices.patch': true,

	// ServiceAccount operations
	'serviceaccounts.get': true,
	'serviceaccounts.list': true,
	'serviceaccounts.create': true,
	'serviceaccounts.update': true,
	'serviceaccounts.delete': true,
	'serviceaccounts.patch': true,
	'serviceaccounts.token': true,

	// ResourceQuota operations
	'resourcequotas.get': true,
	'resourcequotas.list': true,
	'resourcequotas.create': true,
	'resourcequotas.update': true,
	'resourcequotas.delete': true,
	'resourcequotas.patch': true,
	'resourcequotas.watch': true,

	// LimitRange operations
	'limitranges.get': true,
	'limitranges.list': true,
	'limitranges.watch': true,

	// IngressClass operations
	'ingressclasses.get': true,
	'ingressclasses.list': true,
	'ingressclasses.watch': true,
	'ingressclasses.create': true,
	'ingressclasses.update': true,
	'ingressclasses.delete': true,
	'ingressclasses.patch': true,

	// Coordination operations
	'leases.get': true,
	'leases.list': true,
	'leases.create': true,
	'leases.update': true,
	'leases.delete': true,
	'leases.patch': true,
	'leases.watch': true,

	// Scheduling operations
	'priorityclasses.get': true,
	'priorityclasses.list': true,
	'priorityclasses.watch': true,
	'priorityclasses.create': true,
	'priorityclasses.update': true,
	'priorityclasses.delete': true,
	'priorityclasses.patch': true,

	// Admission operations
	'mutatingwebhookconfigurations.get': true,
	'mutatingwebhookconfigurations.list': true,
	'mutatingwebhookconfigurations.watch': true,
	'mutatingwebhookconfigurations.create': true,
	'mutatingwebhookconfigurations.update': true,
	'mutatingwebhookconfigurations.delete': true,
	'mutatingwebhookconfigurations.patch': true,
	'validatingwebhookconfigurations.get': true,
	'validatingwebhookconfigurations.list': true,
	'validatingwebhookconfigurations.watch': true,
	'validatingwebhookconfigurations.create': true,
	'validatingwebhookconfigurations.update': true,
	'validatingwebhookconfigurations.delete': true,
	'validatingwebhookconfigurations.patch': true,
	'validatingadmissionpolicies.*': true,
	'validatingadmissionpolicybindings.*': true,

	// CRD operations
	'customresourcedefinitions.get': true,
	'customresourcedefinitions.list': true,
	'customresourcedefinitions.watch': true,
	'customresourcedefinitions.create': true,
	'customresourcedefinitions.update': true,
	'customresourcedefinitions.delete': true,
	'customresourcedefinitions.patch': true,

	// API service operations
	'apiservices.get': true,
	'apiservices.list': true,
	'apiservices.watch': true,
	'apiservices.create': true,
	'apiservices.update': true,
	'apiservices.delete': true,
	'apiservices.patch': true,

	// Certificate operations
	'certificatesigningrequests.get': true,
	'certificatesigningrequests.list': true,
	'certificatesigningrequests.watch': true,
	'certificatesigningrequests.create': true,
	'certificatesigningrequests.update': true,
	'certificatesigningrequests.delete': true,
	'certificatesigningrequests.patch': true,
	'certificatesigningrequests.approval': true,
	'certificatesigningrequests.status': true,

	// Authentication/Authorization review APIs
	'selfsubjectreviews.create': true,
	'tokenreviews.create': true,
	'subjectaccessreviews.create': true,
	'selfsubjectaccessreviews.create': true,
	'selfsubjectrulesreviews.create': true,
	'localsubjectaccessreviews.create': true,

	// Dynamic Resource Allocation
	'resourceclaims.*': true,
	'resourceclaimtemplates.*': true,
	'resourceclasses.*': true,

	// API Priority & Fairness
	'prioritylevelconfigurations.*': true,
	'flowschemas.*': true,

	// Storage: CSI & attachments
	'csidrivers.*': true,
	'csinodes.*': true,
	'csistoragecapacities.*': true,
	'volumeattachments.*': true,

	// Policy: PodDisruptionBudget
	'poddisruptionbudgets.get': true,
	'poddisruptionbudgets.list': true,
	'poddisruptionbudgets.watch': true,
	'poddisruptionbudgets.create': true,
	'poddisruptionbudgets.update': true,
	'poddisruptionbudgets.delete': true,
	'poddisruptionbudgets.patch': true,

	// RBAC special verbs
	'rbac.roles.bind': true,
	'rbac.clusterroles.bind': true,
	'rbac.roles.escalate': true,
	'rbac.clusterroles.escalate': true,

	// Impersonation
	'rbac.impersonate.users': true,
	'rbac.impersonate.groups': true,
	'rbac.impersonate.serviceaccounts': true,
	'rbac.impersonate.userextras.scopes': true,
}

export function CapabilitiesProvider({ children }: { children: React.ReactNode }) {
	const { isAuthenticated, authMode, fetchWithAuth } = useAuth()

	const [state, setState] = React.useState<CapabilitiesState>(() => {
		// During SSR, be conservative: no capabilities and loading state
		if (typeof window === 'undefined') {
			return {
				capabilities: {},
				isLoading: true,
				error: null,
				lastFetched: null,
			}
		}

		// For browser: start in loading state; we'll fetch below.
		return {
			capabilities: {},
			isLoading: true,
			error: null,
			lastFetched: null,
		}
	})

	const fetchCapabilities = React.useCallback(async () => {
		// Skip API calls during SSR/build time
		if (typeof window === 'undefined') {
			return
		}

		// Skip if not authenticated or auth disabled
		if (!isAuthenticated) {
			setState({
				capabilities: {},
				isLoading: false,
				error: null,
				lastFetched: Date.now(),
			})
			return
		}

		// For auth mode 'none', grant all capabilities immediately (no API call needed)
		if (authMode === 'none') {
			setState({
				capabilities: DEFAULT_CAPABILITIES,
				isLoading: false,
				error: null,
				lastFetched: Date.now(),
			})
			return
		}

		setState(prev => ({ ...prev, isLoading: true, error: null }))

		try {
			// Create a smaller, focused request body for faster loading
			// Only request the most commonly needed capabilities initially
			const requestBody = {
				cluster: "default",
				features: [
					// Core viewing capabilities - most pages need these
					'pods.list', 'pods.get', 'deployments.list', 'deployments.get',
					'services.list', 'services.get', 'configmaps.list', 'secrets.list',
					'namespaces.list', 'events.list', 'nodes.list',

					// Basic management capabilities  
					'pods.delete', 'deployments.delete', 'services.delete',
					'pods.logs', 'pods.exec', 'deployments.restart',

					// Dashboard essentials
					'dashboard.view',
				]
			}

			console.log('🔍 Fetching core capabilities (fast load):', requestBody)

			const response = await fetchWithAuth('/api/v1/authz/capabilities', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(requestBody),
			})

			console.log('🔍 Capabilities response status:', response.status, response.statusText)

			if (!response.ok) {
				const errorText = await response.text()
				console.error('🔍 Capabilities error response:', errorText)
				throw new Error(`Failed to fetch capabilities: ${response.statusText} - ${errorText}`)
			}

			const data = await response.json()
			console.log('🔍 Capabilities response data:', data)

			console.log('🔍 Setting capabilities state to:', data.caps || {})
			setState({
				capabilities: data.caps || {},
				isLoading: false,
				error: null,
				lastFetched: Date.now(),
			})
		} catch (error) {
			console.error('🔍 Failed to fetch capabilities:', error)
			setState(prev => ({
				...prev,
				isLoading: false,
				error: error instanceof Error ? error.message : 'Failed to fetch capabilities',
			}))
		}
	}, [isAuthenticated, authMode, fetchWithAuth])

	// Function to load additional capabilities on-demand (for specific pages that need more)
	const fetchAdditionalCapabilities = React.useCallback(async (additionalFeatures: string[]) => {
		if (typeof window === 'undefined' || !isAuthenticated || authMode === 'none') {
			return
		}

		try {
			const requestBody = {
				cluster: "default",
				features: additionalFeatures
			}

			const response = await fetchWithAuth('/api/v1/authz/capabilities', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(requestBody),
			})

			if (response.ok) {
				const data = await response.json()
				setState(prev => ({
					...prev,
					capabilities: { ...prev.capabilities, ...(data.caps || {}) },
					lastFetched: Date.now(),
				}))
			}
		} catch (error) {
			console.warn('Failed to fetch additional capabilities:', error)
		}
	}, [isAuthenticated, authMode, fetchWithAuth])

	// Fetch capabilities on mount and when auth state changes
	React.useEffect(() => {
		fetchCapabilities()
	}, [fetchCapabilities])

	// Auto-refresh capabilities periodically
	React.useEffect(() => {
		if (!isAuthenticated || authMode === 'none') return

		const interval = setInterval(() => {
			const now = Date.now()
			if (state.lastFetched && (now - state.lastFetched) > CACHE_DURATION) {
				fetchCapabilities()
			}
		}, 60_000) // Check every minute

		return () => clearInterval(interval)
	}, [isAuthenticated, authMode, state.lastFetched, fetchCapabilities])

	const isAllowed = React.useCallback((capability: CapabilityKey): boolean => {
		const result = state.capabilities[capability] === true
		console.log(`🔍 Checking capability "${capability}": ${result} (available caps:`, Object.keys(state.capabilities).length, ')')
		return result
	}, [state.capabilities])

	const hasAnyCapability = React.useCallback((capabilities: CapabilityKey[]): boolean => {
		return capabilities.some(capability => isAllowed(capability))
	}, [isAllowed])

	const hasAllCapabilities = React.useCallback((capabilities: CapabilityKey[]): boolean => {
		return capabilities.every(capability => isAllowed(capability))
	}, [isAllowed])

	const contextValue: CapabilitiesContextValue = {
		...state,
		refetch: fetchCapabilities,
		fetchAdditional: fetchAdditionalCapabilities,
		isAllowed,
		hasAnyCapability,
		hasAllCapabilities,
	}

	return (
		<CapabilitiesContext.Provider value={contextValue}>
			{children}
		</CapabilitiesContext.Provider>
	)
}

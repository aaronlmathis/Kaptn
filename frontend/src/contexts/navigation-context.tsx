"use client"

import { createContext, useContext, useState, useEffect } from 'react'
import type { ReactNode } from 'react'

export interface BreadcrumbItem {
	title: string
	url?: string
}

export interface NavigationContextValue {
	currentPath: string
	breadcrumbs: BreadcrumbItem[]
	expandedMenus: Record<string, boolean>
	setMenuExpanded: (menuTitle: string, expanded: boolean) => void
	isMenuExpanded: (menuTitle: string) => boolean
	isHydrated: boolean
}

const NavigationContext = createContext<NavigationContextValue | undefined>(undefined)

interface NavigationProviderProps {
	children: ReactNode
}

// Navigation data mapping paths to breadcrumbs
const navigationMap: Record<string, BreadcrumbItem[]> = {
	'/': [{ title: 'Kubernetes Admin', url: '/' }, { title: 'Dashboard' }],
	'/dashboard': [{ title: 'Kubernetes Admin', url: '/' }, { title: 'Dashboard' }],
	'/pods': [{ title: 'Kubernetes Admin', url: '/' }, { title: 'Workloads', url: '#' }, { title: 'Pods' }],
	'/deployments': [{ title: 'Kubernetes Admin', url: '/' }, { title: 'Workloads', url: '#' }, { title: 'Deployments' }],
	'/replicasets': [{ title: 'Kubernetes Admin', url: '/' }, { title: 'Workloads', url: '#' }, { title: 'ReplicaSets' }],
	'/statefulsets': [{ title: 'Kubernetes Admin', url: '/' }, { title: 'Workloads', url: '#' }, { title: 'StatefulSets' }],
	'/daemonsets': [{ title: 'Kubernetes Admin', url: '/' }, { title: 'Workloads', url: '#' }, { title: 'DaemonSets' }],
	'/jobs': [{ title: 'Kubernetes Admin', url: '/' }, { title: 'Workloads', url: '#' }, { title: 'Jobs' }],
	'/cronjobs': [{ title: 'Kubernetes Admin', url: '/' }, { title: 'Workloads', url: '#' }, { title: 'CronJobs' }],
	'/services': [{ title: 'Kubernetes Admin', url: '/' }, { title: 'Services' }],
	'/endpoints': [{ title: 'Kubernetes Admin', url: '/' }, { title: 'Services', url: '/services' }, { title: 'Endpoints' }],
	'/endpoint-slices': [{ title: 'Kubernetes Admin', url: '/' }, { title: 'Services', url: '/services' }, { title: 'Endpoint Slices' }],
	'/ingresses': [{ title: 'Kubernetes Admin', url: '/' }, { title: 'Services', url: '/services' }, { title: 'Ingresses' }],
	'/network-policies': [{ title: 'Kubernetes Admin', url: '/' }, { title: 'Services', url: '/services' }, { title: 'Network Policies' }],
	'/load-balancers': [{ title: 'Kubernetes Admin', url: '/' }, { title: 'Services', url: '/services' }, { title: 'Load Balancers' }],
	'/configmaps': [{ title: 'Kubernetes Admin', url: '/' }, { title: 'Config & Storage', url: '#' }, { title: 'ConfigMaps' }],
	'/config-maps': [{ title: 'Kubernetes Admin', url: '/' }, { title: 'Config & Storage', url: '#' }, { title: 'ConfigMaps' }],
	'/secrets': [{ title: 'Kubernetes Admin', url: '/' }, { title: 'Config & Storage', url: '#' }, { title: 'Secrets' }],
	'/persistent-volumes': [{ title: 'Kubernetes Admin', url: '/' }, { title: 'Config & Storage', url: '#' }, { title: 'Persistent Volumes' }],
	'/cluster': [{ title: 'Kubernetes Admin', url: '/' }, { title: 'Cluster' }],
	'/cluster/overview': [{ title: 'Kubernetes Admin', url: '/' }, { title: 'Cluster', url: '/cluster' }, { title: 'Overview' }],
	'/cluster/nodes': [{ title: 'Kubernetes Admin', url: '/' }, { title: 'Cluster', url: '/cluster' }, { title: 'Nodes' }],
	'/cluster/namespaces': [{ title: 'Kubernetes Admin', url: '/' }, { title: 'Cluster', url: '/cluster' }, { title: 'Namespaces' }],
	'/rbac': [{ title: 'Kubernetes Admin', url: '/' }, { title: 'Access Control', url: '#' }, { title: 'RBAC' }],
	'/service-accounts': [{ title: 'Kubernetes Admin', url: '/' }, { title: 'Access Control', url: '#' }, { title: 'Service Accounts' }],
	'/metrics': [{ title: 'Kubernetes Admin', url: '/' }, { title: 'Monitoring', url: '#' }, { title: 'Metrics' }],
	'/logs': [{ title: 'Kubernetes Admin', url: '/' }, { title: 'Monitoring', url: '#' }, { title: 'Logs' }],
	'/events': [{ title: 'Kubernetes Admin', url: '/' }, { title: 'Monitoring', url: '#' }, { title: 'Events' }],
}

export function NavigationProvider({ children }: NavigationProviderProps) {
	const [currentPath, setCurrentPath] = useState<string>('/')
	const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([])
	const [expandedMenus, setExpandedMenus] = useState<Record<string, boolean>>({})
	const [isHydrated, setIsHydrated] = useState(false)

	// Helper function to generate breadcrumbs
	const generateBreadcrumbs = (path: string): BreadcrumbItem[] => {
		// First try exact match
		if (navigationMap[path]) {
			return navigationMap[path]
		}

		// Then try to match longer paths that might not be in the map
		// For example, if we have /pods/default/some-pod, we want to show pods breadcrumb
		const pathSegments = path.split('/').filter(Boolean)
		if (pathSegments.length > 0) {
			// Try matching progressively shorter paths
			for (let i = pathSegments.length; i > 0; i--) {
				const testPath = '/' + pathSegments.slice(0, i).join('/')
				if (navigationMap[testPath]) {
					return navigationMap[testPath]
				}
			}
		}

		// Default fallback
		return [
			{ title: 'Kubernetes Admin', url: '/' },
			{ title: 'Dashboard' }
		]
	}

	// Function to determine which menus should be initially expanded based on current path
	const getInitialMenuState = (path: string): Record<string, boolean> => {
		const initialState: Record<string, boolean> = {}

		// Check which main section should be expanded based on path
		if (path.startsWith('/pods') || path.startsWith('/deployments') || path.startsWith('/replicasets') ||
			path.startsWith('/statefulsets') || path.startsWith('/daemonsets') || path.startsWith('/jobs') || path.startsWith('/cronjobs')) {
			initialState['Workloads'] = true
		} else if (path.startsWith('/services') || path.startsWith('/endpoints') || path.startsWith('/endpoint-slices') ||
			path.startsWith('/ingresses') || path.startsWith('/ingress-classes') || path.startsWith('/network-policies') || path.startsWith('/load-balancers')) {
			initialState['Services'] = true
		} else if (path.startsWith('/configmaps') || path.startsWith('/config-maps') || path.startsWith('/secrets') || path.startsWith('/persistent-volumes') ||
			path.startsWith('/persistent-volume-claims') || path.startsWith('/storage-classes') || path.startsWith('/volume-snapshots') ||
			path.startsWith('/volume-snapshot-classes') || path.startsWith('/csi-drivers')) {
			initialState['Config & Storage'] = true
		} else if (path.startsWith('/cluster')) {
			initialState['Cluster'] = true
		} else if (path.startsWith('/rbac') || path.startsWith('/service-accounts') || path.startsWith('/pod-security')) {
			initialState['Access Control'] = true
		} else if (path.startsWith('/metrics') || path.startsWith('/logs') || path.startsWith('/events')) {
			initialState['Monitoring'] = true
		} else if (path.startsWith('/cluster-settings') || path.startsWith('/user-management') || path.startsWith('/api-settings')) {
			initialState['Settings'] = true
		}

		return initialState
	}

	// Load client-side state after hydration
	useEffect(() => {
		if (typeof window !== 'undefined') {
			// Get the actual current path
			const actualPath = window.location.pathname
			setCurrentPath(actualPath)

			// Set correct breadcrumbs immediately
			const correctBreadcrumbs = generateBreadcrumbs(actualPath)
			setBreadcrumbs(correctBreadcrumbs)

			// Clear any old localStorage data since we now determine state based on current path
			localStorage.removeItem('expandedMenus')

			// Always initialize menu state based on current path (ignore saved state on page load)
			const initialState = getInitialMenuState(actualPath)
			setExpandedMenus(initialState)

			setIsHydrated(true)
		}
	}, [])

	// Menu state management functions
	const setMenuExpanded = (menuTitle: string, expanded: boolean) => {
		setExpandedMenus(prev => ({
			...prev,
			[menuTitle]: expanded
		}))
	}

	const isMenuExpanded = (menuTitle: string): boolean => {
		return expandedMenus[menuTitle] ?? false
	}

	// Update breadcrumbs and menu state when path changes (only after hydration)
	useEffect(() => {
		if (isHydrated) {
			const newBreadcrumbs = generateBreadcrumbs(currentPath)
			setBreadcrumbs(newBreadcrumbs)

			// Reset menu state based on new path
			const newMenuState = getInitialMenuState(currentPath)
			setExpandedMenus(newMenuState)
		}
	}, [currentPath, isHydrated])

	// Listen for navigation changes after hydration
	useEffect(() => {
		if (!isHydrated || typeof window === 'undefined') return

		const updatePath = () => {
			const newPath = window.location.pathname
			setCurrentPath(newPath)
		}

		// Listen for navigation changes
		window.addEventListener('popstate', updatePath)

		// Listen for pushstate/replacestate (for SPA navigation)
		const originalPushState = window.history.pushState
		const originalReplaceState = window.history.replaceState

		window.history.pushState = function (...args) {
			originalPushState.apply(window.history, args)
			updatePath()
		}

		window.history.replaceState = function (...args) {
			originalReplaceState.apply(window.history, args)
			updatePath()
		}

		// Also listen for any clicks on links that might change the path
		const handleLinkClick = () => {
			// Use a small timeout to let the browser update the URL first
			setTimeout(updatePath, 10)
		}
		document.addEventListener('click', handleLinkClick)

		return () => {
			window.removeEventListener('popstate', updatePath)
			window.history.pushState = originalPushState
			window.history.replaceState = originalReplaceState
			document.removeEventListener('click', handleLinkClick)
		}
	}, [isHydrated])

	const contextValue: NavigationContextValue = {
		currentPath,
		breadcrumbs,
		expandedMenus,
		setMenuExpanded,
		isMenuExpanded,
		isHydrated,
	}

	return (
		<NavigationContext.Provider value={contextValue}>
			{children}
		</NavigationContext.Provider>
	)
}

export function useNavigation() {
	const context = useContext(NavigationContext)
	if (context === undefined) {
		throw new Error('useNavigation must be used within a NavigationProvider')
	}
	return context
}

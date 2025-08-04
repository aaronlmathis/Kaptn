"use client"

import React, { createContext, useContext, useState, useEffect } from 'react'

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
}

const NavigationContext = createContext<NavigationContextValue | undefined>(undefined)

interface NavigationProviderProps {
	children: React.ReactNode
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
	'/configmaps': [{ title: 'Kubernetes Admin', url: '/' }, { title: 'Config & Storage', url: '#' }, { title: 'ConfigMaps' }],
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
	const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([
		{ title: 'Kubernetes Admin', url: '/' },
		{ title: 'Dashboard' }
	])
	const [expandedMenus, setExpandedMenus] = useState<Record<string, boolean>>({})

	// Load expanded menu state from localStorage
	useEffect(() => {
		if (typeof window !== 'undefined') {
			const savedExpandedMenus = localStorage.getItem('expandedMenus')
			if (savedExpandedMenus) {
				try {
					setExpandedMenus(JSON.parse(savedExpandedMenus))
				} catch (error) {
					console.warn('Failed to parse saved menu state:', error)
				}
			}
		}
	}, [])

	// Save expanded menu state to localStorage
	useEffect(() => {
		if (typeof window !== 'undefined') {
			localStorage.setItem('expandedMenus', JSON.stringify(expandedMenus))
		}
	}, [expandedMenus])

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

	// Generate breadcrumbs based on current URL path
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

	// Update breadcrumbs when path changes
	useEffect(() => {
		const newBreadcrumbs = generateBreadcrumbs(currentPath)
		console.log('Navigation: path changed to', currentPath, 'breadcrumbs:', newBreadcrumbs)
		setBreadcrumbs(newBreadcrumbs)
	}, [currentPath])

	// Initialize with current browser path and listen for changes
	useEffect(() => {
		if (typeof window !== 'undefined') {
			const updatePath = () => {
				const newPath = window.location.pathname
				console.log('Navigation: updating path to', newPath)
				setCurrentPath(newPath)
			}

			// Set initial path immediately
			updatePath()

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
		}
	}, [])

	const contextValue: NavigationContextValue = {
		currentPath,
		breadcrumbs,
		expandedMenus,
		setMenuExpanded,
		isMenuExpanded,
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

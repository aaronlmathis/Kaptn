"use client"

import React, { createContext, useContext, useState, useEffect } from 'react'

export interface BreadcrumbItem {
	title: string
	url?: string
}

export interface NavigationContextValue {
	currentPath: string
	breadcrumbs: BreadcrumbItem[]
	setCurrentPath: (path: string) => void
	setBreadcrumbs: (breadcrumbs: BreadcrumbItem[]) => void
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

	// Update breadcrumbs when path changes
	useEffect(() => {
		const newBreadcrumbs = navigationMap[currentPath] || [
			{ title: 'Kubernetes Admin', url: '/' },
			{ title: 'Dashboard' }
		]
		setBreadcrumbs(newBreadcrumbs)
	}, [currentPath])

	// Initialize with current browser path
	useEffect(() => {
		if (typeof window !== 'undefined') {
			setCurrentPath(window.location.pathname)

			// Listen for navigation changes (for SPA-like behavior)
			const handlePopState = () => {
				setCurrentPath(window.location.pathname)
			}

			window.addEventListener('popstate', handlePopState)
			return () => window.removeEventListener('popstate', handlePopState)
		}
	}, [])

	const contextValue: NavigationContextValue = {
		currentPath,
		breadcrumbs,
		setCurrentPath,
		setBreadcrumbs,
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

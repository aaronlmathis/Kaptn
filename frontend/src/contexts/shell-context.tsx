"use client"

import React, { createContext, useState, useCallback } from 'react'

export interface ShellTab {
	id: string // Generated with crypto.randomUUID()
	podName: string
	containerName: string
	namespace: string
	status: 'connecting' | 'connected' | 'error' | 'closed'
	error?: string
}

export interface ShellContextValue {
	tabs: ShellTab[]
	activeTabId: string | null
	isDrawerOpen: boolean
	openShell: (pod: string, namespace: string, container?: string) => string
	closeShell: (tabId: string) => void
	closeAllShells: () => void
	setActiveTab: (tabId: string) => void
	updateTabStatus: (tabId: string, status: ShellTab['status'], error?: string) => void
	setDrawerOpen: (open: boolean) => void
}

export const ShellContext = createContext<ShellContextValue | undefined>(undefined)

interface ShellProviderProps {
	children: React.ReactNode
}

export function ShellProvider({ children }: ShellProviderProps) {
	const [tabs, setTabs] = useState<ShellTab[]>([])
	const [activeTabId, setActiveTabId] = useState<string | null>(null)
	const [isDrawerOpen, setIsDrawerOpen] = useState(false)

	const openShell = useCallback((pod: string, namespace: string, container?: string) => {
		const tabId = crypto.randomUUID()

		// Default to first container if not specified
		const finalContainer = container || 'main'

		const newTab: ShellTab = {
			id: tabId,
			podName: pod,
			containerName: finalContainer,
			namespace,
			status: 'connecting'
		}

		setTabs(prev => [...prev, newTab])
		setActiveTabId(tabId)
		setIsDrawerOpen(true)

		return tabId
	}, [])

	const closeShell = useCallback((tabId: string) => {
		setTabs(prev => {
			const filtered = prev.filter(tab => tab.id !== tabId)

			// If we're closing the active tab, switch to another tab or close drawer
			if (activeTabId === tabId) {
				if (filtered.length > 0) {
					setActiveTabId(filtered[filtered.length - 1].id)
				} else {
					setActiveTabId(null)
					setIsDrawerOpen(false)
				}
			}

			return filtered
		})
	}, [activeTabId])

	const closeAllShells = useCallback(() => {
		setTabs([])
		setActiveTabId(null)
		setIsDrawerOpen(false)
	}, [])

	const setActiveTab = useCallback((tabId: string) => {
		setActiveTabId(tabId)
	}, [])

	const updateTabStatus = useCallback((tabId: string, status: ShellTab['status'], error?: string) => {
		setTabs(prev => prev.map(tab =>
			tab.id === tabId
				? { ...tab, status, error }
				: tab
		))
	}, [])

	const setDrawerOpen = useCallback((open: boolean) => {
		setIsDrawerOpen(open)
		// If closing drawer, don't clear tabs but deactivate
		if (!open) {
			setActiveTabId(null)
		} else if (tabs.length > 0 && !activeTabId) {
			// If opening drawer and we have tabs but no active tab, activate the last one
			setActiveTabId(tabs[tabs.length - 1].id)
		}
	}, [tabs, activeTabId])

	const contextValue: ShellContextValue = {
		tabs,
		activeTabId,
		isDrawerOpen,
		openShell,
		closeShell,
		closeAllShells,
		setActiveTab,
		updateTabStatus,
		setDrawerOpen,
	}

	return (
		<ShellContext.Provider value={contextValue}>
			{children}
		</ShellContext.Provider>
	)
}

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import React from 'react'
import { ShellProvider } from '@/contexts/shell-context'
import { useShell } from '@/hooks/use-shell'

// Wrapper component for testing
const wrapper = ({ children }: { children: React.ReactNode }) => (
	<ShellProvider>{children}</ShellProvider>
)

describe('useShell hook', () => {
	beforeEach(() => {
		// Mock crypto.randomUUID
		vi.stubGlobal('crypto', {
			randomUUID: vi.fn().mockReturnValue('test-uuid')
		})
	})

	it('should initialize with empty state', () => {
		const { result } = renderHook(() => useShell(), { wrapper })

		expect(result.current.tabs).toEqual([])
		expect(result.current.activeTabId).toBeNull()
		expect(result.current.isDrawerOpen).toBe(false)
	})

	it('should open a new shell tab', () => {
		const { result } = renderHook(() => useShell(), { wrapper })

		act(() => {
			const tabId = result.current.openShell('test-pod', 'default', 'main')
			expect(tabId).toBe('test-uuid')
		})

		expect(result.current.tabs).toHaveLength(1)
		expect(result.current.tabs[0]).toEqual({
			id: 'test-uuid',
			podName: 'test-pod',
			containerName: 'main',
			namespace: 'default',
			status: 'connecting'
		})
		expect(result.current.activeTabId).toBe('test-uuid')
		expect(result.current.isDrawerOpen).toBe(true)
	})

	it('should close a shell tab', () => {
		const { result } = renderHook(() => useShell(), { wrapper })

		let tabId: string
		act(() => {
			tabId = result.current.openShell('test-pod', 'default')
		})

		act(() => {
			result.current.closeShell(tabId)
		})

		expect(result.current.tabs).toHaveLength(0)
		expect(result.current.activeTabId).toBeNull()
		expect(result.current.isDrawerOpen).toBe(false)
	})

	it('should close all shell tabs', () => {
		const { result } = renderHook(() => useShell(), { wrapper })

		act(() => {
			result.current.openShell('pod1', 'default')
			result.current.openShell('pod2', 'default')
		})

		expect(result.current.tabs).toHaveLength(2)

		act(() => {
			result.current.closeAllShells()
		})

		expect(result.current.tabs).toHaveLength(0)
		expect(result.current.activeTabId).toBeNull()
		expect(result.current.isDrawerOpen).toBe(false)
	})

	it('should update tab status', () => {
		const { result } = renderHook(() => useShell(), { wrapper })

		let tabId: string
		act(() => {
			tabId = result.current.openShell('test-pod', 'default')
		})

		act(() => {
			result.current.updateTabStatus(tabId, 'connected')
		})

		expect(result.current.tabs[0].status).toBe('connected')
	})

	it('should update tab status with error', () => {
		const { result } = renderHook(() => useShell(), { wrapper })

		let tabId: string
		act(() => {
			tabId = result.current.openShell('test-pod', 'default')
		})

		act(() => {
			result.current.updateTabStatus(tabId, 'error', 'Connection failed')
		})

		expect(result.current.tabs[0].status).toBe('error')
		expect(result.current.tabs[0].error).toBe('Connection failed')
	})

	it('should set active tab', () => {
		const { result } = renderHook(() => useShell(), { wrapper })

		act(() => {
			result.current.openShell('pod1', 'default')
			result.current.openShell('pod2', 'default')
		})

		const tabs = result.current.tabs
		expect(result.current.activeTabId).toBe(tabs[1].id) // Last opened is active

		act(() => {
			result.current.setActiveTab(tabs[0].id)
		})

		expect(result.current.activeTabId).toBe(tabs[0].id)
	})

	it('should default container to "main" when not specified', () => {
		const { result } = renderHook(() => useShell(), { wrapper })

		act(() => {
			result.current.openShell('test-pod', 'default')
		})

		expect(result.current.tabs[0].containerName).toBe('main')
	})

	it('should use specified container name', () => {
		const { result } = renderHook(() => useShell(), { wrapper })

		act(() => {
			result.current.openShell('test-pod', 'default', 'nginx')
		})

		expect(result.current.tabs[0].containerName).toBe('nginx')
	})
})

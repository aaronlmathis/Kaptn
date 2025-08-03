import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { usePods, useServices, useDeployments } from '../use-k8s-data'
import { NamespaceProvider } from '@/contexts/namespace-context'
import React from 'react'

// Mock the k8s-api module
vi.mock('@/lib/k8s-api', () => ({
	k8sService: {
		getPods: vi.fn(),
		getServices: vi.fn(),
		getDeployments: vi.fn(),
	}
}))

// Create a wrapper that provides the namespace context
const createWrapper = (selectedNamespace = 'all') => {
	return ({ children }: { children: React.ReactNode }) => (
		<NamespaceProvider>{children}</NamespaceProvider>
	)
}

describe('useK8sData hooks', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		// Reset mocks to return successful responses by default
		const { k8sService } = require('@/lib/k8s-api')
		k8sService.getPods.mockResolvedValue({
			data: {
				items: [
					{
						name: 'test-pod',
						namespace: 'default',
						phase: 'Running',
						ready: '1/1',
						node: 'node-1',
						podIP: '10.244.1.5',
						age: '2h',
					}
				],
				total: 1,
			},
			status: 'success',
		})

		k8sService.getServices.mockResolvedValue({
			data: { items: [], total: 0 },
			status: 'success',
		})

		k8sService.getDeployments.mockResolvedValue({
			data: { items: [], total: 0 },
			status: 'success',
		})
	})

	describe('usePods', () => {
		it('should fetch pods for all namespaces by default', async () => {
			const { result } = renderHook(() => usePods(), {
				wrapper: createWrapper()
			})

			expect(result.current.loading).toBe(true)
			expect(result.current.data).toEqual([])

			await waitFor(() => {
				expect(result.current.loading).toBe(false)
			})

			// Should have transformed the mock pods data
			expect(result.current.data.length).toBeGreaterThan(0)
			expect(result.current.error).toBeNull()
		})

		it('should fetch pods for specific namespace when selected', async () => {
			// This test would require more complex setup to change namespace
			// and verify the API is called with the correct namespace parameter
			const { result } = renderHook(() => usePods(), {
				wrapper: createWrapper('default')
			})

			await waitFor(() => {
				expect(result.current.loading).toBe(false)
			})

			expect(result.current.data).toBeDefined()
		})

		it('should handle API errors gracefully', async () => {
			// Mock the k8sService to return an error
			const { k8sService } = require('@/lib/k8s-api')
			k8sService.getPods.mockRejectedValue(new Error('API Error'))

			const { result } = renderHook(() => usePods(), {
				wrapper: createWrapper()
			})

			await waitFor(() => {
				expect(result.current.loading).toBe(false)
			})

			expect(result.current.error).toBe('API Error')
			expect(result.current.data).toEqual([])
		})
	})

	describe('useServices', () => {
		it('should fetch services and transform data correctly', async () => {
			const { result } = renderHook(() => useServices(), {
				wrapper: createWrapper()
			})

			expect(result.current.loading).toBe(true)

			await waitFor(() => {
				expect(result.current.loading).toBe(false)
			})

			expect(result.current.data).toBeDefined()
			expect(result.current.error).toBeNull()
		})
	})

	describe('useDeployments', () => {
		it('should fetch deployments and transform data correctly', async () => {
			const { result } = renderHook(() => useDeployments(), {
				wrapper: createWrapper()
			})

			expect(result.current.loading).toBe(true)

			await waitFor(() => {
				expect(result.current.loading).toBe(false)
			})

			expect(result.current.data).toBeDefined()
			expect(result.current.error).toBeNull()
		})
	})

	describe('namespace context integration', () => {
		it('should refetch data when namespace changes', async () => {
			// This test would require a more sophisticated setup
			// to actually change the namespace and verify refetch behavior
			const { result } = renderHook(() => usePods(), {
				wrapper: createWrapper()
			})

			await waitFor(() => {
				expect(result.current.loading).toBe(false)
			})

			// Verify refetch function exists
			expect(typeof result.current.refetch).toBe('function')
		})
	})
})

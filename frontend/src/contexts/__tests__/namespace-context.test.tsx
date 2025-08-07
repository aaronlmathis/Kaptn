import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { NamespaceProvider, useNamespace } from '@/contexts/namespace-context'
import { k8sService } from '@/lib/k8s-service'

// Mock the k8sService
vi.mock('@/lib/k8s-service', () => ({
	k8sService: {
		getNamespaces: vi.fn()
	}
}))

const mockNamespaces = [
	{
		metadata: {
			name: 'default',
			creationTimestamp: '2024-01-01T00:00:00Z',
			labels: {}
		},
		status: {
			phase: 'Active'
		}
	},
	{
		metadata: {
			name: 'kube-system',
			creationTimestamp: '2024-01-01T00:00:00Z',
			labels: {}
		},
		status: {
			phase: 'Active'
		}
	}
]

// Test component that uses the namespace context
function TestComponent() {
	const { selectedNamespace, namespaces, loading, setSelectedNamespace } = useNamespace()

	return (
		<div>
			<div data-testid="selected-namespace">{selectedNamespace}</div>
			<div data-testid="loading">{loading.toString()}</div>
			<div data-testid="namespace-count">{namespaces.length}</div>
			<button
				data-testid="set-default"
				onClick={() => setSelectedNamespace('default')}
			>
				Set Default
			</button>
			<button
				data-testid="set-all"
				onClick={() => setSelectedNamespace('all')}
			>
				Set All
			</button>
		</div>
	)
}

describe('NamespaceContext', () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it('should start with "all" namespace selected', async () => {
		vi.mocked(k8sService.getNamespaces).mockResolvedValue(mockNamespaces)

		render(
			<NamespaceProvider>
				<TestComponent />
			</NamespaceProvider>
		)

		expect(screen.getByTestId('selected-namespace')).toHaveTextContent('all')
	})

	it('should load namespaces on mount', async () => {
		vi.mocked(k8sService.getNamespaces).mockResolvedValue(mockNamespaces)

		render(
			<NamespaceProvider>
				<TestComponent />
			</NamespaceProvider>
		)

		await waitFor(() => {
			expect(screen.getByTestId('loading')).toHaveTextContent('false')
		})

		expect(screen.getByTestId('namespace-count')).toHaveTextContent('2')
		expect(k8sService.getNamespaces).toHaveBeenCalledTimes(1)
	})

	it('should allow changing selected namespace', async () => {
		vi.mocked(k8sService.getNamespaces).mockResolvedValue(mockNamespaces)

		render(
			<NamespaceProvider>
				<TestComponent />
			</NamespaceProvider>
		)

		await waitFor(() => {
			expect(screen.getByTestId('loading')).toHaveTextContent('false')
		})

		fireEvent.click(screen.getByTestId('set-default'))
		expect(screen.getByTestId('selected-namespace')).toHaveTextContent('default')

		fireEvent.click(screen.getByTestId('set-all'))
		expect(screen.getByTestId('selected-namespace')).toHaveTextContent('all')
	})

	it('should handle API errors gracefully', async () => {
		const errorMessage = 'Failed to fetch namespaces'
		vi.mocked(k8sService.getNamespaces).mockRejectedValue(new Error(errorMessage))

		render(
			<NamespaceProvider>
				<TestComponent />
			</NamespaceProvider>
		)

		await waitFor(() => {
			expect(screen.getByTestId('loading')).toHaveTextContent('false')
		})

		expect(screen.getByTestId('namespace-count')).toHaveTextContent('0')
	})
})

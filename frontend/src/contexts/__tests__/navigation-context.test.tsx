import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NavigationProvider, useNavigation } from '../navigation-context'

// Mock window.location
const mockLocation = {
	pathname: '/',
	search: '',
	hash: '',
	state: null,
	key: 'default'
}

Object.defineProperty(window, 'location', {
	value: mockLocation,
	writable: true
})

// Mock localStorage
const localStorageMock = {
	getItem: vi.fn(),
	setItem: vi.fn(),
	clear: vi.fn(),
	removeItem: vi.fn(),
	length: 0,
	key: vi.fn()
}
Object.defineProperty(window, 'localStorage', {
	value: localStorageMock,
	writable: true
})

// Test component to access navigation context
function TestComponent() {
	const { currentPath, breadcrumbs, isHydrated } = useNavigation()

	return (
		<div>
			<div data-testid="current-path">{currentPath}</div>
			<div data-testid="is-hydrated">{isHydrated.toString()}</div>
			<div data-testid="breadcrumbs">
				{breadcrumbs.map((crumb, index) => (
					<span key={index} data-testid={`breadcrumb-${index}`}>
						{crumb.title}
					</span>
				))}
			</div>
		</div>
	)
}

describe('NavigationProvider', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		// Reset window.location to default
		mockLocation.pathname = '/'
	})

	it('should provide initial navigation state', () => {
		render(
			<NavigationProvider>
				<TestComponent />
			</NavigationProvider>
		)

		expect(screen.getByTestId('current-path')).toHaveTextContent('/')
		expect(screen.getByTestId('is-hydrated')).toHaveTextContent('true')
	})

	it('should generate correct breadcrumbs for dashboard', () => {
		mockLocation.pathname = '/'

		render(
			<NavigationProvider>
				<TestComponent />
			</NavigationProvider>
		)

		expect(screen.getByTestId('breadcrumb-0')).toHaveTextContent('Kubernetes Admin')
		expect(screen.getByTestId('breadcrumb-1')).toHaveTextContent('Dashboard')
	})

	it('should generate correct breadcrumbs for workload pages', () => {
		mockLocation.pathname = '/pods'

		render(
			<NavigationProvider>
				<TestComponent />
			</NavigationProvider>
		)

		expect(screen.getByTestId('breadcrumb-0')).toHaveTextContent('Kubernetes Admin')
		expect(screen.getByTestId('breadcrumb-1')).toHaveTextContent('Workloads')
		expect(screen.getByTestId('breadcrumb-2')).toHaveTextContent('Pods')
	})

	it('should generate correct breadcrumbs for services pages', () => {
		mockLocation.pathname = '/endpoints'

		render(
			<NavigationProvider>
				<TestComponent />
			</NavigationProvider>
		)

		expect(screen.getByTestId('breadcrumb-0')).toHaveTextContent('Kubernetes Admin')
		expect(screen.getByTestId('breadcrumb-1')).toHaveTextContent('Services')
		expect(screen.getByTestId('breadcrumb-2')).toHaveTextContent('Endpoints')
	})

	it('should generate correct breadcrumbs for cluster pages', () => {
		mockLocation.pathname = '/cluster/nodes'

		render(
			<NavigationProvider>
				<TestComponent />
			</NavigationProvider>
		)

		expect(screen.getByTestId('breadcrumb-0')).toHaveTextContent('Kubernetes Admin')
		expect(screen.getByTestId('breadcrumb-1')).toHaveTextContent('Cluster')
		expect(screen.getByTestId('breadcrumb-2')).toHaveTextContent('Nodes')
	})
})

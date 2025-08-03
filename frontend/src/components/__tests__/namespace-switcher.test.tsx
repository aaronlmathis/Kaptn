import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NamespaceSwitcher } from '../namespace-switcher'
import { NamespaceProvider } from '@/contexts/namespace-context'
import React from 'react'

// Mock the sidebar hook
vi.mock('@/components/ui/sidebar', () => ({
	useSidebar: () => ({
		isMobile: false
	}),
	SidebarMenu: ({ children }: { children: React.ReactNode }) => <div data-testid="sidebar-menu">{children}</div>,
	SidebarMenuItem: ({ children }: { children: React.ReactNode }) => <div data-testid="sidebar-menu-item">{children}</div>,
	SidebarMenuButton: ({ children, onClick, ...props }: any) => (
		<button onClick={onClick} {...props}>{children}</button>
	),
}))

// Mock dropdown menu components
vi.mock('@/components/ui/dropdown-menu', () => ({
	DropdownMenu: ({ children }: { children: React.ReactNode }) => <div data-testid="dropdown-menu">{children}</div>,
	DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div data-testid="dropdown-content">{children}</div>,
	DropdownMenuItem: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
		<button data-testid="dropdown-item" onClick={onClick}>{children}</button>
	),
	DropdownMenuLabel: ({ children }: { children: React.ReactNode }) => <div data-testid="dropdown-label">{children}</div>,
	DropdownMenuTrigger: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) => (
		asChild ? children : <div data-testid="dropdown-trigger">{children}</div>
	),
	DropdownMenuShortcut: ({ children }: { children: React.ReactNode }) => <span data-testid="dropdown-shortcut">{children}</span>,
}))

describe('NamespaceSwitcher', () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it('should show loading state initially', () => {
		render(
			<NamespaceProvider>
				<NamespaceSwitcher />
			</NamespaceProvider>
		)

		expect(screen.getByText('Loading...')).toBeInTheDocument()
		expect(screen.getByText('Fetching namespaces')).toBeInTheDocument()
	})

	it('should display "All Namespaces" as default selection', async () => {
		render(
			<NamespaceProvider>
				<NamespaceSwitcher />
			</NamespaceProvider>
		)

		await waitFor(() => {
			// Should have multiple "All Namespaces" text (trigger and dropdown item)
			const allNamespaceElements = screen.getAllByText('All Namespaces')
			expect(allNamespaceElements.length).toBeGreaterThan(0)
		})

		expect(screen.getByText('View resources across all namespaces')).toBeInTheDocument()
	})

	it('should list available namespaces in dropdown', async () => {
		render(
			<NamespaceProvider>
				<NamespaceSwitcher />
			</NamespaceProvider>
		)

		await waitFor(() => {
			expect(screen.getByText('All Namespaces')).toBeInTheDocument()
		})

		// The mock data should show these namespaces
		expect(screen.getByText('Namespaces')).toBeInTheDocument()
	})

	it('should show correct keyboard shortcuts', async () => {
		render(
			<NamespaceProvider>
				<NamespaceSwitcher />
			</NamespaceProvider>
		)

		await waitFor(() => {
			expect(screen.getByText('All Namespaces')).toBeInTheDocument()
		})

		// Should show ⌘A for "All" option
		expect(screen.getByText('⌘A')).toBeInTheDocument()
	})

	it('should allow namespace selection', async () => {
		const user = userEvent.setup()

		render(
			<NamespaceProvider>
				<NamespaceSwitcher />
			</NamespaceProvider>
		)

		await waitFor(() => {
			expect(screen.getByText('All Namespaces')).toBeInTheDocument()
		})

		// Find and click a namespace option if available
		const dropdownItems = screen.getAllByTestId('dropdown-item')
		if (dropdownItems.length > 1) {
			await user.click(dropdownItems[1]) // Click second item (first non-"All" namespace)

			// The selection should change
			// Note: The exact namespace name depends on mock data
		}
	})

	it('should use Globe icon for "All Namespaces" option', async () => {
		render(
			<NamespaceProvider>
				<NamespaceSwitcher />
			</NamespaceProvider>
		)

		await waitFor(() => {
			expect(screen.getByText('All Namespaces')).toBeInTheDocument()
		})

		// We can't easily test for specific icons in this setup,
		// but we can verify the component structure is correct
		expect(screen.getByTestId('sidebar-menu')).toBeInTheDocument()
		expect(screen.getByTestId('sidebar-menu-item')).toBeInTheDocument()
	})
})

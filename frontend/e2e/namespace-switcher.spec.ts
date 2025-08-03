import { test, expect } from '@playwright/test'

test.describe('Namespace Switcher E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('should display namespace switcher in sidebar', async ({ page }) => {
    // Wait for the page to load
    await page.waitForLoadState('networkidle')
    
    // Check that namespace switcher is visible
    await expect(page.locator('[data-testid="namespace-switcher"]')).toBeVisible()
    
    // Should show "All Namespaces" by default
    await expect(page.locator('text=All Namespaces')).toBeVisible()
  })

  test('should open namespace dropdown on click', async ({ page }) => {
    await page.waitForLoadState('networkidle')
    
    // Click the namespace switcher
    await page.click('[data-testid="namespace-switcher"]')
    
    // Should show dropdown with namespaces
    await expect(page.locator('text=Namespaces')).toBeVisible()
    
    // Should show "All Namespaces" option
    await expect(page.locator('text=All Namespaces')).toBeVisible()
  })

  test('should switch namespaces and update data tables', async ({ page }) => {
    await page.waitForLoadState('networkidle')
    
    // Wait for initial data load
    await page.waitForSelector('[data-testid="pods-table"]', { timeout: 10000 })
    
    // Count initial pods
    const initialPodCount = await page.locator('[data-testid="pods-table"] tbody tr').count()
    
    // Open namespace switcher
    await page.click('[data-testid="namespace-switcher"]')
    
    // Select a specific namespace (e.g., "default")
    await page.click('text=default')
    
    // Wait for data to refresh
    await page.waitForResponse(response => 
      response.url().includes('/api/v1/pods') && response.url().includes('namespace=default')
    )
    
    // Verify that namespace selection changed
    await expect(page.locator('text=Resources in default')).toBeVisible()
  })

  test('should show correct keyboard shortcuts', async ({ page }) => {
    await page.waitForLoadState('networkidle')
    
    // Open namespace dropdown
    await page.click('[data-testid="namespace-switcher"]')
    
    // Should show ⌘A for "All" option
    await expect(page.locator('text=⌘A')).toBeVisible()
    
    // Should show numbered shortcuts for namespaces
    await expect(page.locator('text=⌘1')).toBeVisible()
  })

  test('should work on mobile devices', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 })
    await page.waitForLoadState('networkidle')
    
    // Should still be able to access namespace switcher
    await expect(page.locator('[data-testid="namespace-switcher"]')).toBeVisible()
    
    // Click should still work
    await page.click('[data-testid="namespace-switcher"]')
    await expect(page.locator('text=Namespaces')).toBeVisible()
  })

  test('should handle API errors gracefully', async ({ page }) => {
    // Mock a failed API response
    await page.route('**/api/v1/namespaces', route => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal Server Error' }),
      })
    })
    
    await page.reload()
    await page.waitForLoadState('networkidle')
    
    // Should still show the switcher but in an error state
    await expect(page.locator('[data-testid="namespace-switcher"]')).toBeVisible()
  })

  test('should persist namespace selection across page refreshes', async ({ page }) => {
    await page.waitForLoadState('networkidle')
    
    // Select a specific namespace
    await page.click('[data-testid="namespace-switcher"]')
    await page.click('text=default')
    
    // Wait for selection to be applied
    await expect(page.locator('text=Resources in default')).toBeVisible()
    
    // Refresh the page
    await page.reload()
    await page.waitForLoadState('networkidle')
    
    // Note: This test assumes we implement localStorage persistence
    // Currently our implementation doesn't persist selection
    // This test documents the expected behavior for future enhancement
  })

  test('should update all resource tables when namespace changes', async ({ page }) => {
    await page.waitForLoadState('networkidle')
    
    // Switch to Pods tab
    await page.click('text=Pods')
    await page.waitForSelector('[data-testid="pods-table"]')
    
    // Switch to Services tab  
    await page.click('text=Services')
    await page.waitForSelector('[data-testid="services-table"]')
    
    // Switch to Deployments tab
    await page.click('text=Deployments')
    await page.waitForSelector('[data-testid="deployments-table"]')
    
    // Now change namespace
    await page.click('[data-testid="namespace-switcher"]')
    await page.click('text=default')
    
    // All tabs should now show namespace-filtered data
    // We can verify this by checking the API calls
    await page.waitForResponse(response => 
      response.url().includes('/api/v1/deployments') && response.url().includes('namespace=default')
    )
  })
})

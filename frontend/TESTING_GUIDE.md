# Testing Framework Guide

## Overview

This project uses a comprehensive testing framework setup with:

- **Vitest** v3.2.4 - Fast unit testing framework
- **Testing Library** - React/DOM testing utilities
- **Playwright** - End-to-end testing
- **MSW** v2.x - API mocking

## Current Status

### ✅ Working Components

1. **Namespace Context Tests** (4/4 passing)
   - Context initialization
   - State management
   - Error handling
   - React state updates

2. **Test Infrastructure**
   - Vitest configuration
   - MSW API mocking
   - TypeScript setup
   - Jest-DOM matchers

### 🔧 Partially Working

1. **Namespace Switcher Tests** (2/6 passing)
   - ✅ Loading states
   - ✅ Default selection display
   - ❌ Multiple element selection issues
   - ❌ Dropdown interactions

### ❌ Known Issues

1. **Hook Tests** (0/6 passing)
   - Module resolution issues with `@/lib/k8s-api`
   - Mock function setup problems

## Running Tests

```bash
# Run all unit tests
npm run test:run

# Run tests in watch mode
npm run test

# Run tests with coverage
npm run test:coverage

# Run E2E tests (when implemented)
npm run test:e2e
```

## Test Structure

```
src/
├── components/
│   └── __tests__/
│       └── namespace-switcher.test.tsx
├── contexts/
│   └── __tests__/
│       └── namespace-context.test.tsx
├── hooks/
│   └── __tests__/
│       └── use-k8s-data.test.tsx
└── test/
    ├── setup.ts          # Global test setup
    └── mocks/             # Mock utilities
```

## Configuration Files

### Vitest Config (`vitest.config.ts`)
```typescript
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: true,
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude: ['node_modules', 'dist', '.astro', 'e2e/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

### Test Setup (`src/test/setup.ts`)
- Imports `@testing-library/jest-dom` for custom matchers
- Configures MSW server with API mocks
- Sets up global test environment

## API Mocking with MSW

The project uses MSW v2.x for API mocking:

```typescript
// Updated syntax for MSW v2.x
import { http, HttpResponse } from 'msw'

export const server = setupServer(
  http.get('/api/v1/namespaces', () => {
    return HttpResponse.json(mockNamespaces)
  }),
  
  http.get('/api/v1/pods', ({ request }) => {
    const url = new URL(request.url)
    const namespace = url.searchParams.get('namespace')
    // Filter logic here
    return HttpResponse.json(filteredData)
  })
)
```

## Common Testing Patterns

### Testing React Context

```typescript
const TestComponent = () => {
  const { selectedNamespace, setSelectedNamespace } = useNamespace()
  return (
    <div>
      <span data-testid="selected">{selectedNamespace}</span>
      <button onClick={() => setSelectedNamespace('test')}>Change</button>
    </div>
  )
}

// Test with context provider
render(
  <NamespaceProvider>
    <TestComponent />
  </NamespaceProvider>
)
```

### Testing Multiple Elements

When components render the same text in multiple places:

```typescript
// Instead of getByText (throws on multiple)
expect(screen.getByText('All Namespaces')).toBeInTheDocument()

// Use getAllByText
const elements = screen.getAllByText('All Namespaces')
expect(elements.length).toBeGreaterThan(0)

// Or use more specific selectors
expect(screen.getByTestId('dropdown-trigger')).toHaveTextContent('All Namespaces')
```

### Mocking Modules

```typescript
// Mock external modules
vi.mock('@/lib/k8s-api', () => ({
  k8sService: {
    getPods: vi.fn(),
    getServices: vi.fn(),
    getDeployments: vi.fn(),
  }
}))

// Use mocked functions
const { k8sService } = require('@/lib/k8s-api')
k8sService.getPods.mockResolvedValue(mockData)
```

## Troubleshooting

### Module Resolution Issues

If you see "Cannot find module '@/lib/k8s-api'":

1. Check Vitest config has correct alias setup
2. Ensure the module is properly mocked before import
3. Use absolute imports in mocks

### Multiple Element Errors

When Testing Library finds multiple elements:

1. Use `getAllByText` instead of `getByText`
2. Add more specific test IDs
3. Use `within()` to scope queries

### React State Updates

Wrap state changes in `act()`:

```typescript
import { act } from '@testing-library/react'

await act(async () => {
  fireEvent.click(button)
})
```

## Dependencies

```json
{
  "devDependencies": {
    "@testing-library/dom": "^10.4.0",
    "@testing-library/jest-dom": "^6.6.5",
    "@testing-library/react": "^16.1.0",
    "@testing-library/user-event": "^14.5.2",
    "@types/testing-library__jest-dom": "^6.0.0",
    "@vitest/ui": "^3.2.4",
    "jsdom": "^25.0.1",
    "msw": "^2.10.4",
    "playwright": "^1.54.2",
    "vitest": "^3.2.4"
  }
}
```

## Next Steps

1. **Fix Hook Tests**: Resolve module resolution for k8s-api mocking
2. **Improve Component Tests**: Handle multiple element scenarios
3. **Add E2E Tests**: Implement Playwright tests for full user flows
4. **Coverage Targets**: Aim for >80% test coverage
5. **CI Integration**: Add testing to build pipeline

## Best Practices

1. **Test Naming**: Use descriptive test names that explain behavior
2. **Mocking**: Mock external dependencies, test internal logic
3. **Isolation**: Each test should be independent
4. **Real User Scenarios**: Test how users actually interact with components
5. **Error Cases**: Test both success and failure scenarios

## Example Test Structure

```typescript
describe('ComponentName', () => {
  beforeEach(() => {
    // Setup mocks and clean state
  })

  describe('when loading', () => {
    it('should show loading state', () => {
      // Test loading behavior
    })
  })

  describe('when data is available', () => {
    it('should display data correctly', () => {
      // Test successful data display
    })
  })

  describe('when error occurs', () => {
    it('should handle errors gracefully', () => {
      // Test error scenarios
    })
  })
})
```

This testing framework provides a solid foundation for ensuring the namespace switcher functionality works correctly and remains stable during future development.

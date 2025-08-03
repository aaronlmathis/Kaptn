# Namespace Switcher Implementation

## Overview

This implementation replaces the team switcher with a namespace switcher that allows users to filter Kubernetes resources by namespace. The implementation includes:

1. **NamespaceContext** - Global state management for selected namespace
2. **NamespaceSwitcher** - UI component to select namespaces
3. **Updated Hooks** - Modified data fetching hooks to use selected namespace
4. **Dashboard Integration** - Updated dashboard to show/hide namespace columns appropriately

## Features

- **All Namespaces Option**: Switch between specific namespaces or view all namespaces
- **Real-time Updates**: Automatically refetches data when namespace changes
- **Smart UI**: Hides namespace columns when a specific namespace is selected
- **Error Handling**: Graceful error handling for namespace API failures
- **Loading States**: Proper loading indicators during namespace fetching

## Components

### NamespaceContext
- Manages selected namespace state globally
- Fetches available namespaces from the API
- Provides `selectedNamespace`, `namespaces`, `loading`, `error`, and `setSelectedNamespace`

### NamespaceSwitcher
- Dropdown menu to select namespaces
- Shows "All Namespaces" option plus individual namespace options
- Visual icons and descriptions for each option
- Keyboard shortcuts (⌘A for All, ⌘1-9 for individual namespaces)

### Updated Hooks
- `usePods()`, `useServices()`, `useDeployments()` now use namespace context
- Automatically pass namespace filter to API calls
- `useNodes()` unaffected (nodes are cluster-wide)

## API Integration

The backend already supports namespace filtering via query parameters:
- `/api/v1/pods?namespace=default` - Pods in specific namespace
- `/api/v1/pods` - All pods across namespaces
- `/api/v1/services?namespace=default` - Services in specific namespace
- `/api/v1/deployments?namespace=default` - Deployments in specific namespace

## UI Behavior

### When "All Namespaces" is selected:
- Namespace columns are visible in all tables
- All resources from all namespaces are shown
- API calls are made without namespace filter

### When a specific namespace is selected:
- Namespace columns are hidden (since all resources are from the same namespace)
- Only resources from the selected namespace are shown
- API calls include the namespace filter

## Usage

The namespace switcher is automatically available in the sidebar header. Users can:

1. Click the namespace switcher dropdown
2. Select "All Namespaces" to see resources from all namespaces
3. Select a specific namespace to filter resources
4. Use keyboard shortcuts for quick switching

## Testing Verification

To verify the implementation works:

1. **Frontend loads**: Visit http://localhost:4322
2. **Namespaces load**: The switcher should show available namespaces
3. **Filtering works**: Selecting a namespace should filter the data tables
4. **Column visibility**: Namespace columns should show/hide appropriately
5. **API calls**: Check network tab for correct API calls with namespace parameters

## Future Enhancements

1. **Namespace search**: Add search/filter capability to namespace dropdown
2. **Recent namespaces**: Remember recently selected namespaces
3. **Namespace metrics**: Show resource counts per namespace in the dropdown
4. **Permissions**: Hide namespaces the user doesn't have access to

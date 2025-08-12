# DataTableFilters Migration Guide

This guide provides step-by-step instructions for migrating existing `*DataTable.tsx` files to use the standardized `DataTableFilters` component.

## Overview

The `DataTableFilters` component provides a unified filtering, searching, and bulk actions interface for all data tables in the application. It replaces the old individual filter controls with a consistent, feature-rich component.

## ✅ Completed Implementations

- `ServicesDataTable.tsx` - ✅ Complete (original implementation)
- `PodsDataTable.tsx` - ✅ Complete 
- `DeploymentsDataTable.tsx` - ✅ Complete
- `ApiResourcesDataTable.tsx` - ✅ Complete
- `ConfigMapsDataTable.tsx` - ✅ Complete
- `CronJobsDataTable.tsx` - ✅ Complete
- `CSIDriversDataTable.tsx` - ✅ Complete
- `DaemonSetsDataTable.tsx` - ✅ Complete
- `EndpointsDataTable.tsx` - ✅ Complete
- `EndpointSlicesDataTable.tsx` - ✅ Complete
- `GatewaysDataTable.tsx` - ✅ Complete
- `IngressClassesDataTable.tsx` - ✅ Complete
- `JobsDataTable.tsx` - ✅ Complete
- `LoadBalancersDataTable.tsx` - ✅ Complete
- `NamespacesDataTable.tsx` - ✅ Complete

## 🔄 Files Requiring Migration

All remaining `*DataTable.tsx` files in this directory need to be updated to use the new `DataTableFilters` component.

## Migration Steps

### Step 1: Update Imports

#### Remove old imports:
```tsx
// Remove these icons (they're replaced by DataTableFilters internal components)
IconLayoutColumns,
IconChevronDown,

// Remove this from dropdown menu imports
DropdownMenuCheckboxItem,
```

#### Add new imports:
```tsx
// Add resource-specific action icons based on the table type
import {
  IconDownload,      // For YAML export
  IconCopy,          // For copying names/data
  // Add resource-specific icons:
  IconScale,         // For deployments (scaling)
  IconFileText,      // For pods (logs)
  IconInfoCircle,    // For pods (describe)
  IconDatabase,      // For storage resources
  IconNetwork,       // For network resources
  // etc.
} from "@tabler/icons-react"

// Add DataTableFilters component and types
import { DataTableFilters, type FilterOption, type BulkAction } from "@/components/ui/data-table-filters"
```

### Step 2: Add Missing State Variables

Add these state variables to the component function, after existing state declarations:

```tsx
const [globalFilter, setGlobalFilter] = React.useState("")
const [statusFilter, setStatusFilter] = React.useState<string>("all")
```

### Step 3: Create Filter Options

Create filter options based on meaningful categories from your data. Common patterns:

#### For resources with status fields:
```tsx
const resourceStatuses: FilterOption[] = React.useMemo(() => {
  const statuses = new Set(resources.map(resource => resource.status))
  return Array.from(statuses).sort().map(status => ({
    value: status,
    label: status,
    badge: getStatusBadge(status) // Use existing badge helper function
  }))
}, [resources])
```

#### For resources with type fields:
```tsx
const resourceTypes: FilterOption[] = React.useMemo(() => {
  const types = new Set(resources.map(resource => resource.type))
  return Array.from(types).sort().map(type => ({
    value: type,
    label: type,
    badge: getTypeBadge(type) // Use existing badge helper function
  }))
}, [resources])
```

#### For custom status derivation (e.g., deployments):
```tsx
const deploymentStatuses: FilterOption[] = React.useMemo(() => {
  const statuses = new Set<string>()
  deployments.forEach(deployment => {
    // Create status based on availability
    if (deployment.available > 0) {
      statuses.add("Available")
    } else {
      statuses.add("Unavailable")
    }
  })
  return Array.from(statuses).sort().map(status => ({
    value: status,
    label: status,
    badge: (
      <Badge variant="outline" className={status === "Available" ? "text-green-600 border-border bg-transparent px-1.5" : "text-red-600 border-border bg-transparent px-1.5"}>
        {status}
      </Badge>
    )
  }))
}, [deployments])
```

### Step 4: Implement Filtered Data Logic

Add filtering logic before the `useReactTable` call:

```tsx
// Filter data based on global filter and status filter
const filteredData = React.useMemo(() => {
  let filtered = resources

  // Apply category filter (status, type, etc.)
  if (statusFilter !== "all") {
    filtered = filtered.filter(resource => {
      // For direct field matching:
      return resource.status === statusFilter
      
      // For custom logic (e.g., deployments):
      // const isAvailable = resource.available > 0
      // const status = isAvailable ? "Available" : "Unavailable"
      // return status === statusFilter
    })
  }

  // Apply global filter (search)
  if (globalFilter) {
    const searchTerm = globalFilter.toLowerCase()
    filtered = filtered.filter(resource =>
      // Add all searchable fields for this resource type
      resource.name.toLowerCase().includes(searchTerm) ||
      resource.namespace.toLowerCase().includes(searchTerm) ||
      // Add more fields as appropriate:
      // resource.status.toLowerCase().includes(searchTerm) ||
      // resource.type.toLowerCase().includes(searchTerm) ||
      // resource.node.toLowerCase().includes(searchTerm) ||
      // resource.image.toLowerCase().includes(searchTerm)
    )
  }

  return filtered
}, [resources, statusFilter, globalFilter])
```

### Step 5: Update useReactTable Data Source

Change the data source from the raw resources to filtered data:

```tsx
const table = useReactTable({
  data: filteredData, // ← Changed from 'resources' to 'filteredData'
  columns,
  // ... rest of configuration remains the same
})
```

### Step 6: Create Bulk Actions

Define bulk actions appropriate for the resource type:

#### Standard Actions (include in most resources):
```tsx
const resourceBulkActions: BulkAction[] = React.useMemo(() => [
  {
    id: "export-yaml",
    label: "Export Selected as YAML",
    icon: <IconDownload className="size-4" />,
    action: () => {
      const selectedResources = table.getFilteredSelectedRowModel().rows.map(row => row.original)
      console.log('Export YAML for resources:', selectedResources.map(r => r.name))
      // TODO: Implement bulk YAML export
    },
    requiresSelection: true,
  },
  {
    id: "copy-names",
    label: "Copy Resource Names",
    icon: <IconCopy className="size-4" />,
    action: () => {
      const selectedResources = table.getFilteredSelectedRowModel().rows.map(row => row.original)
      const names = selectedResources.map(r => r.name).join('\n')
      navigator.clipboard.writeText(names)
      console.log('Copied resource names:', names)
    },
    requiresSelection: true,
  },
  // ... resource-specific actions
  {
    id: "delete-resources",
    label: "Delete Selected Resources",
    icon: <IconTrash className="size-4" />,
    action: () => {
      const selectedResources = table.getFilteredSelectedRowModel().rows.map(row => row.original)
      console.log('Delete resources:', selectedResources.map(r => `${r.name} in ${r.namespace}`))
      // TODO: Implement bulk deletion with confirmation
    },
    variant: "destructive" as const,
    requiresSelection: true,
  },
], [table])
```

#### Resource-Specific Action Examples:

**Pods:**
```tsx
{
  id: "get-logs",
  label: "Get Logs for Selected",
  icon: <IconFileText className="size-4" />,
  action: () => {
    // TODO: Implement bulk log retrieval
  },
  requiresSelection: true,
},
{
  id: "describe-pods",
  label: "Describe Selected Pods",
  icon: <IconInfoCircle className="size-4" />,
  action: () => {
    // TODO: Implement bulk pod describe
  },
  requiresSelection: true,
},
```

**Deployments:**
```tsx
{
  id: "scale-deployments",
  label: "Scale Selected Deployments",
  icon: <IconScale className="size-4" />,
  action: () => {
    // TODO: Implement bulk deployment scaling
  },
  requiresSelection: true,
},
{
  id: "restart-deployments",
  label: "Restart Selected Deployments",
  icon: <IconRefresh className="size-4" />,
  action: () => {
    // TODO: Implement bulk deployment restart
  },
  requiresSelection: true,
},
```

**Services:**
```tsx
{
  id: "restart-services",
  label: "Restart Selected Services",
  icon: <IconRefresh className="size-4" />,
  action: () => {
    // TODO: Implement bulk service restart
  },
  requiresSelection: true,
},
```

### Step 7: Replace Table Controls Section

Find and replace the entire table controls section:

#### Old code to remove:
```tsx
{/* Table controls */}
<div className="flex items-center justify-between">
  <div className="flex items-center space-x-2">
    <p className="text-sm text-muted-foreground">
      {table.getFilteredSelectedRowModel().rows.length} of{" "}
      {table.getFilteredRowModel().rows.length} row(s) selected.
    </p>
    {/* Optional: Real-time updates indicator */}
    {isConnected && (
      <div className="flex items-center space-x-1 text-xs text-green-600">
        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
        <span>Live updates</span>
      </div>
    )}
  </div>
  <div className="flex items-center space-x-2">
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <IconLayoutColumns />
          <span className="hidden lg:inline">Customize Columns</span>
          <span className="lg:hidden">Columns</span>
          <IconChevronDown />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {table
          .getAllColumns()
          .filter(
            (column) =>
              typeof column.accessorFn !== "undefined" &&
              column.getCanHide()
          )
          .map((column) => {
            return (
              <DropdownMenuCheckboxItem
                key={column.id}
                className="capitalize"
                checked={column.getIsVisible()}
                onCheckedChange={(value) =>
                  column.toggleVisibility(!!value)
                }
              >
                {column.id}
              </DropdownMenuCheckboxItem>
            )
          })}
      </DropdownMenuContent>
    </DropdownMenu>
    <Button variant="outline" size="sm" onClick={refetch} disabled={loading}>
      <IconRefresh className={loading ? "animate-spin" : ""} />
    </Button>
  </div>
</div>
```

#### New code to add:
```tsx
{/* Search and filter controls */}
<DataTableFilters
  globalFilter={globalFilter}
  onGlobalFilterChange={setGlobalFilter}
  searchPlaceholder="Search [resources] by [field1], [field2], [field3]... (Press '/' to focus)"
  categoryFilter={statusFilter}
  onCategoryFilterChange={setStatusFilter}
  categoryLabel="Filter by [category]"
  categoryOptions={resourceStatuses}
  selectedCount={table.getFilteredSelectedRowModel().rows.length}
  totalCount={table.getFilteredRowModel().rows.length}
  bulkActions={resourceBulkActions}
  bulkActionsLabel="Actions"
  table={table}
  showColumnToggle={true}
  onRefresh={refetch}
  isRefreshing={loading}
>
  {/* Optional: Real-time updates indicator */}
  {isConnected && (
    <div className="flex items-center space-x-1 text-xs text-green-600">
      <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
      <span>Live updates</span>
    </div>
  )}
</DataTableFilters>
```

## Resource-Specific Configuration

### Search Placeholder Examples

- **Pods**: `"Search pods by name, namespace, status, node, or image... (Press '/' to focus)"`
- **Services**: `"Search services by name, namespace, type, cluster IP, external IP, or ports... (Press '/' to focus)"`
- **Deployments**: `"Search deployments by name, namespace, or image... (Press '/' to focus)"`
- **ConfigMaps**: `"Search config maps by name, namespace, or keys... (Press '/' to focus)"`
- **Secrets**: `"Search secrets by name, namespace, type, or keys... (Press '/' to focus)"`
- **Nodes**: `"Search nodes by name, status, role, or version... (Press '/' to focus)"`

### Category Filter Examples

- **Status-based**: `"Filter by status"` (pods, nodes, deployments)
- **Type-based**: `"Filter by type"` (services, secrets, storage classes)
- **State-based**: `"Filter by state"` (persistent volumes)
- **Phase-based**: `"Filter by phase"` (persistent volume claims)

## Testing Your Implementation

After implementing the changes:

1. **Verify Filtering**: Test that global search works across all specified fields
2. **Verify Category Filter**: Test that the category dropdown filters correctly
3. **Verify Bulk Actions**: Test that bulk actions are enabled/disabled based on selection
4. **Verify Column Toggle**: Test that the column visibility toggle still works
5. **Verify Refresh**: Test that the refresh button works
6. **Verify Real-time Updates**: If applicable, verify the live updates indicator appears

## Common Patterns by Resource Type

### Network Resources (Services, Ingresses, Network Policies)
- Usually filter by `type` or `class`
- Include IP addresses in search
- Bulk actions: export, copy, restart/reload, delete

### Workload Resources (Pods, Deployments, StatefulSets, DaemonSets)
- Usually filter by `status` or `phase`
- Include container images in search
- Bulk actions: export, copy, scale/restart, logs/describe, delete

### Storage Resources (PVs, PVCs, Storage Classes)
- Usually filter by `status`, `access mode`, or `storage class`
- Include capacity and storage details in search
- Bulk actions: export, copy, delete

### Configuration Resources (ConfigMaps, Secrets)
- Usually filter by `type`
- Include keys/data in search
- Bulk actions: export, copy, download data, delete

### Administrative Resources (Nodes, Namespaces, RBAC)
- Usually filter by `status` or `role`
- Include labels and annotations in search
- Bulk actions: export, copy, (limited destructive actions)

## Notes

- All implementations should include standard "Export as YAML" and "Copy Names" actions
- Destructive actions should use `variant: "destructive"` and implement confirmation dialogs
- Search should include the most commonly searched fields for that resource type
- Filter categories should be meaningful and provide value to users
- Real-time updates indicator is optional and should only be shown when WebSocket connection is active

## Example Complete Implementation

See `PodsDataTable.tsx` or `DeploymentsDataTable.tsx` for complete reference implementations following this pattern.

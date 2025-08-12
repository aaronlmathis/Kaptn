# Mobile Pagination Fix Guide

This guide provides instructions for fixing mobile pagination issues in DataTable components that have already been migrated to use `DataTableFilters`.

## The Problem

The current pagination layout breaks on mobile devices because it uses `justify-between` with `flex-1`, forcing all controls to stay on a single horizontal line. This causes:

- Cramped controls on small screens
- Potential overflow or text wrapping issues
- Poor user experience on mobile devices
- Difficulty accessing pagination buttons

## The Solution

Replace the existing pagination section with a mobile-responsive layout that:
- Stacks controls vertically on mobile devices
- Uses responsive flex containers
- Provides better spacing and touch targets
- Maintains desktop functionality

## Files That Need This Fix

All migrated DataTable files currently have the old pagination layout:

- ✅ `ResourceQuotasDataTable.tsx` - **Fixed**
- ✅ `ReplicaSetsDataTable.tsx` - **Fixed**
- ✅ `ServicesDataTable.tsx` - **Fixed**
- 🔄 `PodsDataTable.tsx` - Needs fix
- 🔄 `DeploymentsDataTable.tsx` - Needs fix
- 🔄 `ApiResourcesDataTable.tsx` - Needs fix
- 🔄 `ConfigMapsDataTable.tsx` - Needs fix
- 🔄 `CronJobsDataTable.tsx` - Needs fix
- 🔄 `CSIDriversDataTable.tsx` - Needs fix
- 🔄 `DaemonSetsDataTable.tsx` - Needs fix
- 🔄 `EndpointsDataTable.tsx` - Needs fix
- 🔄 `EndpointSlicesDataTable.tsx` - Needs fix
- 🔄 `GatewaysDataTable.tsx` - Needs fix
- 🔄 `IngressClassesDataTable.tsx` - Needs fix
- 🔄 `JobsDataTable.tsx` - Needs fix
- 🔄 `LoadBalancersDataTable.tsx` - Needs fix
- 🔄 `NamespacesDataTable.tsx` - Needs fix
- 🔄 `NetworkPoliciesDataTable.tsx` - Needs fix
- 🔄 `NodesDataTable.tsx` - Needs fix
- 🔄 `PersistentVolumeClaimsDataTable.tsx` - Needs fix
- 🔄 `PersistentVolumesDataTable.tsx` - Needs fix

## Step-by-Step Fix

### 1. Find the Pagination Section

Look for the pagination section in your DataTable file. It will look like this:

```tsx
{/* Pagination */}
<div className="flex items-center justify-between px-2">
  <div className="flex-1 text-sm text-muted-foreground">
    {table.getFilteredSelectedRowModel().rows.length} of{" "}
    {table.getFilteredRowModel().rows.length} row(s) selected.
  </div>
  <div className="flex items-center space-x-6 lg:space-x-8">
    <div className="flex items-center space-x-2">
      <p className="text-sm font-medium">Rows per page</p>
      <select
        value={`${table.getState().pagination.pageSize}`}
        onChange={(e) => {
          table.setPageSize(Number(e.target.value))
        }}
        className="h-8 w-[70px] rounded border border-input bg-background px-3 py-1 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
      >
        {[10, 20, 30, 40, 50].map((pageSize) => (
          <option key={pageSize} value={pageSize}>
            {pageSize}
          </option>
        ))}
      </select>
    </div>
    <div className="flex w-[100px] items-center justify-center text-sm font-medium">
      Page {table.getState().pagination.pageIndex + 1} of{" "}
      {table.getPageCount()}
    </div>
    <div className="flex items-center space-x-2">
      {/* Navigation buttons */}
    </div>
  </div>
</div>
```

### 2. Replace with Mobile-Responsive Layout

Replace the entire pagination section with this mobile-responsive version:

```tsx
{/* Pagination */}
<div className="flex flex-col gap-4 px-2 sm:flex-row sm:items-center sm:justify-between">
  <div className="text-sm text-muted-foreground">
    {table.getFilteredSelectedRowModel().rows.length} of{" "}
    {table.getFilteredRowModel().rows.length} row(s) selected.
  </div>
  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6 lg:gap-8">
    <div className="flex items-center space-x-2">
      <p className="text-sm font-medium">Rows per page</p>
      <select
        value={`${table.getState().pagination.pageSize}`}
        onChange={(e) => {
          table.setPageSize(Number(e.target.value))
        }}
        className="h-8 w-[70px] rounded border border-input bg-background px-3 py-1 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
      >
        {[10, 20, 30, 40, 50].map((pageSize) => (
          <option key={pageSize} value={pageSize}>
            {pageSize}
          </option>
        ))}
      </select>
    </div>
    <div className="flex items-center justify-between sm:justify-center sm:gap-6 lg:gap-8">
      <div className="flex w-[100px] items-center justify-center text-sm font-medium">
        Page {table.getState().pagination.pageIndex + 1} of{" "}
        {table.getPageCount()}
      </div>
      <div className="flex items-center space-x-2">
        <Button
          variant="outline"
          className="hidden h-8 w-8 p-0 lg:flex"
          onClick={() => table.setPageIndex(0)}
          disabled={!table.getCanPreviousPage()}
        >
          <span className="sr-only">Go to first page</span>
          <IconChevronsLeft />
        </Button>
        <Button
          variant="outline"
          className="size-8"
          size="icon"
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
        >
          <span className="sr-only">Go to previous page</span>
          <IconChevronLeft />
        </Button>
        <Button
          variant="outline"
          className="size-8"
          size="icon"
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
        >
          <span className="sr-only">Go to next page</span>
          <IconChevronRight />
        </Button>
        <Button
          variant="outline"
          className="hidden size-8 lg:flex"
          size="icon"
          onClick={() => table.setPageIndex(table.getPageCount() - 1)}
          disabled={!table.getCanNextPage()}
        >
          <span className="sr-only">Go to last page</span>
          <IconChevronsRight />
        </Button>
      </div>
    </div>
  </div>
</div>
```

## Key Changes Explained

### 1. Main Container
```tsx
// OLD
<div className="flex items-center justify-between px-2">

// NEW  
<div className="flex flex-col gap-4 px-2 sm:flex-row sm:items-center sm:justify-between">
```
- `flex-col gap-4`: Stack vertically on mobile with 16px gap
- `sm:flex-row sm:items-center sm:justify-between`: Horizontal layout on screens ≥640px

### 2. Selection Info
```tsx
// OLD
<div className="flex-1 text-sm text-muted-foreground">

// NEW
<div className="text-sm text-muted-foreground">
```
- Removes `flex-1` to prevent stretching issues
- Uses natural width for better mobile layout

### 3. Controls Container
```tsx
// OLD
<div className="flex items-center space-x-6 lg:space-x-8">

// NEW
<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6 lg:gap-8">
```
- `flex-col gap-4`: Stack controls vertically on mobile
- `sm:flex-row sm:items-center`: Horizontal layout on small screens and up
- Responsive gaps: 16px mobile, 24px small screens, 32px large screens

### 4. Page Info and Navigation
```tsx
// NEW
<div className="flex items-center justify-between sm:justify-center sm:gap-6 lg:gap-8">
```
- `justify-between`: Spread page info and buttons on mobile
- `sm:justify-center`: Center on larger screens
- Responsive gaps for proper spacing

## Responsive Behavior

### Mobile (< 640px)
```
┌─────────────────────────────────┐
│ 5 of 50 rows selected          │
│                                 │
│ Rows per page [10 ▼]           │
│                                 │
│ Page 1 of 5        [< > >> »]  │
└─────────────────────────────────┘
```

### Small Screens (640px - 1024px)  
```
┌─────────────────────────────────────────────────────┐
│ 5 of 50 rows selected                               │
│                                                     │
│ Rows per page [10 ▼]    Page 1 of 5    [< > >> »] │
└─────────────────────────────────────────────────────┘
```

### Large Screens (≥ 1024px)
```
┌───────────────────────────────────────────────────────────────────┐
│ 5 of 50 rows selected                                             │
│                                                                   │
│ Rows per page [10 ▼]      Page 1 of 5      [<< < > >> »]        │
└───────────────────────────────────────────────────────────────────┘
```

## Testing Checklist

After applying the fix, test these scenarios:

### Mobile Testing (< 640px)
- [ ] Selection info displays on its own line
- [ ] "Rows per page" selector has its own line
- [ ] Page info and navigation buttons are on the same line but properly spaced
- [ ] All buttons are easily tappable (min 44px touch target)
- [ ] No horizontal scrolling required

### Tablet Testing (640px - 1024px)
- [ ] Selection info is on top
- [ ] Controls are in a horizontal row below
- [ ] Proper spacing between elements
- [ ] First/last page buttons are hidden

### Desktop Testing (≥ 1024px)
- [ ] Selection info and controls are on the same line
- [ ] All navigation buttons are visible
- [ ] Generous spacing between elements
- [ ] Maintains existing desktop functionality

## Common Issues and Solutions

### Issue: Buttons too close together on mobile
**Solution:** The `justify-between` in the page info container ensures proper spacing.

### Issue: Select dropdown too narrow
**Solution:** The `w-[70px]` maintains consistent width across screen sizes.

### Issue: Page count text wrapping
**Solution:** The `w-[100px]` container prevents text wrapping.

### Issue: Touch targets too small
**Solution:** The `size-8` class ensures buttons are at least 32px, and natural spacing provides adequate touch area.

## Example Implementation

See `ResourceQuotasDataTable.tsx` or `ReplicaSetsDataTable.tsx` for complete working examples of the mobile-responsive pagination.

## Notes

- This fix is backward compatible and doesn't affect existing functionality
- All existing props and event handlers remain the same
- The fix only changes the visual layout and responsive behavior
- No additional dependencies or imports are required
- The fix maintains accessibility features (screen reader labels, keyboard navigation)

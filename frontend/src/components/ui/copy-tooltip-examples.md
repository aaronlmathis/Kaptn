# CopyTooltip Component Usage Examples

## Basic Usage
```tsx
import { CopyTooltip } from "@/components/ui/copy-tooltip"

<CopyTooltip message="This is the full message that will be shown in the tooltip">
  <div className="truncate max-w-[200px]">
    This is the full message...
  </div>
</CopyTooltip>
```

## Advanced Usage
```tsx
<CopyTooltip 
  message="Full log message here"
  copyText="Custom text to copy to clipboard" // Optional: different text for clipboard
  side="right" // Position: top, right, bottom, left
  maxWidth="600px" // Custom max width
  contentClassName="bg-red-50" // Custom styling
  messageClassName="text-blue-600" // Custom message styling
  successDuration={3000} // Show checkmark for 3 seconds
  copyButtonTitle="Copy this message" // Custom tooltip for copy button
  showCopyButton={false} // Hide copy button if needed
>
  <span className="cursor-pointer hover:underline">
    Click to see details
  </span>
</CopyTooltip>
```

## Data Table Example
```tsx
const columns = [
  {
    accessorKey: "description",
    header: "Description", 
    cell: ({ row }) => (
      <CopyTooltip message={row.original.description}>
        <div className="truncate max-w-[300px]" title={row.original.description}>
          {row.original.description}
        </div>
      </CopyTooltip>
    )
  }
]
```

## Props Reference
- `message`: The text content to display in tooltip and copy
- `children`: The trigger element (usually truncated text)
- `copyText?`: Optional custom text for clipboard (defaults to message)
- `side?`: Tooltip position - "top" | "right" | "bottom" | "left"
- `maxWidth?`: Maximum width of tooltip content
- `contentClassName?`: Additional CSS classes for tooltip content
- `messageClassName?`: Additional CSS classes for message display
- `successDuration?`: Duration to show success state (default: 2000ms)
- `copyButtonTitle?`: Custom title for copy button
- `showCopyButton?`: Whether to show copy button (default: true)

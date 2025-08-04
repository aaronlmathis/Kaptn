import * as React from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { IconEdit, IconRefresh, IconLoader, IconCircleCheckFilled } from "@tabler/icons-react"
import { useIsMobile } from "@/hooks/use-mobile"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"
import { DetailRows } from "@/components/ResourceDetailDrawer"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { ResourceYamlEditor } from "@/components/ResourceYamlEditor"
import { type ReplicaSetTableRow } from "@/lib/schemas/replicaset"
import { useReplicaSetDetails } from "@/hooks/use-resource-details"

// Status badge helper for ReplicaSets
function getReadyBadge(ready: string) {
  const [current, desired] = ready.split("/").map(Number)
  const isReady = current === desired && desired > 0

  if (isReady) {
    return (
      <Badge variant="outline" className="text-green-600 border-border bg-transparent px-1.5">
        <IconCircleCheckFilled className="size-3 fill-green-600 mr-1" />
        {ready}
      </Badge>
    )
  } else {
    return (
      <Badge variant="outline" className="text-yellow-600 border-border bg-transparent px-1.5">
        <IconLoader className="size-3 text-yellow-600 mr-1" />
        {ready}
      </Badge>
    )
  }
}

interface ReplicaSetDetailDrawerProps {
  replicaSet: ReplicaSetTableRow | null
  open: boolean
  onClose: (open: boolean) => void
}

/**
 * Controlled ReplicaSetDetailDrawer that can be opened programmatically.
 * This shows full ReplicaSet details from the detailed API endpoint instead of the condensed version.
 */
export function ReplicaSetDetailDrawer({ replicaSet, open, onClose }: ReplicaSetDetailDrawerProps) {
  const isMobile = useIsMobile()

  // Fetch detailed ReplicaSet information - always call hooks at top level
  const { data: replicaSetDetails, loading, error } = useReplicaSetDetails(
    replicaSet?.namespace || "",
    replicaSet?.name || "",
    open && !!replicaSet
  )

  // Additional detailed rows from API (when available) - moved to top to avoid conditional hook calls
  const detailedRows: Array<[string, React.ReactNode]> = React.useMemo(() => {
    if (!replicaSetDetails) return []

    const additionalRows: Array<[string, React.ReactNode]> = []

    // Add additional details from the full ReplicaSet spec and status
    if (replicaSetDetails.metadata?.labels) {
      const labelCount = Object.keys(replicaSetDetails.metadata.labels).length
      additionalRows.push(["Labels", <div className="text-sm">{labelCount} label(s)</div>])
    }

    if (replicaSetDetails.metadata?.annotations) {
      const annotationCount = Object.keys(replicaSetDetails.metadata.annotations).length
      additionalRows.push(["Annotations", <div className="text-sm">{annotationCount} annotation(s)</div>])
    }

    if (replicaSetDetails.spec?.replicas) {
      additionalRows.push(["Desired Replicas", <div className="font-mono text-sm">{replicaSetDetails.spec.replicas}</div>])
    }

    if (replicaSetDetails.spec?.selector?.matchLabels) {
      const selectorCount = Object.keys(replicaSetDetails.spec.selector.matchLabels).length
      additionalRows.push(["Selector", <div className="text-sm">{selectorCount} label(s)</div>])
    }

    if (replicaSetDetails.spec?.volumeClaimTemplates) {
      const vctCount = replicaSetDetails.spec.volumeClaimTemplates.length
      additionalRows.push(["Volume Claim Templates", <div className="text-sm">{vctCount} template(s)</div>])
    }

    if (replicaSetDetails.spec?.podManagementPolicy) {
      additionalRows.push(["Pod Management Policy", <div className="font-mono text-sm">{replicaSetDetails.spec.podManagementPolicy}</div>])
    }

    if (replicaSetDetails.status?.currentRevision) {
      additionalRows.push(["Current Revision", <div className="font-mono text-sm break-all">{replicaSetDetails.status.currentRevision}</div>])
    }

    if (replicaSetDetails.status?.updateRevision) {
      additionalRows.push(["Update Revision", <div className="font-mono text-sm break-all">{replicaSetDetails.status.updateRevision}</div>])
    }

    if (replicaSetDetails.status?.observedGeneration) {
      additionalRows.push(["Observed Generation", <div className="font-mono text-sm">{replicaSetDetails.status.observedGeneration}</div>])
    }

    return additionalRows
  }, [replicaSetDetails])

  if (!replicaSet) return null

  // Basic rows from summary data (available immediately)
  const basicRows: Array<[string, React.ReactNode]> = [
    ["ReplicaSet Name", replicaSet.name],
    ["Namespace", (
      <Badge variant="outline" className="text-muted-foreground px-1.5">
        {replicaSet.namespace}
      </Badge>
    )],
    ["Ready Replicas", getReadyBadge(replicaSet.ready)],
    ["Current Replicas", <div className="font-mono text-sm">{replicaSet.current}</div>],
    ["Updated Replicas", <div className="font-mono text-sm">{replicaSet.updated}</div>],
    ["Service Name", <div className="font-mono text-sm">{replicaSet.serviceName}</div>],
    ["Update Strategy", (
      <Badge variant="outline" className="text-muted-foreground px-1.5">
        {replicaSet.updateStrategy}
      </Badge>
    )],
    ["Age", <div className="font-mono text-sm">{replicaSet.age}</div>],
  ]

  // Combine basic and detailed rows
  const allRows = [...basicRows, ...detailedRows]

  const actions = (
    <>
      <Button size="sm" className="w-full">
        <IconRefresh className="size-4 mr-2" />
        Scale ReplicaSet
      </Button>
      <Button variant="outline" size="sm" className="w-full">
        <IconRefresh className="size-4 mr-2" />
        Restart ReplicaSet
      </Button>
      <ResourceYamlEditor
        resourceName={replicaSet.name}
        namespace={replicaSet.namespace}
        resourceKind="ReplicaSet"
      >
        <Button variant="outline" size="sm" className="w-full">
          <IconEdit className="size-4 mr-2" />
          Edit YAML
        </Button>
      </ResourceYamlEditor>
    </>
  )

  return (
    <Drawer direction={isMobile ? "bottom" : "right"} open={open} onOpenChange={onClose}>
      <DrawerContent className="flex flex-col h-full">
        {/* Header with title/description */}
        <DrawerHeader className="flex justify-between items-start flex-shrink-0">
          <div className="space-y-1">
            <DrawerTitle>{replicaSet.name}</DrawerTitle>
            <DrawerDescription>
              {loading ? "Loading detailed ReplicaSet information..." : "Full ReplicaSet details and configuration"}
            </DrawerDescription>
          </div>
        </DrawerHeader>

        {/* Content area with styled scrolling */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="px-6 text-sm">
            {error ? (
              <div className="text-red-600 p-4 text-sm">
                ⚠️ Failed to load detailed information: {error}
                <div className="mt-2 text-muted-foreground">
                  Showing basic information from summary data.
                </div>
              </div>
            ) : null}

            <DetailRows rows={allRows} />

            {loading && (
              <div className="flex items-center justify-center py-4 text-muted-foreground">
                <IconLoader className="size-4 animate-spin mr-2" />
                Loading detailed information...
              </div>
            )}
          </div>
          <ScrollBar orientation="vertical" />
        </ScrollArea>

        {/* Footer with actions */}
        <DrawerFooter className="flex flex-col gap-2 px-6 pb-6 pt-4 flex-shrink-0">
          {actions}
          <DrawerClose asChild>
            <Button variant="outline" size="sm" className="w-full">
              Close
            </Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}

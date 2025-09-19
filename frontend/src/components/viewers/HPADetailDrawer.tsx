import * as React from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { IconEdit, IconLoader, IconPlus, IconTrash, IconSettings, IconAdjustmentsHorizontal } from "@tabler/icons-react"
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
import { IfAllowed } from "@/components/authz/IfAllowed"
import { useCluster } from "@/hooks/useCluster"
import { useHPADetails } from "@/hooks/use-resource-details"
import type { DashboardHPA } from "@/types/hpa"
import { bulkActionsApi } from "@/lib/api/bulk-actions"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Separator } from "@/components/ui/separator"

type KV = { key: string; value: string }

function statusBadge(status: DashboardHPA['status']) {
  switch (status) {
    case 'atMax':
      return <Badge variant="outline" className="text-orange-600 border-border bg-transparent px-1.5">At Max</Badge>
    case 'limited':
      return <Badge variant="outline" className="text-yellow-600 border-border bg-transparent px-1.5">Limited</Badge>
    case 'active':
      return <Badge variant="outline" className="text-blue-600 border-border bg-transparent px-1.5">Active</Badge>
    default:
      return <Badge variant="outline" className="text-muted-foreground border-border bg-transparent px-1.5">Idle</Badge>
  }
}

interface HPADetailDrawerProps {
  item: DashboardHPA | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function HPADetailDrawer({ item, open, onOpenChange }: HPADetailDrawerProps) {
  const isMobile = useIsMobile()
  const { clusterId } = useCluster()

  const namespace = item?.namespace || ""
  const name = item?.name || ""

  // Fetch detailed HPA information when open
  const { data: hpaDetails, loading, error } = useHPADetails(namespace, name, open && !!item)

  const [activeTab, setActiveTab] = React.useState("details")

  // Local editable state for metadata and scaling
  const [labelEntries, setLabelEntries] = React.useState<KV[]>([{ key: "", value: "" }])
  const [annotationEntries, setAnnotationEntries] = React.useState<KV[]>([{ key: "", value: "" }])
  const annotationRefs = React.useRef<Array<HTMLTextAreaElement | null>>([])
  const [minReplicas, setMinReplicas] = React.useState<number | undefined>(item?.min)
  const [maxReplicas, setMaxReplicas] = React.useState<number | undefined>(item?.max)
  const [savingMeta, setSavingMeta] = React.useState(false)
  const [savingScale, setSavingScale] = React.useState(false)

  // Initialize editable fields from fetched details
  React.useEffect(() => {
    if (!hpaDetails) return
    // Metadata
    const m = hpaDetails.metadata || {}
    const labels = (m as any).labels as Record<string, string> | undefined
    const annotations = (m as any).annotations as Record<string, string> | undefined
    const toEntries = (obj?: Record<string, string>): KV[] => {
      if (!obj) return [{ key: "", value: "" }]
      const entries = Object.entries(obj).map(([k, v]) => ({ key: k, value: String(v) }))
      return entries.length > 0 ? entries : [{ key: "", value: "" }]
    }
    setLabelEntries(toEntries(labels))
    setAnnotationEntries(toEntries(annotations))

    // Scaling
    const spec = hpaDetails.spec as any
    setMinReplicas(spec?.minReplicas ?? item?.min)
    setMaxReplicas(spec?.maxReplicas ?? item?.max)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hpaDetails])

  if (!item) return null

  const basicRows: Array<[string, React.ReactNode]> = [
    ["HPA", item.name],
    ["Namespace", (<Badge variant="outline" className="text-muted-foreground px-1.5">{item.namespace}</Badge>)],
    ["Target", <div className="font-mono text-sm break-all">{item.target}</div>],
    ["Min", <div className="font-mono text-sm">{String(item.min)}</div>],
    ["Max", <div className="font-mono text-sm">{String(item.max)}</div>],
    ["Desired", <div className="font-mono text-sm">{String(item.desired)}</div>],
    ["Current", <div className="font-mono text-sm">{String(item.current)}</div>],
    ["Status", statusBadge(item.status)],
  ]

  const detailedRows: Array<[string, React.ReactNode]> = React.useMemo(() => {
    if (!hpaDetails) return []
    const rows: Array<[string, React.ReactNode]> = []

    const summary = hpaDetails.summary
    if (summary?.lastScaleTime) {
      rows.push(["Last Scale", <div className="text-sm">{new Date(summary.lastScaleTime).toLocaleString()}</div>])
    }
    if (summary?.primaryMetric) {
      const pm = summary.primaryMetric
      rows.push(["Primary Metric", (
        <div className="text-sm">
          <span className="font-mono">{pm.type}</span>
          {pm.resourceName ? <> • <span className="font-mono">{pm.resourceName}</span></> : null}
          {pm.targetDesc ? <> • <span className="font-mono">{pm.targetDesc}</span></> : null}
        </div>
      )])
    }

    // Metadata counts
    const md = hpaDetails.metadata as any
    if (md?.labels) {
      rows.push(["Labels", <div className="text-sm">{Object.keys(md.labels).length} label(s)</div>])
    }
    if (md?.annotations) {
      rows.push(["Annotations", <div className="text-sm">{Object.keys(md.annotations).length} annotation(s)</div>])
    }

    return rows
  }, [hpaDetails])

  const allRows = [...basicRows, ...detailedRows]

  // Handlers for metadata editing
  const addLabel = () => setLabelEntries((l) => [...l, { key: "", value: "" }])
  const removeLabel = (idx: number) => setLabelEntries((l) => l.filter((_, i) => i !== idx))
  const updateLabel = (idx: number, field: keyof KV, value: string) => setLabelEntries((l) => l.map((e, i) => i === idx ? { ...e, [field]: value } : e))

  const addAnnotation = () => setAnnotationEntries((a) => [...a, { key: "", value: "" }])
  const removeAnnotation = (idx: number) => setAnnotationEntries((a) => a.filter((_, i) => i !== idx))
  const updateAnnotation = (idx: number, field: keyof KV, value: string) => setAnnotationEntries((a) => a.map((e, i) => i === idx ? { ...e, [field]: value } : e))

  // Auto-size annotation textareas so the ScrollArea handles scrolling, not the textarea
  const autosizeAllAnnotations = React.useCallback(() => {
    annotationRefs.current.forEach((el) => {
      if (!el) return
      el.style.height = 'auto'
      el.style.height = `${Math.min(el.scrollHeight, 384)}px` // clamp to ~24rem
    })
  }, [])

  React.useEffect(() => {
    autosizeAllAnnotations()
  }, [annotationEntries, autosizeAllAnnotations])

  const toObject = (entries: KV[]): Record<string, string> => {
    const out: Record<string, string> = {}
    for (const { key, value } of entries) {
      if (key.trim() === "") continue
      out[key.trim()] = value
    }
    return out
  }

  const handleSaveMetadata = async () => {
    setSavingMeta(true)
    try {
      await bulkActionsApi.executeBulkAction('horizontalpodautoscalers', {
        action: 'patch',
        targets: [{ namespace, name }],
        params: {
          patchType: 'merge',
          patch: {
            metadata: {
              labels: toObject(labelEntries),
              annotations: toObject(annotationEntries),
            }
          }
        }
      })
    } finally {
      setSavingMeta(false)
    }
  }

  const handleSaveScaling = async () => {
    setSavingScale(true)
    try {
      const min = typeof minReplicas === 'number' ? minReplicas : undefined
      const max = typeof maxReplicas === 'number' ? maxReplicas : undefined
      await bulkActionsApi.executeBulkAction('horizontalpodautoscalers', {
        action: 'patch',
        targets: [{ namespace, name }],
        params: {
          patchType: 'merge',
          patch: {
            spec: {
              ...(min !== undefined ? { minReplicas: min } : {}),
              ...(max !== undefined ? { maxReplicas: max } : {}),
            }
          }
        }
      })
    } finally {
      setSavingScale(false)
    }
  }

  const handleDelete = async () => {
    if (!item) return
    if (!confirm(`Delete HorizontalPodAutoscaler "${item.name}" in namespace "${item.namespace}"? This cannot be undone.`)) return
    try {
      await bulkActionsApi.executeBulkAction('horizontalpodautoscalers', {
        action: 'delete',
        targets: [{ namespace: item.namespace, name: item.name }],
        force_confirm: true,
      })
      onOpenChange(false)
    } catch (e) {
      // Optionally surface an error toast; ApiClient already centralizes toasts for /actions
      // no-op
    }
  }

  const scaleInvalid = (typeof minReplicas === 'number' && typeof maxReplicas === 'number') ? (minReplicas > maxReplicas) : false

  const actions = (
    <>
      <IfAllowed
        feature="horizontalpodautoscalers.patch"
        cluster={clusterId}
        namespace={item.namespace}
        resourceName={item.name}
      >
        <ResourceYamlEditor
          resourceName={item.name}
          namespace={item.namespace}
          resourceKind="HorizontalPodAutoscaler"
        >
          <Button variant="outline" size="sm" className="w-full">
            <IconEdit className="size-4 mr-2" />
            Edit YAML
          </Button>
        </ResourceYamlEditor>
      </IfAllowed>

      <IfAllowed
        feature="horizontalpodautoscalers.delete"
        cluster={clusterId}
        namespace={item.namespace}
        resourceName={item.name}
      >
        <Button variant="destructive" size="sm" className="w-full" onClick={handleDelete}>
          <IconTrash className="size-4 mr-2" />
          Delete HorizontalPodAutoscaler
        </Button>
      </IfAllowed>
    </>
  )

  return (
    <Drawer direction={isMobile ? "bottom" : "right"} open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="flex flex-col h-full">
        <DrawerHeader className="flex justify-between items-start flex-shrink-0">
          <div className="space-y-1">
            <DrawerTitle>{item.name}</DrawerTitle>
            <DrawerDescription>
              {loading ? "Loading HPA details..." : "HorizontalPodAutoscaler details and configuration"}
            </DrawerDescription>
          </div>
        </DrawerHeader>

        <ScrollArea className="flex-1 min-h-0">
          <div className="px-6 text-sm h-full">
            {error ? (
              <div className="text-red-600 p-4 text-sm">
                ⚠️ Failed to load detailed information: {error}
                <div className="mt-2 text-muted-foreground">Showing basic information from summary data.</div>
              </div>
            ) : null}

            <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="details">Details</TabsTrigger>
                <TabsTrigger value="scaling">Scaling</TabsTrigger>
                <TabsTrigger value="metadata">Meta</TabsTrigger>
              </TabsList>

              <div className="flex-1 min-h-0 mt-4 overflow-hidden">
                <TabsContent value="details" className="h-full">
                  <ScrollArea className="h-full">
                    <div className="space-y-6">
                      <DetailRows rows={allRows} />

                      {/* Conditions section */}
                      {hpaDetails?.summary?.conditions && hpaDetails.summary.conditions.length > 0 && (
                        <div>
                          <h4 className="text-sm font-medium mb-2">Conditions</h4>
                          <div className="space-y-2">
                            {hpaDetails.summary.conditions.map((c, i) => (
                              <div key={i} className="border rounded-md p-3">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <Badge variant="outline" className="px-1.5 text-muted-foreground border-border bg-transparent">
                                      {c.type}
                                    </Badge>
                                    <Badge
                                      variant="outline"
                                      className={`px-1.5 ${c.status === 'True' ? 'text-green-600' : c.status === 'False' ? 'text-red-600' : 'text-yellow-600'} border-border bg-transparent`}
                                    >
                                      {c.status}
                                    </Badge>
                                  </div>
                                  {c.lastTransitionTime ? (
                                    <span className="text-xs text-muted-foreground">{new Date(c.lastTransitionTime).toLocaleString()}</span>
                                  ) : null}
                                </div>
                                {(c.reason || c.message) && (
                                  <div className="mt-2 text-xs text-muted-foreground">
                                    {c.reason && <div><span className="font-medium">Reason:</span> {c.reason}</div>}
                                    {c.message && <div className="mt-1 break-words"><span className="font-medium">Message:</span> {c.message}</div>}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {loading && (
                        <div className="flex items-center justify-center py-4 text-muted-foreground">
                          <IconLoader className="size-4 animate-spin mr-2" />
                          Loading detailed information...
                        </div>
                      )}
                    </div>
                    <ScrollBar orientation="vertical" />
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="scaling" className="h-full">
                  <ScrollArea className="h-full">
                    <div className="border rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <IconAdjustmentsHorizontal className="size-4 text-muted-foreground" />
                        <h3 className="text-sm font-medium">Scaling</h3>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label htmlFor="min-replicas">Min replicas</Label>
                          <Input
                            id="min-replicas"
                            type="number"
                            value={minReplicas ?? ''}
                            onChange={(e) => setMinReplicas(e.target.value === '' ? undefined : Number(e.target.value))}
                            placeholder="e.g. 1"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="max-replicas">Max replicas</Label>
                          <Input
                            id="max-replicas"
                            type="number"
                            value={maxReplicas ?? ''}
                            onChange={(e) => setMaxReplicas(e.target.value === '' ? undefined : Number(e.target.value))}
                            placeholder="e.g. 10"
                          />
                        </div>
                      </div>
                      {scaleInvalid && (
                        <div className="text-xs text-red-600 mt-2">Min replicas must be less than or equal to Max replicas.</div>
                      )}
                      <div className="mt-3">
                        <IfAllowed
                          feature="horizontalpodautoscalers.patch"
                          cluster={clusterId}
                          namespace={item.namespace}
                          resourceName={item.name}
                        >
                          <Button size="sm" onClick={handleSaveScaling} disabled={savingScale || scaleInvalid}>
                            {savingScale ? <IconLoader className="size-4 mr-2 animate-spin" /> : <IconSettings className="size-4 mr-2" />}
                            Save Scaling
                          </Button>
                        </IfAllowed>
                      </div>
                    </div>
                    <ScrollBar orientation="vertical" />
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="metadata" className="h-full">
                  <ScrollArea className="h-full">
                    <div className="border rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-4">
                        <IconSettings className="size-4 text-muted-foreground" />
                        <h3 className="text-sm font-medium">Labels & Annotations</h3>
                      </div>

                      {/* Labels */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-medium">Labels</h4>
                          <Button type="button" variant="outline" size="sm" onClick={addLabel}>
                            <IconPlus className="size-4 mr-2" /> Add Label
                          </Button>
                        </div>
                        <div className="space-y-2">
                          {labelEntries.map((kv, idx) => (
                            <div key={idx} className="flex gap-2 items-center">
                              <Input
                                placeholder="key (e.g., owner, app)"
                                value={kv.key}
                                onChange={(e) => updateLabel(idx, 'key', e.target.value)}
                                className="flex-1"
                              />
                              <Input
                                placeholder="value (e.g., team-a, 99)"
                                value={kv.value}
                                onChange={(e) => updateLabel(idx, 'value', e.target.value)}
                                className="flex-1"
                              />
                              {labelEntries.length > 1 && (
                                <Button type="button" variant="ghost" size="icon" onClick={() => removeLabel(idx)} className="text-red-600 hover:text-red-700">
                                  <IconTrash className="size-4" />
                                </Button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      <Separator className="my-4" />

                      {/* Annotations */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-medium">Annotations</h4>
                          <Button type="button" variant="outline" size="sm" onClick={addAnnotation}>
                            <IconPlus className="size-4 mr-2" /> Add Annotation
                          </Button>
                        </div>
                        <div className="space-y-4">
                          {annotationEntries.map((kv, idx) => (
                            <div key={idx} className="rounded-md border border-border p-3">
                              <div className="flex items-start gap-2">
                                <Input
                                  placeholder="key (e.g., slo, description)"
                                  value={kv.key}
                                  onChange={(e) => updateAnnotation(idx, 'key', e.target.value)}
                                  className="flex-1"
                                />
                                {annotationEntries.length > 1 && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => removeAnnotation(idx)}
                                    className="text-red-600 hover:text-red-700"
                                    aria-label="Remove annotation"
                                  >
                                    <IconTrash className="size-4" />
                                  </Button>
                                )}
                              </div>
                              <div className="mt-2">
                                <ScrollArea className="w-full h-40">
                                  <textarea
                                    ref={(el) => { annotationRefs.current[idx] = el }}
                                    placeholder="value (supports long, multi-line text)"
                                    value={kv.value}
                                    onChange={(e) => { updateAnnotation(idx, 'value', e.target.value); requestAnimationFrame(autosizeAllAnnotations) }}
                                    className="placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input w-full min-w-0 h-auto min-h-24 rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] resize-none"
                                  />
                                  <ScrollBar orientation="vertical" />
                                  <ScrollBar orientation="horizontal" />
                                </ScrollArea>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="mt-4 flex justify-end">
                        <IfAllowed
                          feature="horizontalpodautoscalers.patch"
                          cluster={clusterId}
                          namespace={item.namespace}
                          resourceName={item.name}
                        >
                          <Button size="sm" onClick={handleSaveMetadata} disabled={savingMeta}>
                            {savingMeta ? <IconLoader className="size-4 mr-2 animate-spin" /> : <IconSettings className="size-4 mr-2" />}
                            Save Metadata
                          </Button>
                        </IfAllowed>
                      </div>
                    </div>
                    <ScrollBar orientation="vertical" />
                  </ScrollArea>
                </TabsContent>
              </div>
            </Tabs>
          </div>
          <ScrollBar orientation="vertical" />
        </ScrollArea>

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

"use client"

import * as React from "react"
import { toast } from "sonner"
import * as yaml from "js-yaml"
import { IconCloudUpload, IconDotsVertical, IconDownload, IconFolderOpen, IconFileDiff, IconCircleCheck, IconX } from "@tabler/icons-react"
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { YamlEditor } from "@/components/ApplyDrawer/YamlEditor"
import { useApplyYaml } from "@/hooks/useApplyYaml"
import { useNamespace } from "@/contexts/namespace-context"

const DEFAULT_YAML = "# Paste or type the manifests you'd like to apply.\n# You can also load a local file from the menu.\n"

interface QuickApplyModalProps {
    trigger?: React.ReactNode
}

type ResultsTab = "summary" | "diff"

type ApplyOptions = {
    dryRun: boolean
    validate: boolean
    showDiff: boolean
    forceApply: boolean
    serverSideApply: boolean
    namespace?: string
}

export function QuickApplyModal({ trigger }: QuickApplyModalProps) {
    const [open, setOpen] = React.useState(false)
    const [yamlContent, setYamlContent] = React.useState<string>(DEFAULT_YAML)
    const fileInputRef = React.useRef<HTMLInputElement>(null)
    const [fileName, setFileName] = React.useState<string | null>(null)

    const { namespaces, selectedNamespace } = useNamespace()
    const namespaceOptions = React.useMemo(() => {
        const opts = [{ value: "default", label: "default" }]
        namespaces.forEach(ns => {
            if (ns.metadata.name !== "default") {
                opts.push({ value: ns.metadata.name, label: ns.metadata.name })
            }
        })
        return opts
    }, [namespaces])

    const {
        isLoading,
        isSuccess,
        error,
        response,
        applyConfig,
        resetState,
    } = useApplyYaml()

    const [resultsTab, setResultsTab] = React.useState<ResultsTab>("summary")

    const [applyOptions, setApplyOptions] = React.useState<ApplyOptions>({
        dryRun: true,
        validate: true,
        showDiff: true,
        forceApply: false,
        serverSideApply: false,
        namespace: selectedNamespace === "all" ? "default" : selectedNamespace,
    })

    React.useEffect(() => {
        if (!open) {
            return
        }
        setApplyOptions(prev => ({
            ...prev,
            namespace: selectedNamespace === "all" ? "default" : selectedNamespace,
        }))
    }, [selectedNamespace, open])

    const diffResources = React.useMemo(() => {
        if (!applyOptions.showDiff) return []
        return response?.resources?.filter(res => res.diff) ?? []
    }, [response, applyOptions.showDiff])

    const validationErrors = React.useMemo(() => response?.errors ?? [], [response])
    const warnings = React.useMemo(() => response?.warnings ?? [], [response])

    const resetDialogState = React.useCallback(() => {
        resetState()
        setYamlContent(DEFAULT_YAML)
        setFileName(null)
        setResultsTab("summary")
        setApplyOptions({
            dryRun: true,
            validate: true,
            showDiff: true,
            forceApply: false,
            serverSideApply: false,
            namespace: selectedNamespace === "all" ? "default" : selectedNamespace,
        })
    }, [resetState, selectedNamespace])

    const handleApply = React.useCallback(async () => {
        const trimmed = yamlContent.trim()
        if (!trimmed) {
            toast.error("YAML is empty", { description: "Add content or load a file before running." })
            return
        }

        try {
            await applyConfig({
                yamlContent,
                namespace: applyOptions.namespace === "default" ? undefined : applyOptions.namespace,
                dryRun: applyOptions.dryRun,
                force: applyOptions.forceApply,
                validate: applyOptions.validate,
                showDiff: applyOptions.showDiff,
                serverSide: applyOptions.serverSideApply,
            })
            setResultsTab("summary")
        } catch (err) {
            console.error("Quick apply failed", err)
        }
    }, [yamlContent, applyConfig, applyOptions])

    const handleOpenChange = React.useCallback((value: boolean) => {
        setOpen(value)
        if (!value) {
            resetDialogState()
        }
    }, [resetDialogState])

    const closeModal = React.useCallback(() => {
        handleOpenChange(false)
    }, [handleOpenChange])

    const handleDownload = () => {
        try {
            const blob = new Blob([yamlContent || ""], { type: "text/yaml;charset=utf-8" })
            const url = URL.createObjectURL(blob)
            const anchor = document.createElement("a")
            anchor.href = url
            anchor.download = fileName || "quick-apply.yaml"
            document.body.appendChild(anchor)
            anchor.click()
            anchor.remove()
            URL.revokeObjectURL(url)
        } catch (err) {
            console.error("Download failed", err)
            toast.error("Failed to download file")
        }
    }

    const handleOpenFile = () => {
        fileInputRef.current?.click()
    }

    const handleFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files
        if (!files || files.length === 0) {
            return
        }

        const file = files[0]
        try {
            const content = await file.text()
            setYamlContent(content)
            setFileName(file.name)
            toast.success("Loaded file", { description: file.name })
        } catch (err) {
            console.error("Failed to read file", err)
            toast.error("Unable to read selected file")
        } finally {
            event.target.value = ""
        }
    }

    const summary = response?.summary
    const hasResults = Boolean(response && (summary || validationErrors.length || warnings.length || diffResources.length))

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
                {trigger || (
                    <Button variant="default" size="sm" className="gap-2">
                        <IconCloudUpload className="size-4" />
                        Apply Config
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent
                showCloseButton={false}
                className="sm:max-w-[min(1150px,100vw-2rem)] xl:max-w-[1200px] h-[85vh] p-0 overflow-hidden"
            >
                <DialogTitle className="sr-only">Quick apply configuration</DialogTitle>
                <input
                    ref={fileInputRef}
                    className="hidden"
                    type="file"
                    accept=".yaml,.yml,.json"
                    onChange={handleFileSelected}
                />
                <div className="flex h-full flex-col">
                    <div className="flex items-center justify-between border-b border-border px-6 py-3">
                        <div className="flex items-center gap-3">
                            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                                <IconCloudUpload className="size-5" />
                            </span>
                            <div className="flex flex-col leading-tight">
                                <span className="text-sm font-semibold text-foreground">Quick Apply</span>
                                <span className="text-xs text-muted-foreground">Compose &amp; apply Kubernetes manifests</span>
                            </div>
                            {fileName && (
                                <div className="ml-3 flex items-center gap-2">
                                    <span className="text-muted-foreground">•</span>
                                    <span className="max-w-[220px] truncate text-xs font-mono text-muted-foreground">{fileName}</span>
                                </div>
                            )}
                        </div>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="text-muted-foreground hover:text-foreground"
                                >
                                    <IconDotsVertical className="size-4" />
                                    <span className="sr-only">Open menu</span>
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                                <DropdownMenuItem onClick={handleOpenFile}>
                                    <IconFolderOpen className="mr-2 size-4" />
                                    Open file…
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={handleDownload}>
                                    <IconDownload className="mr-2 size-4" />
                                    Download
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={closeModal}>
                                    <IconX className="mr-2 size-4" />
                                    Close
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>

                    <div className="flex flex-1 flex-col overflow-hidden px-6 py-4 gap-4 xl:flex-row">
                        <div className="flex-1 flex flex-col overflow-hidden gap-3">
                            {error && (
                                <Alert variant="destructive">
                                    <AlertTitle>Apply error</AlertTitle>
                                    <AlertDescription>{error}</AlertDescription>
                                </Alert>
                            )}
                            {response && isSuccess && summary && (
                                <Alert className="border-green-200 bg-green-50/60 dark:border-green-900/50 dark:bg-green-950/30">
                                    <AlertTitle className="flex items-center gap-2 text-green-900 dark:text-green-200">
                                        <IconCircleCheck className="size-4" />
                                        {applyOptions.dryRun ? "Dry run succeeded" : "Apply completed"}
                                    </AlertTitle>
                                    <AlertDescription className="text-sm text-green-800 dark:text-green-200">
                                        {summary.totalResources} resources • {summary.createdCount} created • {summary.updatedCount} updated • {summary.unchangedCount} unchanged
                                    </AlertDescription>
                                </Alert>
                            )}

                        <div className="flex-1 overflow-hidden rounded-lg border bg-card">
                            <YamlEditor
                                value={yamlContent}
                                onChange={setYamlContent}
                                height="420px"
                                className="h-full"
                            />
                        </div>

                            {hasResults && (
                                <div className="mt-1 space-y-4 overflow-y-auto">
                                    <Tabs value={resultsTab} onValueChange={(val) => setResultsTab(val as ResultsTab)}>
                                        <TabsList>
                                            <TabsTrigger value="summary">Summary</TabsTrigger>
                                            <TabsTrigger value="diff" disabled={!diffResources.length || !applyOptions.showDiff}>
                                                <IconFileDiff className="mr-2 size-4" /> Diff
                                            </TabsTrigger>
                                        </TabsList>
                                        <TabsContent value="summary" className="space-y-4">
                                            {summary && (
                                                <div className="rounded-lg border p-4 text-sm">
                                                    <div className="flex items-center justify-between">
                                                        <span>Total resources</span>
                                                        <span className="font-medium">{summary.totalResources}</span>
                                                    </div>
                                                    <div className="flex items-center justify-between">
                                                        <span>Created</span>
                                                        <span>{summary.createdCount}</span>
                                                    </div>
                                                    <div className="flex items-center justify-between">
                                                        <span>Updated</span>
                                                        <span>{summary.updatedCount}</span>
                                                    </div>
                                                    <div className="flex items-center justify-between">
                                                        <span>Unchanged</span>
                                                        <span>{summary.unchangedCount}</span>
                                                    </div>
                                                    {summary.errorCount > 0 && (
                                                        <div className="flex items-center justify-between text-destructive">
                                                            <span>Errors</span>
                                                            <span>{summary.errorCount}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {validationErrors.length > 0 && (
                                                <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
                                                    <h3 className="font-medium text-destructive">Validation errors</h3>
                                                    <ul className="mt-2 space-y-2 text-xs">
                                                        {validationErrors.map((err, idx) => (
                                                            <li key={idx} className="rounded border border-destructive/30 bg-destructive/10 p-2 text-destructive">
                                                                <div className="font-medium">{err.message}</div>
                                                                <div className="text-muted-foreground">
                                                                    {[err.resource, err.field && `field ${err.field}`, typeof err.line === "number" && `line ${err.line}`]
                                                                        .filter(Boolean)
                                                                        .join(" • ")}
                                                                </div>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}

                                            {warnings.length > 0 && (
                                                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                                                    <h3 className="font-medium">Warnings</h3>
                                                    <ul className="mt-2 space-y-2 text-xs">
                                                        {warnings.map((warning, idx) => (
                                                            <li key={idx} className="rounded border border-amber-200 bg-white/60 p-2">
                                                                {warning}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}
                                        </TabsContent>
                                        <TabsContent value="diff">
                                            {diffResources.length > 0 ? (
                                                <Accordion type="single" collapsible className="space-y-2">
                                                    {diffResources.map((resource, idx) => {
                                                        let renderedDiff = ""
                                                        try {
                                                            renderedDiff = yaml.dump(resource.diff ?? {}, { noRefs: true, lineWidth: -1 })
                                                        } catch {
                                                            renderedDiff = JSON.stringify(resource.diff, null, 2)
                                                        }
                                                        return (
                                                            <AccordionItem key={`${resource.name}-${idx}`} value={`${resource.name}-${idx}`} className="overflow-hidden rounded border">
                                                                <AccordionTrigger className="px-3 py-2 text-sm font-medium">
                                                                    {resource.kind}/{resource.name}
                                                                    <Badge variant="outline" className="ml-2 capitalize">
                                                                        {resource.action || "diff"}
                                                                    </Badge>
                                                                </AccordionTrigger>
                                                                <AccordionContent className="px-3 pb-3">
                                                                    <pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs">
                                                                        {renderedDiff || "No diff produced"}
                                                                    </pre>
                                                                </AccordionContent>
                                                            </AccordionItem>
                                                        )
                                                    })}
                                                </Accordion>
                                            ) : (
                                                <p className="text-sm text-muted-foreground">
                                                    {response ? "No differences detected." : "Run a dry run to preview diffs."}
                                                </p>
                                            )}
                                        </TabsContent>
                                    </Tabs>
                                </div>
                            )}
                        </div>

                        <div className="xl:w-72 xl:flex-shrink-0">
                            <div className="sticky top-0 space-y-4">
                                <div className="rounded-lg border p-4 space-y-4">
                                    <div className="space-y-2 text-sm">
                                        <Label htmlFor="qa-namespace" className="text-xs uppercase tracking-wide text-muted-foreground">Namespace</Label>
                                        <Select
                                            value={applyOptions.namespace || "default"}
                                            onValueChange={(value) =>
                                                setApplyOptions(prev => ({ ...prev, namespace: value }))
                                            }
                                        >
                                            <SelectTrigger id="qa-namespace">
                                                <SelectValue placeholder="Select namespace" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {namespaceOptions.map(option => (
                                                    <SelectItem key={option.value} value={option.value}>
                                                        {option.label}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="space-y-3 text-sm">
                                        <div className="flex items-center justify-between">
                                            <Label htmlFor="qa-dry-run">Dry run</Label>
                                            <Switch
                                                id="qa-dry-run"
                                                checked={applyOptions.dryRun}
                                                onCheckedChange={(checked) =>
                                                    setApplyOptions(prev => ({ ...prev, dryRun: checked }))
                                                }
                                            />
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <Label htmlFor="qa-validate">Validate</Label>
                                            <Switch
                                                id="qa-validate"
                                                checked={applyOptions.validate}
                                                onCheckedChange={(checked) =>
                                                    setApplyOptions(prev => ({ ...prev, validate: checked }))
                                                }
                                            />
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <Label htmlFor="qa-diff">Show diff</Label>
                                            <Switch
                                                id="qa-diff"
                                                checked={applyOptions.showDiff}
                                                onCheckedChange={(checked) =>
                                                    setApplyOptions(prev => ({ ...prev, showDiff: checked }))
                                                }
                                            />
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <Label htmlFor="qa-force">Force apply</Label>
                                            <Switch
                                                id="qa-force"
                                                checked={applyOptions.forceApply}
                                                onCheckedChange={(checked) =>
                                                    setApplyOptions(prev => ({ ...prev, forceApply: checked }))
                                                }
                                            />
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <Label htmlFor="qa-server">Server-side apply</Label>
                                            <Switch
                                                id="qa-server"
                                                checked={applyOptions.serverSideApply}
                                                onCheckedChange={(checked) =>
                                                    setApplyOptions(prev => ({ ...prev, serverSideApply: checked }))
                                                }
                                            />
                                        </div>
                                    </div>
                                </div>

                                {response?.resources && response.resources.length > 0 && (
                                    <div className="rounded-lg border p-4 space-y-3 text-sm">
                                        <div className="text-xs uppercase tracking-wide text-muted-foreground">Resources</div>
                                        <ul className="space-y-2">
                                            {response.resources.map((resource, idx) => (
                                                <li key={`${resource.kind}-${resource.name}-${idx}`} className="flex items-center justify-between rounded border px-3 py-2 text-xs">
                                                    <span className="truncate">
                                                        {resource.kind}
                                                        {resource.namespace ? ` ${resource.namespace}/` : " "}
                                                        {resource.name}
                                                    </span>
                                                    <Badge variant={resource.action?.includes("error") ? "destructive" : resource.action?.includes("update") ? "secondary" : "outline"} className="ml-2 capitalize">
                                                        {resource.action || "processed"}
                                                    </Badge>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center justify-between border-t px-6 py-4">
                        <div className="flex flex-col text-xs text-muted-foreground">
                            {fileName ? <span>Editing <span className="font-medium text-foreground">{fileName}</span></span> : <span>Blank workspace</span>}
                        </div>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                onClick={closeModal}
                                disabled={isLoading}
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={handleApply}
                                disabled={isLoading}
                                className="gap-2"
                            >
                                {isLoading ? (
                                    applyOptions.dryRun ? "Running dry run…" : "Applying…"
                                ) : (
                                    applyOptions.dryRun ? "Run dry run" : "Apply"
                                )}
                            </Button>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}

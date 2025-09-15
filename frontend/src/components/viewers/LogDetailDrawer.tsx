import * as React from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DetailRows } from "@/components/ResourceDetailDrawer"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import type { LogEntry } from "@/api/logs"

type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR" | "FATAL"

const LOG_LEVEL_COLORS: Record<LogLevel, string> = {
  DEBUG: "text-muted-foreground",
  INFO: "text-blue-600",
  WARN: "text-yellow-600",
  ERROR: "text-red-600",
  FATAL: "text-red-800 font-bold",
}

function LevelBadge({ level }: { level: string }) {
  const L = (level || "").toUpperCase() as LogLevel
  return (
    <Badge variant="outline" className={`font-mono text-xs ${LOG_LEVEL_COLORS[L] || "text-foreground"}`}>
      {L}
    </Badge>
  )
}

export interface LogDetailDrawerProps {
  entry: LogEntry | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function LogDetailDrawer({ entry, open, onOpenChange }: LogDetailDrawerProps) {
  if (!entry) return null

  const rows: Array<[string, React.ReactNode]> = [
    ["Timestamp", <div className="font-mono text-sm">{new Date(entry.ts).toLocaleString()}</div>],
    ["Level", <LevelBadge level={entry.level} />],
    ["Namespace", <Badge variant="outline" className="text-muted-foreground px-1.5">{entry.namespace}</Badge>],
    ["Pod", <div className="font-mono text-sm break-all">{entry.pod}</div>],
    ["Container", <div className="font-mono text-sm break-all">{entry.container}</div>],
    ["Node", <div className="font-mono text-sm break-all">{entry.node}</div>],
    ["Workload", <div className="font-mono text-sm break-all">{entry.workload}</div>],
    ["Cluster", <div className="font-mono text-sm break-all">{entry.cluster}</div>],
  ]

  if (entry.trace_id) rows.push(["Trace ID", <div className="font-mono text-xs break-all">{entry.trace_id}</div>])
  if (entry.span_id) rows.push(["Span ID", <div className="font-mono text-xs break-all">{entry.span_id}</div>])

  return (
    <Drawer direction={typeof window !== 'undefined' && window.innerWidth < 768 ? "bottom" : "right"} open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="flex flex-col h-full">
        <DrawerHeader className="flex justify-between items-start flex-shrink-0">
          <div className="space-y-1">
            <DrawerTitle className="flex items-center gap-2">
              <LevelBadge level={entry.level} />
              <span className="font-mono text-sm truncate max-w-[420px]" title={`${entry.namespace}/${entry.pod}`}>{entry.namespace}/{entry.pod}</span>
            </DrawerTitle>
            <DrawerDescription>
              Full log details
            </DrawerDescription>
          </div>
        </DrawerHeader>

        <ScrollArea className="flex-1 min-h-0">
          <div className="px-6 text-sm space-y-6">
            <DetailRows rows={rows} />

            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">Message</h4>
              <div className="bg-muted p-4 rounded-md border">
                <pre className="text-sm whitespace-pre-wrap break-words leading-relaxed">{entry.msg}</pre>
              </div>
            </div>
          </div>
          <ScrollBar orientation="vertical" />
        </ScrollArea>

        <DrawerFooter className="flex flex-col gap-2 px-6 pb-6 pt-4 flex-shrink-0">
          <DrawerClose asChild>
            <Button variant="outline" size="sm" className="w-full">Close</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}


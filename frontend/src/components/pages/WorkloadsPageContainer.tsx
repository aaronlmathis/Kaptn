"use client";

import * as React from "react";
import { RouteGuard } from "@/components/authz";
import { useNavigation } from "@/contexts/navigation-context";
import { usePods } from "@/hooks/use-k8s-data";
import { useHPAsWithWebSocket } from "@/hooks/useHPAsWithWebSocket";
import { useEventsWithWebSocket } from "@/hooks/useEventsWithWebSocket";
import { useClusterTimeseries } from "@/hooks/useClusterTimeseries";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { MetricAreaChart, MetricBarChart, type ChartSeries } from "@/components/opsview/charts";
import { SectionHealthFooter } from "@/components/opsview/SectionHealthFooter";
// Lightweight relative-time formatter to avoid pulling additional deps
function formatRelativeAge(input?: string): string {
  if (!input) return "";
  const t = new Date(input).getTime();
  if (!Number.isFinite(t)) return "";
  const diffMs = Date.now() - t;
  const s = Math.max(1, Math.floor(diffMs / 1000));
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ago`;
  if (h > 0) return `${h}h ago`;
  if (m > 0) return `${m}m ago`;
  return `${s}s ago`;
}

function useLatestValue(series: ChartSeries[]) {
  if (!series || series.length === 0) return undefined;
  // Find the last point of the first series by default
  const s = series[0];
  if (!s || !s.data || s.data.length === 0) return undefined;
  const [, v] = s.data[s.data.length - 1];
  return Number.isFinite(v) ? v : undefined;
}

function WorkloadsContent() {
  const { setPageTitle, isHydrated } = useNavigation();

  React.useEffect(() => {
    if (isHydrated) setPageTitle("Workloads");
  }, [isHydrated, setPageTitle]);

  // Data hooks
  const { data: pods = [] } = usePods();
  const { data: hpas = [] } = useHPAsWithWebSocket(true);
  const { data: events = [] } = useEventsWithWebSocket(true);

  const cpuSeries = useClusterTimeseries([
    'cluster.cpu.used.cores',
    'cluster.cpu.capacity.cores',
  ]);
  const memSeries = useClusterTimeseries([
    'cluster.mem.used.bytes',
    'cluster.mem.allocatable.bytes',
  ]);

  // Compute quick stats
  const pendingPods = React.useMemo(() => pods.filter(p => p.status === 'Pending').length, [pods]);
  const topFailing = React.useMemo(() => {
    const sorted = [...pods].sort((a, b) => (b.restarts || 0) - (a.restarts || 0));
    return sorted.slice(0, 5);
  }, [pods]);

  const [eventsTab, setEventsTab] = React.useState<'problems' | 'events' | 'logs'>('problems');
  const [search, setSearch] = React.useState('');

  const filteredProblems = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return events
      .filter(e => (e.type === 'Warning' || e.level === 'Warning' || e.level === 'Error'))
      .filter(e => !q || e.message.toLowerCase().includes(q) || e.name.toLowerCase().includes(q));
  }, [events, search]);

  // Derived info for SectionHealthFooters
  const cpuUsed = useLatestValue(cpuSeries.series.filter(s => s.key === 'cluster.cpu.used.cores'));
  const cpuCap = useLatestValue(cpuSeries.series.filter(s => s.key === 'cluster.cpu.capacity.cores'));
  const memUsed = useLatestValue(memSeries.series.filter(s => s.key === 'cluster.mem.used.bytes'));
  const memAlloc = useLatestValue(memSeries.series.filter(s => s.key === 'cluster.mem.allocatable.bytes'));
  const cpuPct = cpuUsed && cpuCap ? Math.max(0, Math.min(1, cpuUsed / cpuCap)) : undefined;
  const memPct = memUsed && memAlloc ? Math.max(0, Math.min(1, memUsed / memAlloc)) : undefined;

  // HPAs at or near max
  const hpasHot = React.useMemo(() => {
    return hpas.filter(h => h.status === 'atMax' || h.status === 'limited').slice(0, 5);
  }, [hpas]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 px-4 lg:px-6">
      {/* Recent Events & Logs */}
      <Card className="rounded-2xl border border-gray-100">
        <CardHeader>
          <CardTitle className="text-base">Recent Events & Logs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Tabs value={eventsTab} onValueChange={(v) => setEventsTab(v as any)}>
            <div className="flex items-center justify-between gap-2">
              <TabsList>
                <TabsTrigger value="problems">Problems</TabsTrigger>
                <TabsTrigger value="events">Events</TabsTrigger>
                <TabsTrigger value="logs">Logs</TabsTrigger>
              </TabsList>
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search message…"
                className="h-8 w-48"
              />
            </div>
            <Separator />
            <TabsContent value="problems" className="space-y-2">
              {filteredProblems.length === 0 ? (
                <div className="text-sm text-muted-foreground">No recent problems</div>
              ) : (
                <ul className="space-y-2">
                  {filteredProblems.slice(0, 12).map((e, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <Badge variant="destructive" className="shrink-0">{e.type || e.level || 'Warn'}</Badge>
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{e.reason} — {e.name}</div>
                        <div className="text-xs text-muted-foreground truncate">{e.message}</div>
                      </div>
                      <div className="ml-auto text-xs text-muted-foreground">
                        {e.age || (e?.lastTimestamp ? formatRelativeAge(e.lastTimestamp) : '')}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>
            <TabsContent value="events" className="space-y-2">
              {(events || []).slice(0, 12).map((e, idx) => (
                <div key={idx} className="flex items-start gap-2">
                  <Badge variant="outline" className="shrink-0">{e.type}</Badge>
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{e.reason} — {e.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{e.message}</div>
                  </div>
                  <div className="ml-auto text-xs text-muted-foreground">{e.age}</div>
                </div>
              ))}
            </TabsContent>
            <TabsContent value="logs" className="space-y-2">
              <div className="text-sm text-muted-foreground">Logs view coming soon</div>
              <Button asChild variant="link" className="px-0 h-6">
                <a href="/logs">Open Logs page →</a>
              </Button>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Workload Health Overview (CPU) */}
      <MetricAreaChart
        title="CPU Utilization"
        series={cpuSeries.series as unknown as ChartSeries[]}
        unit="cores"
        showGrid
        emptyMessage="No CPU data"
        footerExtra={
          <SectionHealthFooter
            tone={typeof cpuPct === 'number' && cpuPct > 0.85 ? 'crit' : cpuPct && cpuPct > 0.7 ? 'warn' : 'ok'}
            summary={typeof cpuPct === 'number' ? `CPU ${Math.round(cpuPct * 100)}% of capacity` : 'CPU usage' }
            usedPct={cpuPct}
            ratioPills={[
              { label: 'Used', value: cpuUsed?.toFixed(2) ?? '—' },
              { label: 'Capacity', value: cpuCap?.toFixed(2) ?? '—' },
            ]}
          />
        }
      />

      {/* Workload Health Overview (Memory) */}
      <MetricAreaChart
        title="Memory Utilization"
        series={memSeries.series as unknown as ChartSeries[]}
        unit="bytes"
        showGrid
        emptyMessage="No memory data"
        footerExtra={
          <SectionHealthFooter
            tone={typeof memPct === 'number' && memPct > 0.85 ? 'crit' : memPct && memPct > 0.7 ? 'warn' : 'ok'}
            summary={typeof memPct === 'number' ? `Memory ${Math.round(memPct * 100)}% of capacity` : 'Memory usage' }
            usedPct={memPct}
            ratioPills={[
              { label: 'Used', value: memUsed ? Math.round(memUsed / (1024**3)) + ' GiB' : '—' },
              { label: 'Alloc', value: memAlloc ? Math.round(memAlloc / (1024**3)) + ' GiB' : '—' },
            ]}
          />
        }
      />

      {/* Top Failing Workloads */}
      <Card className="rounded-2xl border border-gray-100">
        <CardHeader>
          <CardTitle className="text-base">Top Failing Workloads</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {topFailing.length === 0 ? (
            <div className="text-sm text-muted-foreground">No restarts detected</div>
          ) : (
            <div className="space-y-2">
              {topFailing.map((p) => (
                <div key={`${p.namespace}/${p.name}`} className="flex items-center gap-2 text-sm">
                  <Badge variant="outline" className="min-w-[4ch] justify-center">{p.restarts}</Badge>
                  <div className="truncate">
                    <span className="font-medium">{p.name}</span>
                    <span className="text-muted-foreground"> · {p.namespace}</span>
                  </div>
                </div>
              ))}
              <Button asChild variant="link" className="px-0 h-6">
                <a href="/workloads/pods">View all pods →</a>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pending Pods / Scheduling Pressure */}
      <Card className="rounded-2xl border border-gray-100">
        <CardHeader>
          <CardTitle className="text-base">Pending Pods / Scheduling Pressure</CardTitle>
        </CardHeader>
        <CardContent>
          <SectionHealthFooter
            tone={pendingPods > 20 ? 'crit' : pendingPods > 5 ? 'warn' : 'ok'}
            summary={`${pendingPods} pending pods`}
            ratioPills={[{ label: 'Pending', value: String(pendingPods), tone: pendingPods > 0 ? 'warn' : 'ok' }]}
          >
            Investigate node resource pressure or insufficient capacity
          </SectionHealthFooter>
        </CardContent>
      </Card>

      {/* HPAs at/near max */}
      <Card className="rounded-2xl border border-gray-100">
        <CardHeader>
          <CardTitle className="text-base">HPAs at/near max</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {hpasHot.length === 0 ? (
            <div className="text-sm text-muted-foreground">No HPAs at limits</div>
          ) : (
            <ul className="space-y-1">
              {hpasHot.map((h) => (
                <li key={`${h.namespace}/${h.name}`} className="text-sm truncate">
                  <span className="font-medium">{h.name}</span>
                  <span className="text-muted-foreground"> · {h.namespace}</span>
                  <span className="ml-2 text-muted-foreground">({h.current}/{h.max} replicas)</span>
                </li>
              ))}
            </ul>
          )}
          <Button asChild variant="link" className="px-0 h-6">
            <a href="/workloads/hpas">View all HPAs →</a>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export function WorkloadsPageContainer() {
  return (
    <RouteGuard requiredCapabilities={["pods.list"]} requireAll={false}>
      <WorkloadsContent />
    </RouteGuard>
  );
}

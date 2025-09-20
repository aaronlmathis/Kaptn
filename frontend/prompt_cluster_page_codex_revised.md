
# Prompt: Implement and finalize the `/cluster` mini-dashboard

You are ChatGPT 5 Codex the best LLM coding agent on the market.. Modify a Astro/TypeScript/React (ShadCN + Recharts) codebase that lives under `frontend/src/`. Use the provided OpsView components as your reference to implement the `/cluster` page. Your goal is to ensure `/cluster` is a polished, data-backed mini-dashboard for cluster metrics, matching the design and functionality of OpsView.

## Source of Truth (review these files carefully)
- `frontend/src/components/opsview/charts.tsx`
  - Provides **ChartCard**, **MetricLineChart**, **MetricRadialChart**, and utility config/tooltip helpers【21:6†charts.tsx】【21:11†charts.tsx】.
  - All charts should be wrapped with `ChartCard` for consistency.

- `frontend/src/components/opsview/SectionHealthFooter.tsx`
  - Provides **SectionHealthFooter**, which supports `tone`, `summary`, `usedPct` bar, and `ratioPills` (e.g., Requested/Alloc, Used/Requested)【21:0†SectionHealthFooter.tsx】【21:16†SectionHealthFooter.tsx】.
  - Always include this in ChartCard footers when summarizing health/capacity.

- `frontend/src/components/opsview/sections/ClusterOverviewSection.tsx`
  - Canonical examples of **CPU Usage vs Requests vs Limits** and **Memory Usage vs Requests vs Limits** charts【21:15†ClusterOverviewSection.tsx】.
  - Uses `useLiveSeriesSubscription` for WebSocket timeseries data【21:2†ClusterOverviewSection.tsx】.
  - Builds rollup footers with `SectionHealthFooter`, ratio pills, and tones【21:9†ClusterOverviewSection.tsx】.

- `frontend/src/components/opsview/sections/NodeHealthHotspotsSection.tsx`
  - Example for **Node Health & Pressure**: subscribes to per-node series with `useLiveSeriesSubscription`, derives hotspot rows with CPU, Mem, FS%, pressures【21:5†NodeHealthHotspotsSection.tsx】.
  - Provides thresholds, summary cards, and per-node values【21:1†NodeHealthHotspotsSection.tsx】【21:7†NodeHealthHotspotsSection.tsx】【21:10†NodeHealthHotspotsSection.tsx】.

- `internal/timeseries/keys.go` - will give you an idea of what timeseries metric keys are available if you don't see what you need from opsview pages.

## Goals
1. **Use WebSocket Timeseries** (`useLiveSeriesSubscription`):
   - Connect to the same topics (`cluster.cpu.*`, `cluster.mem.*`, `node.*`) as in `ClusterOverviewSection` and `NodeHealthHotspotsSection`.
   - Ensure cleanup on unmount and consistent buffering/resolution.

2. **Replace `/cluster` line charts** with the **exact CPU and Memory charts** from `ClusterOverviewSection.tsx`:
   - **CPU Usage vs Requests vs Limits**
   - **Memory Usage vs Requests vs Limits**
   - Wrap in `ChartCard` and add `SectionHealthFooter` with `tone`, `summary`, `usedPct`, and ratio pills.

3. **Node Health & Pressure Heatmap**:
   - Implement a `ClusterNodeHealthSection` based on `NodeHealthHotspotsSection.tsx`.
   - Show per-node CPU%, Mem%, FS%, and pressure conditions (disk, mem, pid).
   - Render as a responsive grid of colored squares (heatmap). Each tile shows node short name + % + color-coded status.
   - Include a legend and wrap in `ChartCard` with a `SectionHealthFooter` rollup.

4. **Workloads by Namespace**:
   - Create a combo chart (horizontal bar + line overlay) showing top N workloads grouped by namespace.
   - Use **UniversalDataTable** for the drilldown table, matching all OpsView tables.
   - Columns: `namespace`, `workload`, `avg`, `p95`, `limit`, `% of limit`, `last seen`, `status`.
   - Add controls: metric selector (CPU/Memory), N selector (5/10), time range selector.

## Rules
- **Every chart** must be inside `ChartCard`.
- **Every summary** must use `SectionHealthFooter`.
- Use **MetricLineChart** and **MetricRadialChart** wrappers from `charts.tsx`, not raw Recharts.
- WebSocket topics and data transformations must exactly mirror OpsView sections.
- Use `formatCores`, `formatBytesIEC`, and related formatters from `metric-utils`.

## Implementation Plan
1. **Import WebSocket utilities** from OpsView sections and replace placeholder charts in `/cluster`.
2. **CPU/Memory charts**: copy series definitions, color scheme, footers from `ClusterOverviewSection.tsx`【21:15†ClusterOverviewSection.tsx】【21:9†ClusterOverviewSection.tsx】.
3. **Node Health & Pressure**: replicate thresholds and live subscription from `NodeHealthHotspotsSection.tsx`. Render grid heatmap + SectionHealthFooter rollup.
4. **Workloads by Namespace**: implement horizontal stacked bar + line overlay using `MetricBarChart`/`MetricLineChart`, add table with `UniversalDataTable`.
5. Ensure strict TypeScript (no `any`) and ESLint clean.

## Deliverables
- Updated `/cluster` page with:
  - CPU & Memory charts (ChartCard + SectionHealthFooter).
  - Node Health heatmap (ChartCard + SectionHealthFooter).
  - Workloads by Namespace (combo chart + UniversalDataTable).
- New files in `components/cluster/` (or `opsview/sections/Cluster*Section.tsx`) with barrel exports.
- Commit message:  
  `feat(cluster): add CPU/Memory charts, node health heatmap, workloads by namespace with ChartCard+Footer`

---

### Example Skeleton

```tsx
// components/cluster/ClusterCpuMemSection.tsx
import { MetricLineChart, ChartCard } from "@/components/opsview/charts";
import { SectionHealthFooter } from "@/components/opsview/SectionHealthFooter";
import { useLiveSeriesSubscription } from "@/hooks/useLiveSeries";

export default function ClusterCpuMemSection() {
  const { seriesData: live } = useLiveSeriesSubscription("cluster-cpu-mem", [
    "cluster.cpu.used.cores",
    "cluster.cpu.allocatable.cores",
    "cluster.cpu.requested.cores",
    "cluster.mem.used.bytes",
    "cluster.mem.allocatable.bytes",
    "cluster.mem.requested.bytes",
  ], { res: "lo", since: "1h", autoConnect: true });

  // build ChartSeries arrays exactly like ClusterOverviewSection
  // wrap in ChartCard + SectionHealthFooter
}
```

```tsx
// components/cluster/ClusterNodeHealthSection.tsx
import { ChartCard } from "@/components/opsview/charts";
import { SectionHealthFooter } from "@/components/opsview/SectionHealthFooter";
import { useLiveSeriesSubscription } from "@/hooks/useLiveSeries";

export default function ClusterNodeHealthSection() {
  // subscribe to node.* metrics as in NodeHealthHotspotsSection
  // render per-node grid squares + legend
  // footer: rollup summary
}
```

```tsx
// components/cluster/WorkloadsByNamespaceSection.tsx
import { ChartCard } from "@/components/opsview/charts";
import { UniversalDataTable } from "@/components/data_tables/UniversalDataTable";

export default function WorkloadsByNamespaceSection() {
  // derive top workloads, render combo chart + UniversalDataTable
}
```

---

**Do not deviate from OpsView conventions. Ensure consistency across colors, labels, tooltips, and summaries.**

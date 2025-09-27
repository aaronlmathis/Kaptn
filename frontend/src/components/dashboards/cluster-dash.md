Cluster dashboard: element-by-element
Hero row (spans both columns)

Cluster KPIs (4 cards)

Component: ShadCN cards with KPI, delta chevron, tiny sparkline (Apex line) in the footer.

Cards: Nodes Ready, Pods Running, Pending/Unschedulable Pods, API Error Rate (4xx/5xx from apiserver or kube-state-metrics proxy).

Interaction: Click anywhere → deep link to Nodes / Workloads / Events.

Why: Immediate posture + micro-trend.

Capacity vs Usage (combo chart)

Component: ApexCharts mixed (stacked bar for Requested/Allocatable, overlaid line for Actual Usage), grouped by CPU/Memory.

Placement: Right of KPIs if screen ≥ xl, otherwise below.

Interaction: Legend toggles; click “CPU” or “Memory” highlights series. Click data point → Metric Explorer pre-filtered.

Column A (left)

Node Health & Pressure

Component: Tall card with:

Top: Status pills (Ready/NotReady/Cordoned/Tainted counts).

Middle: Mini heatmap (Shadcn Chart heatmap) of nodes × signals (CPU, Mem, DiskPressure, PIDPressure), color-coded.

Bottom: “Worst 5 nodes” UniversalDataTable: name, pressure badge(s), utilization %, age since issue.

Interaction: Row click → Node detail. Hover cell → exact value + last change.

Workload Distribution by Namespace

Component: Horizontal bar chart (Apex bar) showing CPU and Memory per namespace (dual x-axes, stacked).

Secondary: Small table under chart: top 5 namespaces with pods count, restarts (24h), quota usage %.

Interaction: Click bar → jump to that Namespace page.

Pod Status Funnel

Component: Step/funnel chart or stacked bar showing Running / Pending / CrashLoopBackOff / ImagePullBackOff / Evicted.

Interaction: Click segment → opens Logs/Events tab with pre-filter (time = last 2h, severity = warn/error).

Column B (right)

API Server & Control Plane Health

Component: Compact 2×2 grid inside a card:

API latency p50/p95 line sparkline

Request rate line sparkline

Scheduler queue depth line sparkline

Controller-manager workqueue depth line sparkline

Interaction: Click sparkline → brings up a full-width modal chart with selectable window.

CRDs At a Glance

Component: Card with:

Top chips: total CRDs, Groups, Versions in use.

Body table: Top 8 CRDs by object count with version skew indicator (pill if multiple served/storage versions differ).

Interaction: Row → CRD detail list. Hover version pill → “served/storage versions”.

Events (Warnings/Errors)

Component: Live “event tape” list with severity icon, reason, involved object, namespace; capped at last N with “View all” link.

Controls: Simple filter bar (namespace dropdown, type=Warning/Error).

Interaction: Click event → drawer with full message and related objects.

Pod Restarts (last 24h)

Component: Small bar chart (top offenders), with a toggle for “by namespace” / “by workload”.

Interaction: Click bar → Workload detail (Logs tab focused).

Footer row (spans both columns)

Object Growth Over Time

Component: Multi-series line chart (Apex) for key object counts (Pods, Deployments, Services, CRs total). Soft colors; downsampled.

Why: Detect runaway creation or leak patterns.

Quick Links (Section Launchers)

Component: Link-cards grid (ShadCN): Nodes, Namespaces, CRDs, Events, Certificates/Admission (if present), Quotas.

Detail: Each card shows a tiny stat (e.g., “5 NotReady”, “2 Terminating namespaces”, “3 version skew”) computed from the same data.

UX polish that makes it feel “special”

Unified header controls: Scope (cluster/all ns), Resolution (low/med/high), and Live/Paused toggle—propagates to all charts via context.

Legend-as-filter: Clicking series everywhere dims others across the page for 3 seconds (coordinated highlight).

Drilldowns via drawers: Prefer right-side drawers for details to keep the dashboard in view.

Skeleton & shimmer states: For each card and chart on first load and during rescope.

Empty/subtle states: If no warnings, show a “quiet” message with a timestamp of last event.

Performance: Use ApexCharts dataPoints limits, throttle WebSocket merges, and windowing in lists.

Data wiring (sources you likely already have)

Metrics: your /api/v1/query timeseries for CPU/mem/requests/allocatable; node conditions; apiserver metrics; restarts per workload.

Inventory: /api/v1/agents (nodes), k8s discovery cache for CRDs/objects per NS.

Events: /api/v1/events (or k8s Events API proxy).

Pod status: kube-state-metrics or your own index.

Suggested grid

Row 1: [4 KPI cards] + [Capacity vs Usage combo] (2× width on xl)

Row 2: Left: Node Health & Pressure; Right: API/Control-plane

Row 3: Left: Workload by Namespace; Right: CRDs At a Glance

Row 4: Left: Pod Status Funnel; Right: Events

Row 5: [Object Growth Over Time] (full width)

Row 6: [Quick Links] (full width)
# Kaptn Logs Package — Developer Guide

This document explains how the `internal/logs` package is structured and how it behaves at runtime. It maps major files to their responsibilities and outlines expected behavior paths for ingest, storage, querying, and streaming.

## Overview
- Provides an in‑process, stateless logs cache with:
  - Ingestion from Kubernetes pods (informer-driven collector).
  - Bounded, TTL-evicted ring buffers with lightweight indexing.
  - Replay via HTTP queries and live streaming via an internal pub/sub bus.
  - Operational metrics and admin introspection APIs.
- No external datastore; all state is memory resident and disposable.

## Architecture & Data Flow
- Ingest path: Kubernetes → Collector → `ServiceV3.Ingest` → Rings + Index → Pub/Sub.
- Query path: HTTP handler → `ServiceV3.Replay` → Ring `Query` (global or scoped) → return entries.
- Stream path: WebSocket handler → `ServiceV3.Stream` → Bus subscription → entries pushed to client.
- Maintenance: Background workers evict expired entries, prune empty scoped rings, and update metrics.

## Key Files & Responsibilities
- `interfaces.go`
  - Core types and service interfaces:
    - `LogEntry`, `LogFilter` model log lines and query constraints.
    - `LogRing`, `LogBus`, `LogService` abstract storage, pub/sub, and high‑level service.
    - `ServiceStats`, `HealthStatus`, `AdminStats`, `RingStats`, `WorkerStats`, `AdminLimits` support metrics and admin views.

- `service_v3.go`
  - Primary implementation of `LogService`.
  - Holds the global ring and per‑scope rings; fans out to pub/sub bus.
  - Background workers:
    - Eviction: calls `EvictByTime(now)` on all rings.
    - Cleanup: removes empty scoped rings.
    - Metrics: updates Prometheus-facing gauges/counters.
  - Replay chooses the global ring, but may use a scoped ring (namespace/workload/pod) if it’s more selective.
  - Manages stream tracking (`activeStreams`) for admin introspection.
  - `SetupLogCollector(...)`: wires up the informer-driven `LogCollector` when background collection is enabled.

- `reliable_service.go`
  - Thin production wrapper around `ServiceV3` that exposes the same `LogService` interface and forwards calls. Keeps log messages centralized and separates construction concerns.

- `collector.go`
  - Kubernetes informer‑driven log collector. Watches pod lifecycle events, then either:
    - Streams pod container logs live (`Follow: true`), or
    - Polls recent lines at an interval (poll mode) using `SinceTime` + `TailLines`.
  - Per‑pod management (`PodLogStream`): starts/stops per‑container goroutines, tracks backoff/retries, last seen timestamps, and poll cursors.
  - Resiliency and housekeeping:
    - Exponential backoff when stream ends/errors; caps at `RestartMaxInterval`.
    - `cleanupWorker`: removes streams for pods no longer running or missing from the cache.
    - `reconcileWorker`: ensures all eligible pods have a stream; stops ineligible ones.
    - `statsWorker`: periodically logs collector stats.
  - Parsing behavior:
    - Reads K8s log format `RFC3339Nano + space + message`; falls back to `time.Now()` when parsing fails.
    - Extracts workload name from pod (heuristics for Deployment/StatefulSet/Job/CronJob patterns).
    - Extracts level by substring match, normalized to uppercase: `FATAL/ERROR/WARN/DEBUG/INFO` (default `INFO`).
    - Enforces `MaxLogLineBytes` via scanner buffer and truncation.
  - Namespace filtering via `IncludeNamespaces`/`ExcludeNamespaces` and `ExcludeSystemPods` (defaults to common system namespaces when enabled).

- `ring.go`
  - Bounded, TTL‑evicted ring buffer implementing `LogRing` with concurrent safety.
  - Appends normalize entries via `NormalizeLogEntry`.
  - Maintains a monotonic `index` per entry for stable ordering and performs:
    - `Query`: builds a plan from `LogIndex` and intersects candidates; falls back to linear scan when no index terms or when the index yields nothing; applies direction and limit.
    - `EvictByTime(now)`: evicts entries older than `now - maxAge` and prunes index structures accordingly.
    - `Bounds()`: oldest/newest timestamps currently present (for admin stats and health views).

- `index.go`
  - Lightweight, in‑memory indexing used by the ring:
    - Time buckets (minute granularity) → candidate index list.
    - Posting lists for `level`, `namespace`, `workload`, `pod`.
    - LRU cache for `trace_id` lookups (`TraceIndexLRU`).
  - `BuildQueryPlan` estimates index selectivity and orders intersections most‑selective first.
  - `ExecutePlan` returns candidate ring indices to validate against final filters (time precision or substring text).
  - Safe fallbacks: ring will linear‑scan if the plan has no index terms or yields empty candidates.

- `pubsub.go`
  - In‑process pub/sub `Bus` implementing `LogBus`.
  - `Subscribe`: returns a buffered channel and a cancel function (safe to call multiple times).
  - `Publish`: non‑blocking per subscriber; drops when a subscriber’s channel is full to avoid backpressure across the system.
  - `CleanupStaleSubscriptions(maxAge)`: removes subs with no recent deliveries.

- `metrics.go`, `prometheus.go`, `operational_logger.go`
  - `metrics.go`: Internal counters/gauges and roll‑up to `ServiceStats`.
  - `prometheus.go`: Exposes Prometheus collectors and helpers to record/query metrics.
  - `operational_logger.go`: Structured logging helpers for operator visibility (stream lifecycle, evictions, memory pressure, etc.).

- `test_config.go`
  - Provides `DefaultTestConfig()` for tests; shows typical defaults (TTL, ring sizes, guardrails).

## Configuration
`internal/config/config.go` builds `LogsServiceConfig` consumed by this package. Important fields:
- Global ring: `GlobalMaxEntries`, `GlobalMaxAge`.
- Scoped rings: `ScopeMaxEntries`, `ScopeMaxAge`.
- Bus/streaming: `MaxSubscribers`, `BufferSize`.
- Eviction/cleanup: `EvictionInterval`, `CleanupInterval`.
- Collector:
  - `BackgroundCollectionEnabled`, `BackgroundCollectionRetention`.
  - `BackgroundCollectionMode` (`stream` or `poll`), `BackgroundCollectionPollInterval`, `BackgroundCollectionTailLines`.
  - `MaxLogLineBytes`, `InformerResync`.
- Guardrails: `MaxStreamsPerUser`, `MaxQueryLimit`, `MaxExportSize`, `MaxConcurrentQueries`, `RateLimitPerSecond`, `BackpressureThreshold`, `DegradedModeTimeout`.

## Behavior & Semantics
- Log normalization (`filters.go`):
  - Ensures uppercase levels; sets `TS` if missing; derives `Workload` from `Pod` when absent; trims common fields.
- Query semantics:
  - `LogFilter` supports time range, levels, scope fields (`cluster/namespace/workload/pod`), full‑text substring (`Text`), `Limit`, and `Direction` (`forward`/`backward`).
  - Ring queries return time‑ordered results (ties broken by ring index). `backward` reverses order; `Limit` truncates.
  - Text search is case‑insensitive substring and is applied post‑indexing.
- Eviction & retention:
  - Rings evict entries strictly older than `now - maxAge`. Indexes are pruned to keep only valid indices.
  - Global and scoped rings use their configured capacities and TTL independently.
- Scoped rings:
  - Entries are appended to up to three scoped rings: namespace, workload, and pod. Queries can leverage scoped rings for faster replay when filters narrow scope.
- Pub/Sub behavior:
  - Fan‑out is non‑blocking. When a subscriber is slow, entries for that subscriber may be dropped by design to protect the system. The WebSocket bridge in the server compensates with periodic backfill.
- Collector modes:
  - `stream`: per‑container `Follow` stream with exponential backoff on disconnect.
  - `poll`: periodic fetch using `SinceTime` based on last seen timestamp; deduplicates on `TS`.
  - Both modes parse Kubernetes log lines and ingest `LogEntry` records immediately.
  - Streams are attached only for eligible pods (running phase, namespace filters, non‑system pods when configured).
- Health & stats:
  - `ServiceV3.Health()` reports `healthy/warning/unhealthy` based on start state, collector failure rate vs throughput, and global ring headroom.
  - `ServiceV3.Stats()` composes `ServiceStats` and augments with current ring sizes and active stream counts.
  - Admin views expose ring bounds and worker last‑run timestamps.

## Expected Runtime Behavior
- Default retention is typically 1 hour (configurable), aligning with the UI’s default backfill.
- Ring capacities default to large but bounded values (e.g., `GlobalMaxEntries` ~250k; `ScopeMaxEntries` ~20k) and are TTL‑evicted.
- Log line size is bounded (`MaxLogLineBytes`, default 256 KB); scanner truncates oversized lines defensively.
- The system is resilient to collector restarts and transient stream errors; ingestion resumes with backoff.
- Subscriptions are lightweight; stale subscriptions can be cleaned by age.

## Common Debugging Tips
- Validate config flowing into the service (constructed in `internal/config/config.go`).
- Check ring bounds/size via admin stats to confirm eviction and retention behavior.
- Enable debug logs for collector streams to see attach/detach/backoff events.
- If replay seems slow or empty:
  - Confirm `Since/Until` and `Direction/Limit` in `LogFilter`.
  - Remember: text search is substring on `Msg` and applied after index candidate selection.
  - Broad, time‑only queries use linear scan for correctness; scoped filters leverage indexes/posting lists.
- If live streaming drops messages: the bus drops on backpressure per subscriber by design; the WebSocket handler compensates with incremental backfill using the last seen timestamp.

## File Index
- Storage & Indexing: `ring.go`, `index.go`, `filters.go`
- Service Layer: `service_v3.go`, `reliable_service.go`, `interfaces.go`
- Collector: `collector.go`
- Pub/Sub: `pubsub.go`
- Metrics & Ops: `metrics.go`, `prometheus.go`, `operational_logger.go`
- Tests & Docs: `*_test.go`, `race_condition.md`, `test_config.go`


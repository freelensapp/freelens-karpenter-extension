/**
 * ScalingDecisions.tsx — Karpenter scaling decisions dashboard.
 *
 * Layout:
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │  Filter row (NodePool · time range · reason groups)          │
 *   ├──────────────────────────────────────────────────────────────┤
 *   │  Global TimelineChart  (stacked by reason group)             │
 *   ├──────────────────────────────────────────────────────────────┤
 *   │  Per-NodePool sparkline grid (click to filter)               │
 *   ├──────────────────────────────────────────────────────────────┤
 *   │  Pod Placement Decisions table  (linked to selected bucket)  │
 *   │  Node Decisions table                                        │
 *   └──────────────────────────────────────────────────────────────┘
 *
 * Bidirectional linking:
 *   - Click a chart bucket → table filtered to events in that time window,
 *     selected row scroll-into-view, vertical guide drawn on the chart.
 *   - Hover a table row    → chart highlights the bucket the event falls in.
 */
import { observer } from "mobx-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { COLOR, EVENT_REASON_CONFIG, EVENT_REASON_FALLBACK } from "../../config/theme";
import { getKubeEventStore, KubeEvent } from "../../k8s/core/karpenter-events-store";
import { getNodeStore, type Node } from "../../k8s/core/node-store";
import { getNodePoolStore, NodePool } from "../../k8s/karpenter/store";
import { getNodeClaimName } from "../../utils/kube-helpers";
import styles from "./scaling-decisions.module.scss";
import stylesInline from "./scaling-decisions.module.scss?inline";
import { TimelineChart, type TimelinePoint, type TimelineSeries } from "./timeline-chart";

// ── Helpers ──────────────────────────────────────────────────────────────────

function getAge(timestamp: string | undefined): string {
  if (!timestamp) return "—";
  const diff = Date.now() - new Date(timestamp).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "<1m";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function eventTs(event: KubeEvent): number {
  return new Date(
    (event as any).lastTimestamp || (event as any).eventTime || event.metadata?.creationTimestamp || 0,
  ).getTime();
}

// ── Karpenter event classification ───────────────────────────────────────────

const KARPENTER_KINDS = new Set(["NodePool", "NodeClaim", "Machine", "EC2NodeClass", "AKSNodeClass", "NodeClass"]);

const KARPENTER_NAMESPACES = new Set(["karpenter", "karpenter-system"]);

const KARPENTER_REASONS = new Set([
  "Provisioned",
  "Launched",
  "Registered",
  "Initialized",
  "NotLaunched",
  "NotRegistered",
  "NotInitialized",
  "Disrupted",
  "Disrupting",
  "Consolidated",
  "Drifted",
  "NominatedNode",
  "Nominated",
  "ScaledUp",
  "ScaledDown",
  "InsufficientCapacity",
  "Terminating",
  "Terminated",
  "FailedScheduling",
  "DisruptionBlocked",
]);

function isKarpenterEvent(event: KubeEvent): boolean {
  const src = (event.source?.component ?? "").toLowerCase();
  const rc = ((event as any).reportingComponent ?? "").toLowerCase();
  const kind = event.involvedObject?.kind ?? "";
  const ns = event.involvedObject?.namespace ?? "";
  const reason = event.reason ?? "";
  return (
    src.includes("karpenter") ||
    rc.includes("karpenter") ||
    KARPENTER_KINDS.has(kind) ||
    KARPENTER_NAMESPACES.has(ns) ||
    KARPENTER_REASONS.has(reason)
  );
}

function isPodEvent(e: KubeEvent): boolean {
  return e.involvedObject?.kind === "Pod";
}
function isNodeDecisionEvent(e: KubeEvent): boolean {
  const k = e.involvedObject?.kind;
  return k === "NodeClaim" || k === "Node" || k === "Machine";
}

function getEventGroup(e: KubeEvent): string {
  const cfg = EVENT_REASON_CONFIG[e.reason ?? ""] ?? EVENT_REASON_FALLBACK;
  return cfg.group;
}
function getEventColor(e: KubeEvent): string {
  const cfg = EVENT_REASON_CONFIG[e.reason ?? ""] ?? EVENT_REASON_FALLBACK;
  return cfg.color;
}

/** Best-effort: which NodePool does this event refer to? */
function getEventNodePool(e: KubeEvent, pools: NodePool[]): string {
  const labels = ((e as any).involvedObject?.labels ?? {}) as Record<string, string>;
  if (labels["karpenter.sh/nodepool"]) return labels["karpenter.sh/nodepool"];
  const name: string = e.involvedObject?.name ?? "";
  // NodePool kind itself
  if (e.involvedObject?.kind === "NodePool") return name;
  // NodeClaim / Node naming convention: <pool>-<suffix>.
  // Match longest pool name first so e.g. "ml-ms-abc" is attributed to
  // "ml-ms" and not to "ml" (both would match a plain prefix check).
  const sortedPools = [...pools].sort((a, b) => (b.metadata?.name?.length ?? 0) - (a.metadata?.name?.length ?? 0));
  for (const p of sortedPools) {
    const pn = p.metadata?.name ?? "";
    if (pn && name.startsWith(pn + "-")) return pn;
  }
  // Try to extract from message (e.g. "NodePool=foo")
  const m = (e.message ?? "").match(/NodePool[=:]\s*([\w.-]+)/);
  if (m) return m[1]!;
  return "";
}

// ── Reason groups available in the legend ────────────────────────────────────

const GROUP_DEFS: { key: string; label: string; color: string }[] = [
  { key: "scale-up", label: "Scale up", color: COLOR.success },
  { key: "scale-down", label: "Scale down", color: COLOR.terminating },
  { key: "drift", label: "Drift", color: COLOR.warning },
  { key: "error", label: "Errors", color: COLOR.danger },
  { key: "other", label: "Other", color: COLOR.textSecondary },
];

const TIME_RANGES = [
  { key: "1h", label: "1h", ms: 3600_000 },
  { key: "6h", label: "6h", ms: 6 * 3600_000 },
  { key: "24h", label: "24h", ms: 24 * 3600_000 },
  { key: "all", label: "All", ms: Infinity },
];

// ── Bucketing ────────────────────────────────────────────────────────────────

function pickBucketMs(rangeMs: number, eventCount: number): number {
  // Aim for ~30-60 buckets across the visible range.
  const target = 45;
  const raw = rangeMs / target;
  const candidates = [
    30_000, // 30s
    60_000, // 1m
    2 * 60_000, // 2m
    5 * 60_000, // 5m
    10 * 60_000, // 10m
    15 * 60_000, // 15m
    30 * 60_000, // 30m
    60 * 60_000, // 1h
    2 * 60 * 60_000,
    6 * 60 * 60_000,
    12 * 60 * 60_000,
    24 * 60 * 60_000,
  ];
  let best = candidates[0]!;
  for (const c of candidates) {
    if (c <= raw) best = c;
    else break;
  }
  // Clamp for tiny event counts so we don't render 100s of empty buckets.
  if (eventCount < 10 && best < 5 * 60_000) best = 5 * 60_000;
  return best;
}

function buildBuckets(
  events: KubeEvent[],
  startMs: number,
  endMs: number,
  bucketMs: number,
  groupOf: (e: KubeEvent) => string,
): TimelinePoint[] {
  const buckets = new Map<number, Record<string, number>>();
  const t0 = Math.floor(startMs / bucketMs) * bucketMs;
  const t1 = Math.ceil(endMs / bucketMs) * bucketMs;
  for (let t = t0; t <= t1; t += bucketMs) buckets.set(t, {});
  for (const e of events) {
    const ts = eventTs(e);
    if (ts < startMs || ts > endMs) continue;
    const t = Math.floor(ts / bucketMs) * bucketMs;
    const slot = buckets.get(t) ?? {};
    const g = groupOf(e);
    slot[g] = (slot[g] ?? 0) + 1;
    buckets.set(t, slot);
  }
  return [...buckets.entries()].sort(([a], [b]) => a - b).map(([t, counts]) => ({ t, counts }));
}

// ── Tables ───────────────────────────────────────────────────────────────────

interface DecisionTableProps {
  title: string;
  events: KubeEvent[];
  isPod: boolean;
  /** Highlighted bucket (ms) for visual emphasis on rows in window */
  highlightBucket: number | null;
  bucketMs: number;
  /** Notify hover so chart can underline the bucket */
  onHoverEvent?: (ts: number | null) => void;
  rowRefMap: Map<string, HTMLTableRowElement>;
}

const DecisionTable: React.FC<DecisionTableProps> = ({
  title,
  events,
  isPod,
  highlightBucket,
  bucketMs,
  onHoverEvent,
  rowRefMap,
}) => (
  <div className={styles.tableWrapper}>
    <div className={styles.tableTitle}>
      {title}
      <span className={styles.tableCountPill}>{events.length}</span>
    </div>
    <table className={styles.table}>
      <thead>
        <tr>
          <th>Type</th>
          <th>Reason</th>
          <th>From</th>
          <th>{isPod ? "Pod" : "Node / NodeClaim"}</th>
          <th>Message</th>
          <th>Age ↓</th>
        </tr>
      </thead>
      <tbody>
        {events.length === 0 && (
          <tr>
            <td colSpan={6} className={styles.empty}>
              No events match the current filters
            </td>
          </tr>
        )}
        {events.map((event, idx) => {
          const ts = eventTs(event);
          const inBucket = highlightBucket != null && ts >= highlightBucket && ts < highlightBucket + bucketMs;
          const uid = event.metadata?.uid ?? `${idx}`;
          return (
            <tr
              key={uid}
              ref={(el) => {
                if (el) rowRefMap.set(uid, el);
                else rowRefMap.delete(uid);
              }}
              className={inBucket ? styles.rowHighlighted : undefined}
              onMouseEnter={() => onHoverEvent?.(ts)}
              onMouseLeave={() => onHoverEvent?.(null)}
            >
              <td>
                <span className={event.type === "Warning" ? styles.typeWarning : styles.typeNormal}>{event.type}</span>
              </td>
              <td className={styles.reasonCell}>
                <span className={styles.reasonDot} style={{ background: getEventColor(event) }} />
                {event.reason}
              </td>
              <td className={styles.sourceCell}>
                {event.source?.component || (event as any).reportingComponent || "—"}
              </td>
              <td className={styles.nameCell}>
                {event.involvedObject?.namespace
                  ? `${event.involvedObject.namespace}/${event.involvedObject.name}`
                  : event.involvedObject?.name}
              </td>
              <td className={styles.messageCell}>{event.message}</td>
              <td className={styles.ageCell}>
                {getAge((event as any).lastTimestamp || (event as any).eventTime || event.metadata?.creationTimestamp)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);

// ── Main component ───────────────────────────────────────────────────────────

interface MetricPanelProps {
  title: string;
  subtitle?: string;
  points: TimelinePoint[];
  bucketMs: number;
  enabledGroups: Set<string>;
  toggleGroup: (k: string) => void;
  selectedBucket: number | null;
  onSelectBucket: (t: number | null) => void;
  externalHoverT: number | null;
  /** Optional: this panel is for a specific pool */
  poolName?: string;
  activePool?: string;
  onPoolToggle?: () => void;
  /** "events" → multi-series stacked by reason group (default).
   *  "nodes"  → single series with the live node count over time. */
  kind?: "events" | "nodes";
}

/** Grafana-style chart panel: header bar with title + metric tabs + optional
 *  pool selector, body with an area chart and crosshair tooltip. */
const MetricPanel: React.FC<MetricPanelProps> = ({
  title,
  subtitle,
  points,
  bucketMs,
  enabledGroups,
  toggleGroup,
  selectedBucket,
  onSelectBucket,
  externalHoverT,
  poolName,
  activePool,
  onPoolToggle,
  kind = "events",
}) => {
  // Series: events → one per enabled group; nodes → just one "Nodes" series.
  const visibleSeries: TimelineSeries[] =
    kind === "nodes"
      ? [{ key: "nodes", label: "Nodes", color: COLOR.info }]
      : GROUP_DEFS.filter((g) => enabledGroups.has(g.key)).map((g) => ({ key: g.key, label: g.label, color: g.color }));

  const isActivePool = poolName && activePool === poolName;

  return (
    <div className={`${styles.panel} ${isActivePool ? styles.panelActive : ""}`}>
      <div className={styles.panelHeader}>
        <div className={styles.panelTitleWrap}>
          <span className={styles.panelTitle}>{title}</span>
          {subtitle && <span className={styles.panelSubtitle}>{subtitle}</span>}
        </div>
        {onPoolToggle && (
          <button
            className={`${styles.panelPoolBtn} ${isActivePool ? styles.panelPoolBtnActive : ""}`}
            onClick={onPoolToggle}
            title={isActivePool ? "Clear NodePool filter" : `Filter to ${poolName}`}
          >
            {isActivePool ? "✓ filtered" : "filter"}
          </button>
        )}
      </div>

      {kind === "events" ? (
        <div className={styles.panelTabs}>
          <div className={styles.panelTabsLeft}>
            {GROUP_DEFS.map((g) => {
              const active = enabledGroups.has(g.key);
              return (
                <button
                  key={g.key}
                  className={`${styles.metricTab} ${active ? styles.metricTabActive : ""}`}
                  style={active ? { borderBottomColor: g.color, color: g.color } : undefined}
                  onClick={() => toggleGroup(g.key)}
                  title={`Toggle ${g.label}`}
                >
                  <span className={styles.metricTabDot} style={{ background: g.color }} />
                  {g.label}
                </button>
              );
            })}
          </div>
          <div className={styles.panelTabsRight}>
            {selectedBucket != null && (
              <button
                className={styles.clearBtn}
                onClick={() => onSelectBucket(null)}
                title="Clear selected time bucket"
              >
                ✕ bucket
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className={styles.panelTabs}>
          <div className={styles.panelTabsLeft}>
            <span
              className={`${styles.metricTab} ${styles.metricTabActive}`}
              style={{ borderBottomColor: COLOR.info, color: COLOR.info, cursor: "default" }}
            >
              <span className={styles.metricTabDot} style={{ background: COLOR.info }} />
              Node count
            </span>
          </div>
          <div className={styles.panelTabsRight}>
            <span className={styles.panelSubtitle}>Y: nodes · X: time</span>
            {selectedBucket != null && (
              <button
                className={styles.clearBtn}
                onClick={() => onSelectBucket(null)}
                title="Clear selected time bucket"
              >
                ✕ bucket
              </button>
            )}
          </div>
        </div>
      )}

      <div className={styles.panelBody}>
        <TimelineChart
          points={points}
          series={visibleSeries}
          bucketMs={bucketMs}
          mode="area"
          height={200}
          selectedT={selectedBucket}
          onSelectBucket={onSelectBucket}
          externalHoverT={externalHoverT}
        />
      </div>

      <div className={styles.panelLegend}>
        {visibleSeries.map((s) => (
          <span key={s.key} className={styles.panelLegendItem}>
            <span className={styles.panelLegendLine} style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
};

export const ScalingDecisions: React.FC = observer(() => {
  const [selectedPool, setSelectedPool] = useState<string>("");
  const [rangeKey, setRangeKey] = useState<string>("6h");
  const [enabledGroups, setEnabledGroups] = useState<Set<string>>(() => new Set(GROUP_DEFS.map((g) => g.key)));
  const [selectedBucket, setSelectedBucket] = useState<number | null>(null);
  const [hoveredTs, setHoveredTs] = useState<number | null>(null);

  const nodePoolStore = getNodePoolStore();
  const kubeEventStore = getKubeEventStore();
  const nodeStore = getNodeStore();

  const nodePools: NodePool[] = nodePoolStore.items;
  const allEvents: KubeEvent[] = kubeEventStore.items;
  const allNodes: Node[] = nodeStore.items;

  const rowRefMap = useRef(new Map<string, HTMLTableRowElement>()).current;

  // ── Karpenter-only events ──────────────────────────────────────────────────
  // NOTE: depend on the array reference (MobX produces a new array on store
  // updates) rather than `.length` — otherwise updates to existing events
  // (lastTimestamp ticking forward, label changes, …) wouldn't invalidate
  // downstream memos and the filter would silently work on stale timestamps.
  const karpenterEvents = useMemo(() => allEvents.filter(isKarpenterEvent), [allEvents]);

  // ── Group/pool annotation cache ────────────────────────────────────────────
  // Same staleness concern as above — depend on the actual arrays, not their
  // length, so refreshed timestamps propagate into `m.ts`.
  const eventMeta = useMemo(() => {
    const map = new Map<KubeEvent, { ts: number; group: string; pool: string }>();
    for (const e of karpenterEvents) {
      map.set(e, {
        ts: eventTs(e),
        group: getEventGroup(e),
        pool: getEventNodePool(e, nodePools),
      });
    }
    return map;
  }, [karpenterEvents, nodePools]);

  // ── Time range ─────────────────────────────────────────────────────────────
  // Memoize so `now`/`startMs`/`endMs` are stable identities across renders
  // (otherwise every render invalidates the bucketing memos below).
  const range = TIME_RANGES.find((r) => r.key === rangeKey) ?? TIME_RANGES[1]!;
  const { startMs, endMs } = useMemo(() => {
    const n = Date.now();
    const s = range.ms === Infinity ? Math.min(n, ...karpenterEvents.map(eventTs).filter((t) => t > 0)) : n - range.ms;
    return { startMs: s, endMs: n };
  }, [rangeKey, karpenterEvents]);

  // ── Filtered events (pool + group + range) ─────────────────────────────────
  const filteredEvents = useMemo(() => {
    return karpenterEvents.filter((e) => {
      const m = eventMeta.get(e);
      if (!m) return false;
      if (m.ts < startMs || m.ts > endMs) return false;
      if (!enabledGroups.has(m.group)) return false;
      if (selectedPool && m.pool !== selectedPool) return false;
      return true;
    });
  }, [karpenterEvents, eventMeta, enabledGroups, selectedPool, startMs, endMs]);

  const sortedFiltered = useMemo(() => [...filteredEvents].sort((a, b) => eventTs(b) - eventTs(a)), [filteredEvents]);

  // ── Bucketing ──────────────────────────────────────────────────────────────
  const bucketMs = useMemo(
    () => pickBucketMs(endMs - startMs, filteredEvents.length),
    [startMs, endMs, filteredEvents.length],
  );

  const globalPoints: TimelinePoint[] = useMemo(
    () => buildBuckets(filteredEvents, startMs, endMs, bucketMs, (e) => eventMeta.get(e)?.group ?? "other"),
    [filteredEvents, startMs, endMs, bucketMs, eventMeta],
  );

  // Per-pool sparklines: build once for *all* pools, ignoring pool filter so the
  // grid stays a stable navigator. Use range + group + total counts only.
  const perPoolPoints = useMemo(() => {
    const byPool = new Map<string, KubeEvent[]>();
    for (const e of karpenterEvents) {
      const m = eventMeta.get(e);
      if (!m) continue;
      if (m.ts < startMs || m.ts > endMs) continue;
      if (!enabledGroups.has(m.group)) continue;
      if (!m.pool) continue;
      (byPool.get(m.pool) ?? byPool.set(m.pool, []).get(m.pool)!).push(e);
    }
    const result: { pool: string; total: number; points: TimelinePoint[] }[] = [];
    for (const np of nodePools) {
      const name = np.metadata?.name ?? "";
      const evs = byPool.get(name) ?? [];
      result.push({
        pool: name,
        total: evs.length,
        points: buildBuckets(evs, startMs, endMs, bucketMs, (e) => eventMeta.get(e)?.group ?? "other"),
      });
    }
    return result.sort((a, b) => b.total - a.total);
  }, [karpenterEvents, eventMeta, nodePools, startMs, endMs, bucketMs, enabledGroups]);

  // ── Per-pool node-count over time ──────────────────────────────────────────
  // We anchor at the CURRENT live node count for the pool, and walk backward
  // through NodeClaim lifecycle events to reconstruct historical counts.
  //
  // Why only NodeClaim events? Each physical node emits events under TWO
  // different involvedObject.names: the NodeClaim name (Launched, Disrupted,
  // Drained, Terminated, DisruptionLaunched...) and the Node name (Registered,
  // Initialized, NodeReady...). If we used both we'd double-count one node as
  // two short-lived entities and lose the anchor at the live count.
  //
  // NodeClaim events alone give us a clean 1:1 with nodes:
  //   • +1 on the earliest "Launched" / "DisruptionLaunched" per claim
  //   • -1 on the earliest "Terminated" per claim
  //
  // Algorithm:
  //   countAt(now)   = liveCount
  //   countAt(t)     = countAt(now) - (# +1 in (t, now]) + (# -1 in (t, now])
  //   peak(window)   = max over all bucket boundaries → reflected on Y-axis
  const ADD_REASONS = new Set(["Launched", "DisruptionLaunched"]);
  const REMOVE_REASONS = new Set(["Terminated"]);

  const perPoolNodePoints = useMemo(() => {
    // 1. Live count + live claim names per pool.
    //    A node whose claim has NO Launched event in the window is a
    //    "baseline" node — it predates the window and must count throughout.
    const liveByPool: Record<string, number> = {};
    const liveClaimsByPool: Record<string, Set<string>> = {};
    for (const node of allNodes) {
      const pool = (node as any).metadata?.labels?.["karpenter.sh/nodepool"];
      if (!pool) continue;
      liveByPool[pool] = (liveByPool[pool] ?? 0) + 1;
      const claim = getNodeClaimName(node) || (node as any).metadata?.name;
      if (claim) (liveClaimsByPool[pool] ??= new Set()).add(claim);
    }

    // 2. Per-pool: dedup events by claim name, keep earliest add & earliest
    //    remove ts. Each claim contributes at most one +1 and one -1.
    type Delta = { ts: number; delta: number };
    const deltasByPool: Record<string, Delta[]> = {};
    const firstAdd: Record<string, Map<string, number>> = {};
    const firstRemove: Record<string, Map<string, number>> = {};

    for (const e of karpenterEvents) {
      const m = eventMeta.get(e);
      if (!m || !m.pool) continue;
      const kind = e.involvedObject?.kind ?? "";
      // Only NodeClaim/Machine events — Node events would double-count.
      if (kind !== "NodeClaim" && kind !== "Machine") continue;
      const name = e.involvedObject?.name ?? "";
      if (!name) continue;
      const reason = e.reason ?? "";
      if (ADD_REASONS.has(reason)) {
        const map = (firstAdd[m.pool] ??= new Map());
        if (!map.has(name) || m.ts < map.get(name)!) map.set(name, m.ts);
      } else if (REMOVE_REASONS.has(reason)) {
        const map = (firstRemove[m.pool] ??= new Map());
        if (!map.has(name) || m.ts < map.get(name)!) map.set(name, m.ts);
      }
    }
    for (const pool of new Set([...Object.keys(firstAdd), ...Object.keys(firstRemove)])) {
      const arr = (deltasByPool[pool] = [] as Delta[]);
      for (const ts of firstAdd[pool]?.values() ?? []) arr.push({ ts, delta: +1 });
      for (const ts of firstRemove[pool]?.values() ?? []) arr.push({ ts, delta: -1 });
      arr.sort((a, b) => a.ts - b.ts);
    }

    // 3. Bucket boundaries.
    const t0 = Math.floor(startMs / bucketMs) * bucketMs;
    const t1 = Math.ceil(endMs / bucketMs) * bucketMs;
    const buckets: number[] = [];
    for (let t = t0; t <= t1; t += bucketMs) buckets.push(t);

    // 4. For each pool: anchor at live count, reverse-walk to find count(t0),
    //    then forward-walk through deltas building one point per bucket.
    const result: Record<string, TimelinePoint[]> = {};
    for (const np of nodePools) {
      const pool = np.metadata?.name ?? "";
      const live = liveByPool[pool] ?? 0;
      const deltas = deltasByPool[pool] ?? [];

      // Baseline = live nodes whose claim was NOT launched in the window.
      // They've been alive throughout → add to every bucket.
      const liveClaims = liveClaimsByPool[pool] ?? new Set<string>();
      const launchedSet = firstAdd[pool] ?? new Map<string, number>();
      let baseline = 0;
      for (const c of liveClaims) if (!launchedSet.has(c)) baseline++;

      // count(now) - sum(deltas with t > t0) = count(t0). The "deltas" only
      // cover claims with events in the window; baseline is separate.
      const trackedNow = live - baseline;
      let countAtT0 = trackedNow;
      for (const { ts, delta } of deltas) {
        if (ts > t0) countAtT0 -= delta;
      }
      if (countAtT0 < 0) countAtT0 = 0; // clamp on missing events

      const pts: TimelinePoint[] = [];
      let running = countAtT0;
      let di = 0;
      for (let bi = 0; bi < buckets.length; bi++) {
        const tb = buckets[bi]!;
        // Apply all deltas with ts ≤ tb.
        while (di < deltas.length && deltas[di]!.ts <= tb) {
          running += deltas[di]!.delta;
          di++;
        }
        if (running < 0) running = 0;
        pts.push({ t: tb, counts: { nodes: running + baseline } });
      }
      // Force the very last bucket to match the live count (truth at "now").
      if (pts.length > 0) pts[pts.length - 1] = { t: pts[pts.length - 1]!.t, counts: { nodes: live } };
      result[pool] = pts;
    }
    return result;
  }, [karpenterEvents, eventMeta, nodePools, allNodes, startMs, endMs, bucketMs]);

  // ── Hovered bucket from row → align to bucket start ────────────────────────
  // (The chart receives `externalHoverT` directly; no derived state needed.)

  // ── Bidirectional link: scroll first matching row into view on bucket select
  useEffect(() => {
    if (selectedBucket == null) return;
    const match = sortedFiltered.find((e) => {
      const ts = eventTs(e);
      return ts >= selectedBucket && ts < selectedBucket + bucketMs;
    });
    if (!match) return;
    const uid = match.metadata?.uid ?? "";
    const row = rowRefMap.get(uid);
    if (row) row.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [selectedBucket, bucketMs, sortedFiltered, rowRefMap]);

  // ── Split filtered events for the two tables ───────────────────────────────
  const podEvents = sortedFiltered.filter(isPodEvent);
  const nodeEvents = sortedFiltered.filter(isNodeDecisionEvent);

  const toggleGroup = (k: string) => {
    setEnabledGroups((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  return (
    <div className={styles.container}>
      <style>{stylesInline}</style>
      <h2 className={styles.title}>Scaling decisions</h2>
      <p className={styles.subtitle}>
        Karpenter events grouped by reason, plotted over time. Click a bucket on the chart to filter the tables; hover a
        row to see when it happened.
      </p>

      {/* ── Filter row ─────────────────────────────────────────────────── */}
      <div className={styles.filterRow}>
        <label className={styles.filterLabel}>NodePool:</label>
        <select
          className={styles.filterSelect}
          value={selectedPool}
          onChange={(e) => {
            setSelectedPool(e.target.value);
            setSelectedBucket(null);
          }}
        >
          <option value="">All NodePools ({nodePools.length})</option>
          {nodePools.map((np) => (
            <option key={np.metadata?.name} value={np.metadata?.name ?? ""}>
              {np.metadata?.name}
            </option>
          ))}
        </select>

        <span className={styles.filterDivider} />

        <label className={styles.filterLabel}>Range:</label>
        <div className={styles.segmented}>
          {TIME_RANGES.map((r) => (
            <button
              key={r.key}
              className={`${styles.segBtn} ${rangeKey === r.key ? styles.segBtnActive : ""}`}
              onClick={() => {
                setRangeKey(r.key);
                setSelectedBucket(null);
              }}
            >
              {r.label}
            </button>
          ))}
        </div>

        <span className={styles.eventCount}>
          {sortedFiltered.length} / {karpenterEvents.length} karpenter events
        </span>
      </div>

      {/* ── Panels: global + per-NodePool ──────────────────────────────── */}
      <div className={styles.panelStack}>
        <MetricPanel
          title="All NodePools"
          points={globalPoints}
          bucketMs={bucketMs}
          enabledGroups={enabledGroups}
          toggleGroup={toggleGroup}
          selectedBucket={selectedBucket}
          onSelectBucket={setSelectedBucket}
          externalHoverT={hoveredTs}
        />

        {perPoolPoints
          .filter(({ pool, total }) => {
            if (selectedPool) return selectedPool === pool; // when filtering, only show that pool
            const hasNodes = (perPoolNodePoints[pool] ?? []).some((p) => (p.counts.nodes ?? 0) > 0);
            return total > 0 || hasNodes;
          })
          .map(({ pool, total }) => {
            const nodePts = perPoolNodePoints[pool] ?? [];
            const currentNodes = nodePts.length > 0 ? (nodePts[nodePts.length - 1]!.counts.nodes ?? 0) : 0;
            return (
              <MetricPanel
                key={pool}
                title={`NodePool: ${pool}`}
                subtitle={`${currentNodes} nodes now · ${total} events in window`}
                points={nodePts}
                bucketMs={bucketMs}
                enabledGroups={enabledGroups}
                toggleGroup={toggleGroup}
                selectedBucket={selectedBucket}
                onSelectBucket={setSelectedBucket}
                externalHoverT={hoveredTs}
                poolName={pool}
                activePool={selectedPool}
                onPoolToggle={() => {
                  setSelectedPool(selectedPool === pool ? "" : pool);
                  setSelectedBucket(null);
                }}
                kind="nodes"
              />
            );
          })}
      </div>

      {/* ── Tables ─────────────────────────────────────────────────────── */}
      <DecisionTable
        title="Pod Placement Decisions"
        events={podEvents}
        isPod
        highlightBucket={selectedBucket}
        bucketMs={bucketMs}
        onHoverEvent={setHoveredTs}
        rowRefMap={rowRefMap}
      />
      <DecisionTable
        title="Node / NodeClaim Decisions"
        events={nodeEvents}
        isPod={false}
        highlightBucket={selectedBucket}
        bucketMs={bucketMs}
        onHoverEvent={setHoveredTs}
        rowRefMap={rowRefMap}
      />
    </div>
  );
});

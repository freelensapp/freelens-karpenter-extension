/**
 * ScalingDecisions.tsx — Karpenter scaling decisions dashboard.
 *
 * Layout:
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │  Filter row (NodePool · time range · reason groups)          │
 *   ├──────────────────────────────────────────────────────────────┤
 *   │  Global TimelineChart  (stacked by reason group)             │
 *   ├──────────────────────────────────────────────────────────────┤
 *   │  Node count of each NodePool over time (click to filter)     │
 *   ├──────────────────────────────────────────────────────────────┤
 *   │  Pod Placement Decisions table  (linked to selected bucket)  │
 *   │  Node Decisions table                                        │
 *   └──────────────────────────────────────────────────────────────┘
 *
 * Bidirectional linking:
 *   - Click a chart bucket → the rows of its events are highlighted and the
 *     first is scrolled into view; the bucket is shaded on every chart.
 *   - Hover a table row    → chart highlights the bucket the event falls in.
 */

import { observer } from "mobx-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { COLOR } from "../../config/theme";
import { getKarpenterEventStore, getNodePoolStore, getNodeStore } from "../../data/stores";
import { useItems } from "../../data/use-items";
import {
  buildBuckets,
  type EventGroup,
  eventGroup,
  eventNodePool,
  eventTs,
  eventVisual,
  formatAge,
  isKarpenterEvent,
  isNodeDecisionEvent,
  isPodEvent,
  type KarpenterEvent,
  nodeCountTimeline,
  pickBucketMs,
  type TimelinePoint,
} from "../../utils/karpenter-events";
import { getNodeClaimName } from "../../utils/kube-helpers";
import styles from "./scaling-decisions.module.scss";
import { TimelineChart, type TimelineSeries } from "./timeline-chart";

import type { NodePool } from "../../api/nodepool/nodepool-v1";
import type { Node } from "../../utils/kube-helpers";

// ── Reason groups available in the legend ────────────────────────────────────

const GROUP_DEFS: { key: EventGroup; label: string; color: string }[] = [
  { key: "scale-up", label: "Scale up", color: COLOR.success },
  { key: "scale-down", label: "Scale down", color: COLOR.terminating },
  { key: "drift", label: "Drift", color: COLOR.warning },
  { key: "error", label: "Errors", color: COLOR.danger },
  { key: "other", label: "Other", color: COLOR.neutral },
];

const TIME_RANGES = [
  { key: "1h", label: "1h", ms: 3600_000 },
  { key: "6h", label: "6h", ms: 6 * 3600_000 },
  { key: "24h", label: "24h", ms: 24 * 3600_000 },
  { key: "all", label: "All", ms: Infinity },
];

// ── Tables ───────────────────────────────────────────────────────────────────

interface DecisionTableProps {
  title: string;
  events: KarpenterEvent[];
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
                <span className={styles.reasonDot} style={{ background: eventVisual(event).color }} />
                {event.reason}
              </td>
              <td className={styles.sourceCell}>{event.source?.component || event.reportingComponent || "—"}</td>
              <td className={styles.nameCell}>
                {event.involvedObject?.namespace
                  ? `${event.involvedObject.namespace}/${event.involvedObject.name}`
                  : event.involvedObject?.name}
              </td>
              <td className={styles.messageCell}>{event.message}</td>
              <td className={styles.ageCell}>
                {formatAge(event.lastTimestamp || event.eventTime || event.metadata?.creationTimestamp)}
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

  const nodePools: NodePool[] = useItems(getNodePoolStore()?.items ?? []);
  const allEvents: KarpenterEvent[] = useItems(getKarpenterEventStore().items);
  const allNodes: Node[] = useItems(getNodeStore().items);
  const poolNames = useMemo(() => nodePools.map((np) => np.getName()), [nodePools]);

  const rowRefMap = useRef(new Map<string, HTMLTableRowElement>()).current;

  // `useItems` gives a new array whenever an object changes (an event's lastTimestamp moving on included), so the
  // memos below follow the stores.
  const karpenterEvents = useMemo(() => allEvents.filter(isKarpenterEvent), [allEvents]);

  const eventMeta = useMemo(() => {
    const map = new Map<KarpenterEvent, { ts: number; group: string; pool: string }>();
    for (const e of karpenterEvents) {
      map.set(e, {
        ts: eventTs(e),
        group: eventGroup(e),
        pool: eventNodePool(e, poolNames),
      });
    }
    return map;
  }, [karpenterEvents, poolNames]);

  // ── Time range: up to the time the events last changed ─────────────────────
  const range = TIME_RANGES.find((r) => r.key === rangeKey) ?? TIME_RANGES[1]!;
  const { startMs, endMs } = useMemo(() => {
    const now = Date.now();
    const start =
      range.ms === Infinity
        ? karpenterEvents.reduce((min, e) => {
            const ts = eventTs(e);
            return ts > 0 && ts < min ? ts : min;
          }, now)
        : now - range.ms;
    return { startMs: start, endMs: now };
  }, [range, karpenterEvents]);

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
    const byPool = new Map<string, KarpenterEvent[]>();
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

  // ── Per-pool node count over time, from the live nodes and the NodeClaim events ──
  const perPoolNodePoints = useMemo(
    () =>
      nodeCountTimeline({
        pools: poolNames,
        nodes: allNodes,
        claimOfNode: getNodeClaimName,
        events: karpenterEvents,
        poolOfEvent: (e) => eventMeta.get(e)?.pool ?? "",
        startMs,
        endMs,
        bucketMs,
      }),
    [karpenterEvents, eventMeta, poolNames, allNodes, startMs, endMs, bucketMs],
  );

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
      <h2 className={styles.title}>Scaling decisions</h2>
      <p className={styles.subtitle}>
        Karpenter events grouped by reason, plotted over time. Click a bucket on the chart to highlight its events in
        the tables; hover a row to see when it happened.
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

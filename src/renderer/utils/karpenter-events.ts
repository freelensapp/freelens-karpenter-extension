/**
 * The Karpenter events: which events are Karpenter's, how they are grouped and drawn, and the time series the
 * Scaling Decisions tab builds from them. Pure functions of the events.
 *
 * The reasons are those of Karpenter v1.15.0 (`pkg/events/reason.go` and the `events.go` of its controllers, and
 * the NodeClaim condition transitions it records as events), kept together with the reasons of earlier versions.
 */

import { COLOR } from "../config/theme";

import type { Renderer } from "@freelensapp/extensions";

import type { Node } from "./kube-helpers";

export type KarpenterEvent = Renderer.K8sApi.KubeEvent;

export type EventGroup = "scale-up" | "scale-down" | "drift" | "error" | "other";

export interface EventVisual {
  color: string;
  icon: string;
  group: EventGroup;
}

const scaleUp: EventVisual = { color: COLOR.success, icon: "▲", group: "scale-up" };
const scaleDown: EventVisual = { color: COLOR.terminating, icon: "▼", group: "scale-down" };
const scaleDownDone: EventVisual = { color: COLOR.textSecondary, icon: "▼", group: "scale-down" };
const drift: EventVisual = { color: COLOR.warning, icon: "~", group: "drift" };
const error: EventVisual = { color: COLOR.danger, icon: "✕", group: "error" };
const blocked: EventVisual = { color: COLOR.warning, icon: "⊘", group: "other" };
const other: EventVisual = { color: COLOR.textSecondary, icon: "•", group: "other" };

/** The reasons of a node coming up: scale up on a NodeClaim or a node, a status of the pool on a NodePool. */
const NODE_LIFECYCLE_UP = new Set(["Launched", "Registered", "Initialized", "Ready"]);

const VISUAL_BY_REASON: Record<string, EventVisual> = {
  // scale up, earlier versions
  Provisioned: scaleUp,
  ScaledUp: scaleUp,
  // scale down and disruption (v1.15.0)
  DisruptionLaunching: scaleDown,
  DisruptionWaitingReadiness: scaleDown,
  DisruptionTerminating: scaleDown,
  Drained: scaleDown,
  Disrupted: scaleDown,
  Evicted: scaleDown,
  Finalized: scaleDownDone,
  // earlier versions
  Disrupting: scaleDown,
  Consolidated: scaleDown,
  Terminating: scaleDown,
  Terminated: scaleDownDone,
  ScaledDown: scaleDown,
  // drift
  Drifted: drift,
  // errors (v1.15.0)
  InsufficientCapacityError: error,
  FailedScheduling: error,
  NoCompatibleInstanceTypes: error,
  NodeClassNotReady: error,
  FailedDraining: error,
  FailedTermination: error,
  FailedConsistencyCheck: error,
  UnregisteredTaintMissing: error,
  RebootFailed: error,
  // earlier versions
  NotLaunched: error,
  NotRegistered: error,
  NotInitialized: error,
  InsufficientCapacity: error,
  // blocked
  DisruptionBlocked: blocked,
  NodeRepairBlocked: blocked,
};

const NODE_KINDS = new Set(["NodeClaim", "Machine", "Node"]);

/** How an event is grouped and drawn. A Warning that no reason classifies is an error. */
export function eventVisual(event: KarpenterEvent): EventVisual {
  const reason = event.reason ?? "";
  if (NODE_LIFECYCLE_UP.has(reason)) {
    return NODE_KINDS.has(event.involvedObject?.kind ?? "") ? scaleUp : other;
  }
  const visual = VISUAL_BY_REASON[reason];
  if (visual) return visual;
  return event.type === "Warning" ? error : other;
}

export function eventGroup(event: KarpenterEvent): EventGroup {
  return eventVisual(event).group;
}

// ── Which events are Karpenter's ─────────────────────────────────────────────

const KARPENTER_KINDS = new Set(["NodePool", "NodeClaim", "Machine", "EC2NodeClass", "AKSNodeClass", "NodeClass"]);

const KARPENTER_NAMESPACES = new Set(["karpenter", "karpenter-system"]);

/** Reasons other components write too (the kubelet's `Evicted`); such an event is Karpenter's only by its source. */
const SHARED_REASONS = new Set(["Evicted", "Ready"]);

const KARPENTER_REASONS = new Set(
  [...NODE_LIFECYCLE_UP, ...Object.keys(VISUAL_BY_REASON), "Nominated", "NominatedNode", "Unconsolidatable"].filter(
    (reason) => !SHARED_REASONS.has(reason),
  ),
);

/**
 * An event is Karpenter's when its source or reporting component is, its object is a Karpenter kind or lives in a
 * Karpenter namespace, or its reason is one Karpenter writes (`FailedScheduling` of the scheduler included, as in
 * 1.0.1).
 */
export function isKarpenterEvent(event: KarpenterEvent): boolean {
  const source = (event.source?.component ?? "").toLowerCase();
  const reporter = (event.reportingComponent ?? "").toLowerCase();
  return (
    source.includes("karpenter") ||
    reporter.includes("karpenter") ||
    KARPENTER_KINDS.has(event.involvedObject?.kind ?? "") ||
    KARPENTER_NAMESPACES.has(event.involvedObject?.namespace ?? "") ||
    KARPENTER_REASONS.has(event.reason ?? "")
  );
}

export function isPodEvent(event: KarpenterEvent): boolean {
  return event.involvedObject?.kind === "Pod";
}

export function isNodeDecisionEvent(event: KarpenterEvent): boolean {
  return NODE_KINDS.has(event.involvedObject?.kind ?? "");
}

// ── Time ─────────────────────────────────────────────────────────────────────

export function eventTs(event: KarpenterEvent): number {
  return new Date(event.lastTimestamp || event.eventTime || event.metadata?.creationTimestamp || 0).getTime();
}

/** The age of a time, `now` in milliseconds: `<1m`, `5m`, `3h`, `2d`, or `—` without a time. */
export function formatAge(timestamp: string | undefined, now = Date.now()): string {
  if (!timestamp) return "—";
  const mins = Math.floor((now - new Date(timestamp).getTime()) / 60_000);
  if (mins < 1) return "<1m";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

/** The NodePool an event refers to: the pool itself, the longest pool name prefixing the object, or the message. */
export function eventNodePool(event: KarpenterEvent, poolNames: string[]): string {
  const name = event.involvedObject?.name ?? "";
  if (event.involvedObject?.kind === "NodePool") return name;
  // NodeClaim and node names start with `<pool>-`; the longest pool wins, so that "ml-ms-abc" is "ml-ms", not "ml".
  const longestFirst = [...poolNames].sort((a, b) => b.length - a.length);
  const pool = longestFirst.find((pn) => pn && name.startsWith(`${pn}-`));
  if (pool) return pool;
  return (event.message ?? "").match(/NodePool[=:]\s*([\w.-]+)/)?.[1] ?? "";
}

// ── Time series ──────────────────────────────────────────────────────────────

export interface TimelinePoint {
  /** The start of the bucket, in milliseconds. */
  t: number;
  /** The count of each series in the bucket: `{ "scale-up": 3, error: 1 }`, or `{ nodes: 4 }`. */
  counts: Record<string, number>;
}

const BUCKET_SIZES = [
  30_000,
  60_000,
  2 * 60_000,
  5 * 60_000,
  10 * 60_000,
  15 * 60_000,
  30 * 60_000,
  60 * 60_000,
  2 * 60 * 60_000,
  6 * 60 * 60_000,
  12 * 60 * 60_000,
  24 * 60 * 60_000,
];

/** The bucket size for about 45 buckets over the range, at least 5m for fewer than 10 events. */
export function pickBucketMs(rangeMs: number, eventCount: number): number {
  const raw = rangeMs / 45;
  let best = BUCKET_SIZES[0]!;
  for (const size of BUCKET_SIZES) {
    if (size <= raw) best = size;
    else break;
  }
  if (eventCount < 10 && best < 5 * 60_000) best = 5 * 60_000;
  return best;
}

/** The buckets from `startMs` to `endMs`, empty ones included, with the events of each counted by group. */
export function buildBuckets(
  events: KarpenterEvent[],
  startMs: number,
  endMs: number,
  bucketMs: number,
  groupOf: (event: KarpenterEvent) => string,
): TimelinePoint[] {
  const buckets = new Map<number, Record<string, number>>();
  const t0 = Math.floor(startMs / bucketMs) * bucketMs;
  const t1 = Math.ceil(endMs / bucketMs) * bucketMs;
  for (let t = t0; t <= t1; t += bucketMs) buckets.set(t, {});
  for (const event of events) {
    const ts = eventTs(event);
    if (ts < startMs || ts > endMs) continue;
    const t = Math.floor(ts / bucketMs) * bucketMs;
    const slot = buckets.get(t) ?? {};
    const group = groupOf(event);
    slot[group] = (slot[group] ?? 0) + 1;
    buckets.set(t, slot);
  }
  return [...buckets.entries()].sort(([a], [b]) => a - b).map(([t, counts]) => ({ t, counts }));
}

/** The reasons that add a node to its pool, and those that take it away (B11: `Finalized` of v1.15.0). */
const ADD_REASONS = new Set(["Launched", "DisruptionLaunched"]);
const REMOVE_REASONS = new Set(["Finalized", "Terminated"]);

export interface NodeCountInput {
  pools: string[];
  /** The live nodes; a node belongs to the pool of its `karpenter.sh/nodepool` label. */
  nodes: Node[];
  /** The NodeClaim of a live node, as `getNodeClaimName` finds it. */
  claimOfNode: (node: Node) => string;
  events: KarpenterEvent[];
  poolOfEvent: (event: KarpenterEvent) => string;
  startMs: number;
  endMs: number;
  bucketMs: number;
}

/**
 * The number of nodes of each pool over time, one point per bucket, under `counts.nodes`.
 *
 * It is anchored at the live count and walks back through the NodeClaim events: each NodeClaim adds one node at
 * its earliest launch and removes it at its earliest removal. Node events are left out, since a node has events
 * under its own name and under its NodeClaim's, which would count it twice. A live node whose NodeClaim was not
 * launched in the window counts throughout. The last point is the live count.
 */
export function nodeCountTimeline(input: NodeCountInput): Record<string, TimelinePoint[]> {
  const { pools, nodes, claimOfNode, events, poolOfEvent, startMs, endMs, bucketMs } = input;
  const liveByPool: Record<string, number> = {};
  const liveClaimsByPool: Record<string, Set<string>> = {};
  for (const node of nodes) {
    const pool = node.metadata?.labels?.["karpenter.sh/nodepool"];
    if (!pool) continue;
    liveByPool[pool] = (liveByPool[pool] ?? 0) + 1;
    const claim = claimOfNode(node) || node.metadata?.name;
    if (claim) (liveClaimsByPool[pool] ??= new Set()).add(claim);
  }

  const firstAdd: Record<string, Map<string, number>> = {};
  const firstRemove: Record<string, Map<string, number>> = {};
  for (const event of events) {
    const kind = event.involvedObject?.kind ?? "";
    if (kind !== "NodeClaim" && kind !== "Machine") continue;
    const name = event.involvedObject?.name ?? "";
    const pool = poolOfEvent(event);
    if (!name || !pool) continue;
    const reason = event.reason ?? "";
    const target = ADD_REASONS.has(reason) ? firstAdd : REMOVE_REASONS.has(reason) ? firstRemove : undefined;
    if (!target) continue;
    const ts = eventTs(event);
    const map = (target[pool] ??= new Map());
    if (!map.has(name) || ts < map.get(name)!) map.set(name, ts);
  }

  const t0 = Math.floor(startMs / bucketMs) * bucketMs;
  const t1 = Math.ceil(endMs / bucketMs) * bucketMs;
  const buckets: number[] = [];
  for (let t = t0; t <= t1; t += bucketMs) buckets.push(t);

  const result: Record<string, TimelinePoint[]> = {};
  for (const pool of pools) {
    const live = liveByPool[pool] ?? 0;
    const deltas = [
      ...[...(firstAdd[pool]?.values() ?? [])].map((ts) => ({ ts, delta: +1 })),
      ...[...(firstRemove[pool]?.values() ?? [])].map((ts) => ({ ts, delta: -1 })),
    ].sort((a, b) => a.ts - b.ts);

    const launched = firstAdd[pool] ?? new Map<string, number>();
    let baseline = 0;
    for (const claim of liveClaimsByPool[pool] ?? []) if (!launched.has(claim)) baseline++;

    let running = live - baseline;
    for (const { ts, delta } of deltas) if (ts > t0) running -= delta;
    if (running < 0) running = 0;

    const points: TimelinePoint[] = [];
    let next = 0;
    for (const t of buckets) {
      while (next < deltas.length && deltas[next]!.ts <= t) running += deltas[next++]!.delta;
      if (running < 0) running = 0;
      points.push({ t, counts: { nodes: running + baseline } });
    }
    if (points.length > 0) points[points.length - 1] = { t: points[points.length - 1]!.t, counts: { nodes: live } };
    result[pool] = points;
  }
  return result;
}

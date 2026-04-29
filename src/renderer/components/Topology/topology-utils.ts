/**
 * topology-utils.ts
 *
 * Pure helpers used by the Topology view:
 *  - grouping nodes by pool / zone / instance-type / node-class
 *  - sizing metric extraction (CPU / memory / pods / equal)
 *  - aggregate KPI computation
 *  - squarified treemap layout
 *
 * No React imports — pure TypeScript.
 */

import { type Node } from "../../k8s/core/node-store";
import { type NodePool } from "../../k8s/karpenter/store";
import {
  getInstanceType,
  getNodeStatus,
  getNodeMaxPods,
  parseCpuCores,
  parseMemGi,
  type CondStatus,
} from "../../utils/kube-helpers";

// ── Palettes ─────────────────────────────────────────────────────────────────

export const GROUP_PALETTE = [
  "#00a7e1", "#48c78e", "#ffc107", "#ff7043", "#ab80ff",
  "#f06292", "#4fc3f7", "#81c784", "#ffb74d", "#ba68c8",
  "#4dd0e1", "#aed581", "#ff8a65", "#7986cb", "#26c6da",
];
export const OTHER_GROUP_COLOR = "#607d8b";

export const STATUS_COLOR: Record<CondStatus, string> = {
  Ready:        "#48c78e",
  Provisioning: "#ffc107",
  Claiming:     "#5ad1fc",
  Terminating:  "#ff7043",
  NotReady:     "#f14668",
  Unknown:      "#9e9e9e",
};

// ── Types ────────────────────────────────────────────────────────────────────

export type GroupBy = "pool" | "zone" | "instanceType" | "nodeClass";
export type SizeBy  = "cpu"  | "memory" | "pods" | "equal";

export interface NodeGroup {
  id: string;
  label: string;
  color: string;
  nodes: Node[];
  /** true if this is the synthetic "Other / non-Karpenter" group */
  isOther?: boolean;
}

// ── Node classification helpers ──────────────────────────────────────────────

export function getNodePoolName(node: Node): string | undefined {
  return (node as any).metadata?.labels?.["karpenter.sh/nodepool"];
}

export function getNodeZone(node: Node): string {
  const labels: Record<string, string> = (node as any).metadata?.labels ?? {};
  return (
    labels["topology.kubernetes.io/zone"] ||
    labels["failure-domain.beta.kubernetes.io/zone"] ||
    "unknown"
  );
}

export function getNodeCapacityType(node: Node): "spot" | "on-demand" | "unknown" {
  const labels: Record<string, string> = (node as any).metadata?.labels ?? {};
  const v =
    labels["karpenter.sh/capacity-type"] ||
    labels["karpenter.k8s.aws/capacity-type"] ||
    labels["eks.amazonaws.com/capacityType"]?.toLowerCase() ||
    "";
  if (v === "spot") return "spot";
  if (v === "on-demand" || v === "ondemand") return "on-demand";
  return "unknown";
}

/** Look up the NodeClass referenced by the NodePool that owns this node. */
export function getNodeClassRef(
  node: Node,
  nodePoolsByName: Map<string, NodePool>,
): string {
  const poolName = getNodePoolName(node);
  if (!poolName) return "unknown";
  const np = nodePoolsByName.get(poolName);
  const ref = (np as any)?.spec?.template?.spec?.nodeClassRef;
  if (!ref) return "unknown";
  return `${ref.kind ?? "NodeClass"}/${ref.name ?? "unknown"}`;
}

// ── Grouping ─────────────────────────────────────────────────────────────────

export function groupNodes(
  allNodes: Node[],
  nodePools: NodePool[],
  groupBy: GroupBy,
): NodeGroup[] {
  const nodePoolsByName = new Map(nodePools.map((np) => [np.metadata?.name ?? "", np]));

  // Only show Karpenter-managed nodes here. Non-managed nodes go in "Other".
  const karpenterNodes = allNodes.filter((n) => !!getNodePoolName(n));
  const otherNodes     = allNodes.filter((n) => !getNodePoolName(n));

  const buckets = new Map<string, Node[]>();
  const keyFor = (n: Node): string => {
    switch (groupBy) {
      case "pool":         return getNodePoolName(n) ?? "unknown";
      case "zone":         return getNodeZone(n);
      case "instanceType": return getInstanceType(n);
      case "nodeClass":    return getNodeClassRef(n, nodePoolsByName);
    }
  };

  for (const n of karpenterNodes) {
    const k = keyFor(n);
    const arr = buckets.get(k);
    if (arr) arr.push(n);
    else buckets.set(k, [n]);
  }

  // Stable, deterministic order: largest first, ties broken alphabetically.
  const sortedKeys = Array.from(buckets.keys()).sort((a, b) => {
    const da = buckets.get(b)!.length - buckets.get(a)!.length;
    return da !== 0 ? da : a.localeCompare(b);
  });

  const groups: NodeGroup[] = sortedKeys.map((label, i) => ({
    id: label,
    label,
    color: GROUP_PALETTE[i % GROUP_PALETTE.length]!,
    nodes: buckets.get(label)!,
  }));

  if (otherNodes.length > 0) {
    groups.push({
      id: "__other__",
      label: "Other (non-Karpenter)",
      color: OTHER_GROUP_COLOR,
      nodes: otherNodes,
      isOther: true,
    });
  }

  return groups;
}

// ── Sizing ───────────────────────────────────────────────────────────────────

export function nodeSize(node: Node, sizeBy: SizeBy): number {
  switch (sizeBy) {
    case "cpu":    return parseCpuCores((node as any).status?.allocatable?.cpu ?? (node as any).status?.capacity?.cpu ?? 0) || 1;
    case "memory": return parseMemGi  ((node as any).status?.allocatable?.memory ?? (node as any).status?.capacity?.memory ?? 0) || 1;
    case "pods":   return getNodeMaxPods(node) || 1;
    case "equal":  return 1;
  }
}

// ── KPI aggregate ────────────────────────────────────────────────────────────

export interface TopologyKpi {
  poolCount: number;
  totalNodes: number;
  karpenterNodes: number;
  ready: number;
  provisioning: number;
  notReady: number;
  terminating: number;
  totalCpuCores: number;
  totalMemGi: number;
  spotNodes: number;
  onDemandNodes: number;
  /** percentage 0..100 */
  karpenterCoverage: number;
}

export function computeKpi(allNodes: Node[], nodePools: NodePool[]): TopologyKpi {
  let karpenter = 0, ready = 0, provisioning = 0, notReady = 0, terminating = 0;
  let cpu = 0, mem = 0, spot = 0, onDemand = 0;
  for (const n of allNodes) {
    if (getNodePoolName(n)) karpenter++;
    const s = getNodeStatus(n);
    if (s === "Ready") ready++;
    else if (s === "Provisioning") provisioning++;
    else if (s === "Terminating") terminating++;
    else if (s === "NotReady") notReady++;
    cpu += parseCpuCores((n as any).status?.allocatable?.cpu ?? (n as any).status?.capacity?.cpu ?? 0);
    mem += parseMemGi  ((n as any).status?.allocatable?.memory ?? (n as any).status?.capacity?.memory ?? 0);
    const ct = getNodeCapacityType(n);
    if (ct === "spot") spot++;
    else if (ct === "on-demand") onDemand++;
  }
  return {
    poolCount: nodePools.length,
    totalNodes: allNodes.length,
    karpenterNodes: karpenter,
    ready, provisioning, notReady, terminating,
    totalCpuCores: cpu,
    totalMemGi: mem,
    spotNodes: spot,
    onDemandNodes: onDemand,
    karpenterCoverage: allNodes.length > 0 ? Math.round((karpenter / allNodes.length) * 100) : 0,
  };
}

// ── Squarified treemap ──────────────────────────────────────────────────────
//
// Squarified treemap (Bruls, Huijing, van Wijk, 2000) — simplified version.
// Produces axis-aligned rectangles with aspect ratios close to 1.
// Input weights are arbitrary positive numbers; output rects fill `area`.

export interface Rect { x: number; y: number; w: number; h: number; }
export interface SquarifiedItem<T> { item: T; rect: Rect; }

interface Weighted<T> { item: T; value: number; }

export function squarify<T>(items: Weighted<T>[], area: Rect): SquarifiedItem<T>[] {
  const out: SquarifiedItem<T>[] = [];
  const sorted = items
    .filter((i) => i.value > 0)
    .slice()
    .sort((a, b) => b.value - a.value);
  if (sorted.length === 0) return out;

  const total = sorted.reduce((s, i) => s + i.value, 0);
  // Normalise to area
  const scale = (area.w * area.h) / total;
  const queue = sorted.map((i) => ({ item: i.item, value: i.value * scale }));

  layoutRow(queue, area, out);
  return out;
}

function layoutRow<T>(items: Weighted<T>[], rect: Rect, out: SquarifiedItem<T>[]) {
  if (items.length === 0) return;
  const shortSide = Math.min(rect.w, rect.h);
  const row: Weighted<T>[] = [];
  let bestRatio = Infinity;

  for (const it of items) {
    const candidate = [...row, it];
    const ratio = worstRatio(candidate, shortSide);
    if (ratio <= bestRatio) {
      row.push(it);
      bestRatio = ratio;
    } else {
      // Emit current row, recurse on the rest with the remaining rect
      const rowArea = row.reduce((s, r) => s + r.value, 0);
      placeRow(row, rect, out);
      const newRect = shrinkRect(rect, rowArea / shortSide);
      layoutRow(items.slice(row.length), newRect, out);
      return;
    }
  }
  placeRow(row, rect, out);
}

function worstRatio<T>(row: Weighted<T>[], shortSide: number): number {
  if (row.length === 0) return Infinity;
  const sum = row.reduce((s, r) => s + r.value, 0);
  let max = -Infinity, min = Infinity;
  for (const r of row) {
    if (r.value > max) max = r.value;
    if (r.value < min) min = r.value;
  }
  const s2 = shortSide * shortSide;
  const sum2 = sum * sum;
  return Math.max((s2 * max) / sum2, sum2 / (s2 * min));
}

function placeRow<T>(row: Weighted<T>[], rect: Rect, out: SquarifiedItem<T>[]) {
  if (row.length === 0) return;
  const sum = row.reduce((s, r) => s + r.value, 0);
  const horizontal = rect.w >= rect.h;
  if (horizontal) {
    const w = sum / rect.h;
    let y = rect.y;
    for (const r of row) {
      const h = r.value / w;
      out.push({ item: r.item, rect: { x: rect.x, y, w, h } });
      y += h;
    }
  } else {
    const h = sum / rect.w;
    let x = rect.x;
    for (const r of row) {
      const w = r.value / h;
      out.push({ item: r.item, rect: { x, y: rect.y, w, h } });
      x += w;
    }
  }
}

function shrinkRect(rect: Rect, consumed: number): Rect {
  const horizontal = rect.w >= rect.h;
  return horizontal
    ? { x: rect.x + consumed, y: rect.y, w: rect.w - consumed, h: rect.h }
    : { x: rect.x, y: rect.y + consumed, w: rect.w, h: rect.h - consumed };
}

/**
 * kube-helpers.ts
 *
 * Shared pure utility functions for the Karpenter extension.
 * All logic that was duplicated across KarpenterCard and NodeClassesTab
 * lives here. No React imports — pure TypeScript.
 */

import { Renderer } from "@freelensapp/extensions";
import { getPodStore } from "../data/stores";

import type { NodePool } from "../api/nodepool/nodepool-v1";
import type { Condition } from "../api/types";

export type Node = Renderer.K8sApi.Node;
type Pod = Renderer.K8sApi.Pod;

// ── Types ─────────────────────────────────────────────────────────────────────

export type CondStatus = "Ready" | "NotReady" | "Provisioning" | "Claiming" | "Terminating" | "Unknown";

// ── Status helpers ────────────────────────────────────────────────────────────

/**
 * Generic: find a condition by type in a conditions array and return
 * a normalized status string.
 */
export function getConditionStatus(
  conditions: Pick<Condition, "type" | "status">[] | undefined,
  type: string,
): CondStatus {
  const c = conditions?.find((c) => c.type === type);
  if (!c) return "Unknown";
  return c.status === "True" ? "Ready" : "NotReady";
}

export function getNodePoolStatus(nodePool: NodePool): CondStatus {
  return getConditionStatus(nodePool.status?.conditions, "Ready");
}

export function getNodeClassStatus(nodeClass: { status?: { conditions?: Condition[] } }): CondStatus {
  return getConditionStatus(nodeClass.status?.conditions, "Ready");
}

/** `now` is the time to compare the node's age with, in milliseconds. */
export function getNodeStatus(node: Node, now = Date.now()): CondStatus {
  const conditions = node.status?.conditions ?? [];
  const readyCond = conditions.find((c) => c.type === "Ready");

  // ── Terminating: deletionTimestamp is set (node is being deleted/drained) ──
  if (node.metadata.deletionTimestamp) return "Terminating";

  if (readyCond?.status === "True") return "Ready";

  // Check if node belongs to Karpenter
  const labels = node.metadata.labels ?? {};
  const annotations = node.metadata.annotations ?? {};
  const isKarpenter =
    !!labels["karpenter.sh/nodeclaim"] || !!labels["karpenter.sh/nodepool"] || !!annotations["karpenter.sh/nodeclaim"];

  if (isKarpenter) {
    const taints = node.spec?.taints ?? [];

    // Karpenter disruption taint → node is being drained/consolidated
    const hasDisruptionTaint = taints.some((t) => t.key === "karpenter.sh/disruption");
    if (hasDisruptionTaint) return "Terminating";

    // Bootstrap taints are added by k8s while the node is initializing
    const hasBootstrapTaint = taints.some(
      (t) => t.key === "node.kubernetes.io/not-ready" || t.key === "node.kubernetes.io/uninitialized",
    );

    // A brand-new node (< 5 min) that isn't Ready yet is still provisioning
    const createdAt = node.metadata.creationTimestamp ? new Date(node.metadata.creationTimestamp).getTime() : 0;
    const ageMs = now - createdAt;
    const isNew = ageMs < 5 * 60 * 1000;

    if (!readyCond || hasBootstrapTaint || isNew) return "Provisioning";
    return "NotReady";
  }

  if (!readyCond) return "Unknown";
  if (readyCond.status === "False") return "NotReady";
  return "Unknown";
}

// ── Node metadata helpers ─────────────────────────────────────────────────────

export function getNodeCpu(node: Node): string {
  const allocatable = node.status?.allocatable;
  const capacity = node.status?.capacity;
  return allocatable?.cpu || capacity?.cpu || "—";
}

export function getNodeMemory(node: Node): string {
  const allocatable = node.status?.allocatable;
  const capacity = node.status?.capacity;
  return formatMemory(allocatable?.memory || capacity?.memory);
}

/** A memory quantity in Gi, or Mi below 1Gi; `—` without one. */
export function formatMemory(quantity: string | undefined): string {
  const raw = String(quantity || "");
  if (!raw) return "—";

  if (raw.endsWith("Ki")) {
    const ki = parseInt(raw, 10);
    if (isNaN(ki)) return raw;
    const gi = ki / 1024 / 1024;
    return gi >= 1 ? `${gi.toFixed(1)}Gi` : `${(ki / 1024).toFixed(0)}Mi`;
  }
  if (raw.endsWith("Mi")) {
    const mi = parseFloat(raw);
    return mi >= 1024 ? `${(mi / 1024).toFixed(1)}Gi` : `${mi.toFixed(0)}Mi`;
  }
  if (raw.endsWith("Gi")) return `${parseFloat(raw).toFixed(1)}Gi`;
  if (raw.endsWith("Ti")) return `${(parseFloat(raw) * 1024).toFixed(0)}Gi`;

  // Plain number — Azure reports bytes
  const n = parseFloat(raw);
  if (!isNaN(n) && n > 1e8) {
    const gi = n / (1024 * 1024 * 1024);
    return gi >= 1 ? `${gi.toFixed(1)}Gi` : `${(n / (1024 * 1024)).toFixed(0)}Mi`;
  }
  return raw || "—";
}

export function getNodeClaimName(node: Node | undefined): string {
  if (!node?.metadata) return "";
  const labels = node.metadata.labels ?? {};
  const annotations = node.metadata.annotations ?? {};
  return (
    labels["karpenter.sh/nodeclaim"] ||
    annotations["karpenter.sh/nodeclaim"] ||
    labels["karpenter.sh/provisioner-name"] ||
    annotations["karpenter.sh/provisioner-name"] ||
    node.metadata.ownerReferences?.find((ref) => ref.kind === "NodeClaim" || ref.kind === "Machine")?.name ||
    ""
  );
}

export function getNodeMaxPods(node: Node): number {
  const allocatable = node.status?.allocatable;
  const capacity = node.status?.capacity;
  const raw: string = allocatable?.pods || capacity?.pods || "0";
  return parseInt(raw, 10) || 0;
}

export function getInstanceType(node: Node): string {
  return node.metadata.labels?.["node.kubernetes.io/instance-type"] ?? "—";
}

// ── Memory / CPU parsing ──────────────────────────────────────────────────────

export function parseMemGi(mem: string | number | null | undefined): number {
  if (mem === null || mem === undefined || mem === "") return 0;
  const s = String(mem).trim();
  if (s.endsWith("Ki")) return parseFloat(s) / (1024 * 1024);
  if (s.endsWith("Mi")) return parseFloat(s) / 1024;
  if (s.endsWith("Gi")) return parseFloat(s);
  if (s.endsWith("Ti")) return parseFloat(s) * 1024;
  // Plain number — Azure may report bytes
  const n = parseFloat(s);
  if (!isNaN(n) && n > 1e8) return n / (1024 * 1024 * 1024);
  return n || 0;
}

export function parseCpuCores(cpu: string | number | null | undefined): number {
  if (typeof cpu === "number") return cpu;
  if (!cpu) return 0;
  if (cpu.endsWith("m")) return parseFloat(cpu) / 1000;
  return parseFloat(cpu) || 0;
}

// ── Pod count helpers ─────────────────────────────────────────────────────────

/**
 * Build a {nodeName → podCount} map from the pods, by default those of the host's pod store.
 * Call this ONCE per render and pass the result down as a prop instead of
 * calling getPodCountForNode() inside every table row.
 */
export function buildPodCountMap(pods: Pod[] = getPodStore().items): Record<string, number> {
  const map: Record<string, number> = {};
  for (const pod of pods) {
    const nodeName = pod.spec?.nodeName;
    if (nodeName) map[nodeName] = (map[nodeName] ?? 0) + 1;
  }
  return map;
}

// ── Navigation helpers ────────────────────────────────────────────────────────

/** The URL of a Freelens list page with the details drawer open for `selfLink`. */
export function detailUrl(listPath: string, selfLink: string): string {
  const enc = encodeURIComponent(selfLink);
  return `${listPath}?kube-details=${enc}&kube-selected=${enc}`;
}

/**
 * Navigate to a Freelens list page with the detail drawer open for `selfLink`.
 */
export function navigateToDetail(listPath: string, selfLink: string): void {
  if (!selfLink) return;
  Renderer.Navigation.navigate(detailUrl(listPath, selfLink));
}

export function openNodeDetail(node: Node): void {
  const name = node.metadata?.name;
  if (!name) return;

  navigateToDetail("/nodes", `/api/v1/nodes/${name}`);
}

export function openNodePoolDetail(nodePool: NodePool): void {
  navigateToDetail("/crd/karpenter.sh/nodepools", `/apis/karpenter.sh/v1/nodepools/${nodePool.metadata?.name ?? ""}`);
}

export function openNodeClaimDetail(name: string): void {
  if (!name) return;
  navigateToDetail("/crd/karpenter.sh/nodeclaims", `/apis/karpenter.sh/v1/nodeclaims/${name}`);
}

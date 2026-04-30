/**
 * kube-helpers.ts
 *
 * Shared pure utility functions for the Karpenter extension.
 * All logic that was duplicated across KarpenterCard and NodeClassesTab
 * lives here. No React imports — pure TypeScript.
 */

import { Renderer } from "@freelensapp/extensions";
import { type Node } from "../k8s/core/node-store";
import { type NodePool } from "../k8s/karpenter/store";

// ── Types ─────────────────────────────────────────────────────────────────────

export type CondStatus = "Ready" | "NotReady" | "Provisioning" | "Claiming" | "Terminating" | "Unknown";

// ── Status helpers ────────────────────────────────────────────────────────────

/**
 * Generic: find a condition by type in a conditions array and return
 * a normalized status string.
 */
export function getConditionStatus(conditions: any[], type: string): CondStatus {
  const c = conditions?.find((c: any) => c.type === type);
  if (!c) return "Unknown";
  return c.status === "True" ? "Ready" : "NotReady";
}

export function getNodePoolStatus(nodePool: NodePool): CondStatus {
  return getConditionStatus((nodePool as any).status?.conditions ?? [], "Ready");
}

export function getNodeClassStatus(nodeClass: any): CondStatus {
  return getConditionStatus((nodeClass as any).status?.conditions ?? [], "Ready");
}

export function getNodeStatus(node: Node): CondStatus {
  const conditions: any[] = (node as any).status?.conditions ?? [];
  const readyCond = conditions.find((c: any) => c.type === "Ready");

  // ── Terminating: deletionTimestamp is set (node is being deleted/drained) ──
  if ((node as any).metadata?.deletionTimestamp) return "Terminating";

  if (readyCond?.status === "True") return "Ready";

  // Check if node belongs to Karpenter
  const labels = (node as any).metadata?.labels ?? {};
  const annotations = (node as any).metadata?.annotations ?? {};
  const isKarpenter =
    !!labels["karpenter.sh/nodeclaim"] || !!labels["karpenter.sh/nodepool"] || !!annotations["karpenter.sh/nodeclaim"];

  if (isKarpenter) {
    const taints: Array<{ key: string }> = (node as any).spec?.taints ?? [];

    // Karpenter disruption taint → node is being drained/consolidated
    const hasDisruptionTaint = taints.some((t) => t.key === "karpenter.sh/disruption");
    if (hasDisruptionTaint) return "Terminating";

    // Bootstrap taints are added by k8s while the node is initializing
    const hasBootstrapTaint = taints.some(
      (t) => t.key === "node.kubernetes.io/not-ready" || t.key === "node.kubernetes.io/uninitialized",
    );

    // A brand-new node (< 5 min) that isn't Ready yet is still provisioning
    const createdAt = node.metadata?.creationTimestamp
      ? new Date(node.metadata.creationTimestamp as unknown as string).getTime()
      : 0;
    const ageMs = Date.now() - createdAt;
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
  const allocatable = (node as any).status?.allocatable;
  const capacity = (node as any).status?.capacity;
  return allocatable?.cpu || capacity?.cpu || "—";
}

export function getNodeMemory(node: Node): string {
  const allocatable = (node as any).status?.allocatable;
  const capacity = (node as any).status?.capacity;
  const raw: string = String(allocatable?.memory || capacity?.memory || "");
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
  const labels: Record<string, string> = (node as any).metadata?.labels ?? {};
  const annotations: Record<string, string> = (node as any).metadata?.annotations ?? {};
  return (
    labels["karpenter.sh/nodeclaim"] ||
    annotations["karpenter.sh/nodeclaim"] ||
    labels["karpenter.sh/provisioner-name"] ||
    annotations["karpenter.sh/provisioner-name"] ||
    (node as any).metadata?.ownerReferences?.find((ref: any) => ref.kind === "NodeClaim" || ref.kind === "Machine")
      ?.name ||
    ""
  );
}

export function getNodeMaxPods(node: Node): number {
  const allocatable = (node as any).status?.allocatable;
  const capacity = (node as any).status?.capacity;
  const raw: string = allocatable?.pods || capacity?.pods || "0";
  return parseInt(raw, 10) || 0;
}

export function getInstanceType(node: Node): string {
  return (node as any).metadata?.labels?.["node.kubernetes.io/instance-type"] ?? "—";
}

// ── Memory / CPU parsing ──────────────────────────────────────────────────────

export function parseMemGi(mem: string | number): number {
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

export function parseCpuCores(cpu: string | number): number {
  if (typeof cpu === "number") return cpu;
  if (!cpu) return 0;
  if (cpu.endsWith("m")) return parseFloat(cpu) / 1000;
  return parseFloat(cpu) || 0;
}

// ── Pod count helpers ─────────────────────────────────────────────────────────

export function getPodsStore(): any {
  return (Renderer.K8sApi as any).podsStore ?? (Renderer.K8sApi.apiManager as any).getStore?.("/api/v1/pods");
}

/**
 * Build a {nodeName → podCount} map from the pods store.
 * Call this ONCE per render and pass the result down as a prop instead of
 * calling getPodCountForNode() inside every table row.
 */
export function buildPodCountMap(): Record<string, number> {
  try {
    const podsStore = getPodsStore();
    if (!podsStore?.items) return {};
    const map: Record<string, number> = {};
    for (const pod of podsStore.items as any[]) {
      const nodeName: string = pod.spec?.nodeName;
      if (nodeName) map[nodeName] = (map[nodeName] ?? 0) + 1;
    }
    return map;
  } catch {
    return {};
  }
}

// ── Navigation helpers ────────────────────────────────────────────────────────

/**
 * Navigate to a Freelens list page with the detail drawer open for `selfLink`.
 */
export function navigateToDetail(listPath: string, selfLink: string): void {
  if (!selfLink) return;
  const navigation = Renderer.Navigation as any;
  const enc = encodeURIComponent(selfLink);
  navigation.navigate(`${listPath}?kube-details=${enc}&kube-selected=${enc}`);
}

export function openNodeDetail(node: Node): void {
  const name = node.metadata?.name;
  if (!name) return;

  navigateToDetail("/nodes", `/api/v1/nodes/${name}`);
}

export function openNodePoolDetail(nodePool: NodePool): void {
  const selfLink: string =
    (nodePool as any).metadata?.selfLink || `/apis/karpenter.sh/v1/nodepools/${nodePool.metadata?.name ?? ""}`;
  navigateToDetail("/crd/karpenter.sh/nodepools", selfLink);
}

export function openNodeClaimDetail(name: string): void {
  if (!name) return;
  navigateToDetail("/crd/karpenter.sh/nodeclaims", `/apis/karpenter.sh/v1/nodeclaims/${name}`);
}

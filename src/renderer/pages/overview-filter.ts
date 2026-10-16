// The filter of the NodePool list of the Overview: pure, so that it is tested on its own.

import { NodeClaim } from "../api/nodeclaim/nodeclaim-v1";
import { getInstanceType, getNodePoolStatus, getNodeStatus } from "../utils/kube-helpers";

import type { NodePool } from "../api/nodepool/nodepool-v1";
import type { CondStatus, Node } from "../utils/kube-helpers";

export const STATUS_QUICK_FILTERS: { status: CondStatus; label: string; color: string }[] = [
  { status: "Ready", label: "Ready", color: "#48c78e" },
  { status: "Provisioning", label: "Provisioning", color: "#ffc107" },
  { status: "Claiming", label: "Claiming", color: "#5ad1fc" },
  { status: "Terminating", label: "Terminating", color: "#ff7043" },
  { status: "NotReady", label: "Not Ready", color: "#f14668" },
];

export interface SearchTokens {
  statusTokens: string[];
  typeTokens: string[];
  poolStatusTokens: string[];
  nameTerms: string[];
}

/**
 * Parse a raw search string into name terms and key:value tokens.
 * Supported tokens: status:<value>, type:<value>, poolstatus:<value>
 * Everything else is treated as a pool-name substring.
 */
export function parseSearchTokens(raw: string): SearchTokens {
  const tokens = raw.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const statusTokens: string[] = [];
  const typeTokens: string[] = [];
  const poolStatusTokens: string[] = [];
  const nameTerms: string[] = [];

  for (const t of tokens) {
    if (t.startsWith("status:")) {
      statusTokens.push(t.slice(7));
    } else if (t.startsWith("type:")) {
      typeTokens.push(t.slice(5));
    } else if (t.startsWith("poolstatus:")) {
      poolStatusTokens.push(t.slice(11));
    } else {
      nameTerms.push(t);
    }
  }
  return { statusTokens, typeTokens, poolStatusTokens, nameTerms };
}

/** The nodes of a NodePool, by their `karpenter.sh/nodepool` label. */
export function nodesOfPool(nodes: Node[], poolName: string): Node[] {
  return nodes.filter((node) => node.metadata.labels?.["karpenter.sh/nodepool"] === poolName);
}

/** The NodeClaims that have no node yet, by the name of their NodePool; claims without one are left out. */
export function claimingByPoolName(nodeClaims: NodeClaim[]): Record<string, NodeClaim[]> {
  const map: Record<string, NodeClaim[]> = {};
  for (const claim of nodeClaims) {
    if (!NodeClaim.isClaiming(claim)) continue;
    const pool = NodeClaim.getNodePoolName(claim);
    if (!pool) continue;
    (map[pool] ??= []).push(claim);
  }
  return map;
}

export function nodePoolMatchesFilter(
  np: NodePool,
  nodes: Node[],
  { nameTerms, statusTokens, typeTokens, poolStatusTokens }: SearchTokens,
  quickStatuses: CondStatus[],
  claims: NodeClaim[] = [],
  now = Date.now(),
): boolean {
  const poolName = (np.metadata?.name ?? "").toLowerCase();

  // name filter
  if (nameTerms.length > 0 && !nameTerms.every((t) => poolName.includes(t))) return false;

  // poolstatus: token — filters on the NodePool's own Ready condition
  if (poolStatusTokens.length > 0) {
    const poolStatus = (np.metadata.deletionTimestamp ? "Terminating" : getNodePoolStatus(np)).toLowerCase();
    const ready = np.status?.conditions?.find((c) => c.type === "Ready");
    const npStatus = !ready ? "unknown" : ready.status === "True" ? "ready" : "notready";
    const matches = poolStatusTokens.some((f) => {
      if (f === "notready") return npStatus !== "ready";
      if (f === "ready") return npStatus === "ready";
      return npStatus.includes(f) || poolStatus.includes(f);
    });
    if (!matches) return false;
  }

  // status: token or quick-filter chips
  const allStatusFilters = [...statusTokens, ...quickStatuses.map((s) => s.toLowerCase())];
  if (allStatusFilters.length > 0) {
    const hasMatchingNode = nodes.some((node) => {
      const s = getNodeStatus(node, now).toLowerCase();
      return allStatusFilters.some((f) => s.includes(f));
    });
    // Claiming status matches against pending NodeClaims (no node bound yet)
    const hasMatchingClaim =
      allStatusFilters.some((f) => "claiming".includes(f) || f.includes("claiming")) && claims.length > 0;
    if (!hasMatchingNode && !hasMatchingClaim) return false;
  }

  // type: token
  if (typeTokens.length > 0) {
    const hasMatchingType = nodes.some((node) => {
      const t = getInstanceType(node).toLowerCase();
      return typeTokens.some((f) => t.includes(f));
    });
    if (!hasMatchingType) return false;
  }

  return true;
}

import { getInstanceType, getNodeArch, getNodeStatus } from "../../utils/kube-helpers";

import type { NodeClaim } from "../../api/nodeclaim/nodeclaim-v1";
import type { Node } from "../../utils/kube-helpers";

/** Best-effort instance type of a NodeClaim that has no node yet: its label, else a single-value requirement. */
export function getNodeClaimInstanceType(claim: NodeClaim): string {
  const labelType = claim.metadata.labels?.["node.kubernetes.io/instance-type"];
  if (labelType) return labelType;
  const req = claim.spec?.requirements?.find((r) => r.key === "node.kubernetes.io/instance-type");
  const values = req?.values ?? [];
  if (values.length === 1) return values[0];
  if (values.length > 1) return `${values.length} types`;
  return "—";
}

/** The architecture of a NodeClaim: its label, else the values its requirement allows. */
export function getNodeClaimArch(claim: NodeClaim): string {
  const label = claim.metadata.labels?.["kubernetes.io/arch"];
  if (label) return label;
  const req = claim.spec?.requirements?.find((r) => r.key === "kubernetes.io/arch" && r.operator === "In");
  return req?.values?.length ? req.values.join(", ") : "—";
}

/** `used / limit`, with `—` for a NodePool that sets no limit for the resource. */
export function formatUsage(used: number, limit: number | undefined, unitFmt: (v: number) => string): string {
  return `${unitFmt(used)} / ${limit === undefined ? "—" : unitFmt(limit)}`;
}

/** What the node table of a card can be divided by, with the title of each choice. */
export const GROUP_BY = {
  none: "None",
  instanceType: "Instance type",
  capacityType: "Capacity type",
  zone: "Zone",
  arch: "Arch",
  status: "Status",
} as const;

export type GroupBy = keyof typeof GROUP_BY;

const label = (labels: Partial<Record<string, string>> | undefined, key: string) => labels?.[key] || "—";

/** The section of a node in the table divided by `by`. */
export function nodeGroupKey(node: Node, by: GroupBy): string {
  const labels = node.metadata.labels;
  switch (by) {
    case "instanceType":
      return getInstanceType(node);
    case "capacityType":
      return label(labels, "karpenter.sh/capacity-type");
    case "zone":
      return label(labels, "topology.kubernetes.io/zone");
    case "arch":
      return getNodeArch(node);
    case "status":
      return getNodeStatus(node);
    default:
      return "";
  }
}

/** The section of a NodeClaim still waiting for its node, which the table shows as Claiming. */
export function claimGroupKey(claim: NodeClaim, by: GroupBy): string {
  const labels = claim.metadata.labels;
  switch (by) {
    case "instanceType":
      return getNodeClaimInstanceType(claim);
    case "capacityType":
      return label(labels, "karpenter.sh/capacity-type");
    case "zone":
      return label(labels, "topology.kubernetes.io/zone");
    case "arch":
      return getNodeClaimArch(claim);
    case "status":
      return "Claiming";
    default:
      return "";
  }
}

/** The items in sections by their key, sorted by key, each keeping the order of its items; `—` comes last. */
export function groupBy<T>(items: T[], key: (item: T) => string): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    groups.set(k, [...(groups.get(k) ?? []), item]);
  }
  return [...groups].sort(
    ([a], [b]) => Number(a === "—") - Number(b === "—") || a.localeCompare(b, undefined, { numeric: true }),
  );
}

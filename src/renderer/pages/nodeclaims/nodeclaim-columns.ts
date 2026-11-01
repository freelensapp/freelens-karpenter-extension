// The columns of `kubectl get nodeclaims -o wide`, from the `additionalPrinterColumns` of karpenter.sh_nodeclaims.yaml
// of kubernetes-sigs/karpenter v1.15.1: the value of each `jsonPath` as `kubectl` prints it, and the value it sorts by.

import { conditionStatus, conditionStatusOrder } from "../../utils/printer-columns";

import type { NodeClaim } from "../../api/nodeclaim/nodeclaim-v1";

export interface NodeClaimColumnValues {
  /** Type: `.metadata.labels.node\.kubernetes\.io/instance-type`. */
  type: string | undefined;
  /** Capacity: `.metadata.labels.karpenter\.sh/capacity-type`. */
  capacity: string | undefined;
  /** Zone: `.metadata.labels.topology\.kubernetes\.io/zone`. */
  zone: string | undefined;
  /** Node: `.status.nodeName`. */
  node: string | undefined;
  /** Ready: `.status.conditions[?(@.type=="Ready")].status`. */
  ready: string | undefined;
  /** ImageID: `.status.imageID`, `-o wide`. */
  imageID: string | undefined;
  /** ID: `.status.providerID`, `-o wide`. */
  id: string | undefined;
  /** NodePool: `.metadata.labels.karpenter\.sh/nodepool`, `-o wide`. */
  nodePool: string | undefined;
  /** NodeClass: `.spec.nodeClassRef.name`, `-o wide`. */
  nodeClass: string | undefined;
  /** Drifted: `.status.conditions[?(@.type=="Drifted")].status`, `-o wide`. */
  drifted: string | undefined;
}

/** A field as `kubectl` prints it: an empty string is no value. */
function text(value: string | undefined): string | undefined {
  return value === "" ? undefined : value;
}

/** The cells of a NodeClaim's row, Name and Age aside. */
export function nodeClaimColumnValues(nodeClaim: NodeClaim): NodeClaimColumnValues {
  const labels = nodeClaim.metadata?.labels ?? {};
  return {
    type: text(labels["node.kubernetes.io/instance-type"]),
    capacity: text(labels["karpenter.sh/capacity-type"]),
    zone: text(labels["topology.kubernetes.io/zone"]),
    node: text(nodeClaim.status?.nodeName),
    ready: conditionStatus(nodeClaim.status?.conditions, "Ready"),
    imageID: text(nodeClaim.status?.imageID),
    id: text(nodeClaim.status?.providerID),
    nodePool: text(labels["karpenter.sh/nodepool"]),
    nodeClass: text(nodeClaim.spec?.nodeClassRef?.name),
    drifted: conditionStatus(nodeClaim.status?.conditions, "Drifted"),
  };
}

/** A text column sorts by its text, a NodeClaim without one first. */
const byText = (column: keyof NodeClaimColumnValues) => (nodeClaim: NodeClaim) =>
  nodeClaimColumnValues(nodeClaim)[column] ?? "";

/**
 * What each column sorts by: texts by their text, a NodeClaim without one first, and the statuses of conditions in
 * the order of the Ready column of the Node Pools page: `True`, `False`, `Unknown`, then none.
 */
export const nodeClaimSortValues: Record<keyof NodeClaimColumnValues, (nodeClaim: NodeClaim) => string | number> = {
  type: byText("type"),
  capacity: byText("capacity"),
  zone: byText("zone"),
  node: byText("node"),
  ready: (nodeClaim) => conditionStatusOrder(nodeClaimColumnValues(nodeClaim).ready),
  imageID: byText("imageID"),
  id: byText("id"),
  nodePool: byText("nodePool"),
  nodeClass: byText("nodeClass"),
  drifted: (nodeClaim) => conditionStatusOrder(nodeClaimColumnValues(nodeClaim).drifted),
};

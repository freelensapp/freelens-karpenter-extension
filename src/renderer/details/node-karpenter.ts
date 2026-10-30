// What the Karpenter item of the host's Node details shows: pure, from the node's own labels, annotations
// and taints, so that it needs no store.

import { getNodeCapacityType, getNodeZone } from "../components/Topology/topology-utils";
import {
  type CondStatus,
  DISRUPTION_TAINTS,
  getInstanceType,
  getNodeClaimName,
  getNodeStatus,
} from "../utils/kube-helpers";

import type { Node } from "../utils/kube-helpers";

export interface KarpenterNodeInfo {
  nodePool: string;
  nodeClaim: string;
  instanceType: string;
  capacityType: "spot" | "on-demand" | "unknown";
  zone: string;
  status: CondStatus;
  /** Registered and initialized, as Karpenter labels a node once it has done each. */
  registered: boolean;
  initialized: boolean;
  /** Karpenter is disrupting the node: it has the disruption taint. */
  disrupting: boolean;
  /** `karpenter.sh/do-not-disrupt: "true"`: Karpenter does not disrupt the node voluntarily. */
  doNotDisrupt: boolean;
}

/** The Karpenter information of a node, or `null` for a node Karpenter does not manage. */
export function karpenterNodeInfo(node: Node, now = Date.now()): KarpenterNodeInfo | null {
  const labels = node.metadata.labels ?? {};
  const annotations = node.metadata.annotations ?? {};
  const nodePool = labels["karpenter.sh/nodepool"] ?? "";
  const nodeClaim = getNodeClaimName(node);
  if (!nodePool && !nodeClaim) return null;

  return {
    nodePool,
    nodeClaim,
    instanceType: getInstanceType(node),
    capacityType: getNodeCapacityType(node),
    zone: getNodeZone(node),
    status: getNodeStatus(node, now),
    registered: labels["karpenter.sh/registered"] === "true",
    initialized: labels["karpenter.sh/initialized"] === "true",
    disrupting: (node.spec?.taints ?? []).some((taint) => DISRUPTION_TAINTS.includes(taint.key)),
    doNotDisrupt: annotations["karpenter.sh/do-not-disrupt"] === "true",
  };
}

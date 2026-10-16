import { getNodePoolStatus, getNodeStatus } from "../../utils/kube-helpers";

import type { NodePool } from "../../api/nodepool/nodepool-v1";
import type { Node } from "../../utils/kube-helpers";

export interface OverviewStats {
  total: number;
  karpenter: number;
  nonKarpenter: number;
  ready: number;
  notReady: number;
  provisioning: number;
  terminating: number;
  /** Every NodePool, those without nodes included (C2). */
  poolCount: number;
  poolsReady: number;
  poolsNotReady: number;
}

/** The figures of the Overview chart; `now` is the time to compare the age of the nodes with. */
export function computeOverviewStats(nodes: Node[], nodePools: NodePool[], now = Date.now()): OverviewStats {
  const karpenterNodes = nodes.filter((n) => !!n.metadata.labels?.["karpenter.sh/nodepool"]);
  const count = (status: string) => karpenterNodes.filter((n) => getNodeStatus(n, now) === status).length;
  const poolsReady = nodePools.filter((np) => getNodePoolStatus(np) === "Ready").length;

  return {
    total: nodes.length,
    karpenter: karpenterNodes.length,
    nonKarpenter: nodes.length - karpenterNodes.length,
    ready: count("Ready"),
    notReady: count("NotReady"),
    provisioning: count("Provisioning"),
    terminating: count("Terminating"),
    poolCount: nodePools.length,
    poolsReady,
    poolsNotReady: nodePools.length - poolsReady,
  };
}

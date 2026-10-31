// The columns of `kubectl get nodepools -o wide`, from the `additionalPrinterColumns` of karpenter.sh_nodepools.yaml
// of kubernetes-sigs/karpenter v1.15.1: the value of each `jsonPath` as `kubectl` prints it, and the value it sorts by.

import { NodePool } from "../../api/nodepool/nodepool-v1";
import { parseCpuCores, parseMemGi } from "../../utils/kube-helpers";
import { columnText, conditionStatus, conditionStatusOrder } from "../../utils/printer-columns";

export interface NodePoolColumnValues {
  /** NodeClass: `.spec.template.spec.nodeClassRef.name`. */
  nodeClass: string | undefined;
  /** Nodes: `.status.nodes`. */
  nodes: string | undefined;
  /** Ready: `.status.conditions[?(@.type=="Ready")].status`. */
  ready: string | undefined;
  /** Weight: `.spec.weight`, `-o wide`. */
  weight: string | undefined;
  /** CPU: `.status.resources.cpu`, `-o wide`. */
  cpu: string | undefined;
  /** Memory: `.status.resources.memory`, `-o wide`. */
  memory: string | undefined;
}

/** The cells of a NodePool's row, Name and Age aside. */
export function nodePoolColumnValues(nodePool: NodePool): NodePoolColumnValues {
  return {
    nodeClass: NodePool.getTemplateSpec(nodePool)?.nodeClassRef?.name,
    nodes: columnText(nodePool.status?.nodes),
    ready: conditionStatus(nodePool.status?.conditions, "Ready"),
    weight: columnText(nodePool.spec?.weight),
    cpu: columnText(nodePool.status?.resources?.cpu),
    memory: columnText(nodePool.status?.resources?.memory),
  };
}

/** What each column sorts by: numbers by their value, quantities by their amount, a NodePool without one first. */
export const nodePoolSortValues: Record<keyof NodePoolColumnValues, (nodePool: NodePool) => string | number> = {
  nodeClass: (nodePool) => NodePool.getTemplateSpec(nodePool)?.nodeClassRef?.name ?? "",
  nodes: (nodePool) => nodePool.status?.nodes ?? -1,
  ready: (nodePool) => conditionStatusOrder(conditionStatus(nodePool.status?.conditions, "Ready")),
  weight: (nodePool) => nodePool.spec?.weight ?? -1,
  cpu: (nodePool) =>
    nodePool.status?.resources?.cpu === undefined ? -1 : parseCpuCores(nodePool.status.resources.cpu),
  memory: (nodePool) =>
    nodePool.status?.resources?.memory === undefined ? -1 : parseMemGi(nodePool.status.resources.memory),
};

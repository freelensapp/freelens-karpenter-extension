/**
 * What the cards of the Node Classes tab show, as pure functions of the objects.
 */

import { NodePool } from "../../api/nodepool/nodepool-v1";
import { formatMemory } from "../../utils/kube-helpers";

import type { EC2NodeClass } from "../../api/ec2nodeclass/ec2nodeclass-v1";
import type { NodeClassProvider } from "../../data/nodeclass";
import type { AKSNodeClass } from "../../data/stores";
import type { Node } from "../../utils/kube-helpers";

export type NodeClass = EC2NodeClass | AKSNodeClass;

export function nodeClassProvider(nodeClass: NodeClass): Exclude<NodeClassProvider, "unknown"> {
  return nodeClass.kind === "AKSNodeClass" ? "azure" : "aws";
}

export interface MetaItem {
  label: string;
  value: string | number;
}

const hasSettings = (settings: object | undefined) => !!settings && Object.keys(settings).length > 0;

/** The summary of the node class's spec shown in the card's header. */
export function nodeClassMetaItems(nodeClass: NodeClass): MetaItem[] {
  const items: MetaItem[] = [];
  const add = (label: string, value: string | number | undefined) => {
    if (value !== undefined && value !== "" && value !== 0) items.push({ label, value });
  };

  if (nodeClass.kind === "EC2NodeClass") {
    const spec = nodeClass.spec;
    add("Image Family", spec?.amiFamily);
    if (spec?.instanceProfile) add("Instance Profile", spec.instanceProfile);
    else add("Role", spec?.role);
    add("AMI Selectors", spec?.amiSelectorTerms?.length);
    add("Subnets", spec?.subnetSelectorTerms?.length);
    add("Security Groups", spec?.securityGroupSelectorTerms?.length);
    // `spec.kubelet` of karpenter.k8s.aws/v1.
    if (hasSettings(spec?.kubelet)) add("Kubelet Config", "✓");
  } else {
    const spec = nodeClass.spec;
    add("Image Family", spec?.imageFamily);
    if (spec?.osDiskSizeGB != null) add("OS Disk", `${spec.osDiskSizeGB} GB`);
    // `spec.kubelet` of karpenter.azure.com, in v1beta1 and v1alpha2.
    if (hasSettings(spec?.kubelet)) add("Kubelet Config", "✓");
  }
  return items;
}

/** The API group of a node class, from its `apiVersion`. */
function apiGroup(nodeClass: NodeClass): string {
  return nodeClass.apiVersion?.split("/")[0] ?? "";
}

/**
 * The NodePools whose `nodeClassRef` names this node class, by group, kind and name.
 * A reference without a group, which `karpenter.sh/v1` does not allow, matches by kind and name.
 */
export function nodePoolsOfNodeClass(nodeClass: NodeClass, nodePools: NodePool[]): NodePool[] {
  const name = nodeClass.metadata?.name;
  const group = apiGroup(nodeClass);
  return nodePools.filter((nodePool) => {
    const ref = NodePool.getTemplateSpec(nodePool)?.nodeClassRef;
    return !!ref && ref.name === name && ref.kind === nodeClass.kind && (!ref.group || ref.group === group);
  });
}

/** The number of nodes of each NodePool, by the `karpenter.sh/nodepool` label. */
export function countNodesByPool(nodes: Node[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const node of nodes) {
    const pool = node.metadata?.labels?.["karpenter.sh/nodepool"];
    if (pool) counts[pool] = (counts[pool] ?? 0) + 1;
  }
  return counts;
}

export interface NodePoolRowValues {
  cpuUsed: string;
  memoryUsed: string;
  limitCpu: string;
  limitMemory: string;
  consolidation: string;
  expireAfter: string;
}

/** The cells of a NodePool's row in a node class card. */
export function nodePoolRowValues(nodePool: NodePool): NodePoolRowValues {
  const resources = nodePool.status?.resources;
  const memoryUsed = resources?.memory;
  return {
    cpuUsed: resources?.cpu ?? "—",
    // Binary units, as the other tabs show memory.
    memoryUsed: memoryUsed === undefined ? "—" : formatMemory(memoryUsed),
    limitCpu: nodePool.spec?.limits?.cpu ?? "—",
    limitMemory: nodePool.spec?.limits?.memory ?? "—",
    consolidation: nodePool.spec?.disruption?.consolidationPolicy ?? "—",
    // `spec.template.spec.expireAfter` of karpenter.sh/v1.
    expireAfter: NodePool.getTemplateSpec(nodePool)?.expireAfter ?? "—",
  };
}

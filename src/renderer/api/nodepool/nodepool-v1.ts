import { Renderer } from "@freelensapp/extensions";

import type { NodeClaimTemplateSpec, NodePoolSpec, NodePoolStatus } from "../karpenter/karpenter-v1-types";
import type { Condition, KarpenterKubeObjectCRD } from "../types";

export class NodePool extends Renderer.K8sApi.LensExtensionKubeObject<
  Renderer.K8sApi.ClusterScopedMetadata,
  NodePoolStatus,
  NodePoolSpec
> {
  declare kind: "NodePool";
  declare apiVersion: "karpenter.sh/v1";

  static readonly kind = "NodePool";
  static readonly namespaced = false;
  static readonly apiBase = "/apis/karpenter.sh/v1/nodepools";

  static readonly crd: KarpenterKubeObjectCRD = {
    apiVersions: ["karpenter.sh/v1"],
    plural: "nodepools",
    singular: "nodepool",
    title: "Node Pools",
  };

  static getTemplateSpec(nodePool: NodePool): NodeClaimTemplateSpec | undefined {
    return nodePool.spec?.template?.spec;
  }

  /** The weight of a NodePool; none is 0, as Karpenter takes it. A higher weight takes precedence. */
  static getWeight(nodePool: NodePool): number {
    return nodePool.spec?.weight ?? 0;
  }

  static getCondition(nodePool: NodePool, type: string): Condition | undefined {
    return nodePool.status?.conditions?.find((condition) => condition.type === type);
  }
}

export class NodePoolApi extends Renderer.K8sApi.KubeApi<NodePool> {}
export class NodePoolStore extends Renderer.K8sApi.KubeObjectStore<NodePool, NodePoolApi> {}

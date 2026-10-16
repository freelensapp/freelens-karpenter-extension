import { Renderer } from "@freelensapp/extensions";

import type { NodeClaimTemplateSpec, NodePoolSpec, NodePoolStatus } from "../karpenter/karpenter-v1-types";
import type { Condition } from "../types";

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

  static readonly crd = {
    apiVersions: ["karpenter.sh/v1"],
    plural: "nodepools",
    singular: "nodepool",
  };

  static getTemplateSpec(nodePool: NodePool): NodeClaimTemplateSpec | undefined {
    return nodePool.spec?.template?.spec;
  }

  static getCondition(nodePool: NodePool, type: string): Condition | undefined {
    return nodePool.status?.conditions?.find((condition) => condition.type === type);
  }
}

export class NodePoolApi extends Renderer.K8sApi.KubeApi<NodePool> {}
export class NodePoolStore extends Renderer.K8sApi.KubeObjectStore<NodePool, NodePoolApi> {}

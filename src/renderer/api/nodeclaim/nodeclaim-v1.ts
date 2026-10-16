import { Renderer } from "@freelensapp/extensions";

import type { NodeClaimSpec, NodeClaimStatus } from "../karpenter/karpenter-v1-types";

export class NodeClaim extends Renderer.K8sApi.LensExtensionKubeObject<
  Renderer.K8sApi.ClusterScopedMetadata,
  NodeClaimStatus,
  NodeClaimSpec
> {
  declare kind: "NodeClaim";
  declare apiVersion: "karpenter.sh/v1";

  static readonly kind = "NodeClaim";
  static readonly namespaced = false;
  static readonly apiBase = "/apis/karpenter.sh/v1/nodeclaims";

  static readonly crd = {
    apiVersions: ["karpenter.sh/v1"],
    plural: "nodeclaims",
    singular: "nodeclaim",
  };

  /**
   * A NodeClaim is claiming while it has no node yet (`status.nodeName` empty) and is not being deleted.
   */
  static isClaiming(nodeClaim: NodeClaim): boolean {
    return !nodeClaim.metadata.deletionTimestamp && !nodeClaim.status?.nodeName;
  }

  /** The NodePool the NodeClaim belongs to, from its `karpenter.sh/nodepool` label or annotation. */
  static getNodePoolName(nodeClaim: NodeClaim): string {
    return (
      nodeClaim.metadata.labels?.["karpenter.sh/nodepool"] ||
      nodeClaim.metadata.annotations?.["karpenter.sh/nodepool"] ||
      ""
    );
  }
}

export class NodeClaimApi extends Renderer.K8sApi.KubeApi<NodeClaim> {}
export class NodeClaimStore extends Renderer.K8sApi.KubeObjectStore<NodeClaim, NodeClaimApi> {}

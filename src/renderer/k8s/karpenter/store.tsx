import { Renderer } from "@freelensapp/extensions";
import type { KubeObjectMetadata } from "../core/metadata";

const LensExtensionKubeObject = ((Renderer.K8sApi as any).LensExtensionKubeObject ??
  Renderer.K8sApi.KubeObject) as typeof Renderer.K8sApi.KubeObject;

// Karpenter NodePool spec (simplified example)
/*export interface NodePoolSpec {
  template: {
    metadata?: {
      labels?: Record<string, string>;
      annotations?: Record<string, string>;
    };
    spec: {
      nodeClassRef: {
        name: string;
      };
      requirements?: {
        key: string;
        operator: string;
        values: string[];
      }[];
      taints?: {
        key: string;
        value?: string;
        effect: string;
      }[];
    };
  };
  disruption?: {
    consolidationPolicy?: string;
    consolidateAfter?: string;
    expireAfter?: string;
  };
  limits?: {
    cpu?: string;
    memory?: string;
  };
  weight?: number;
}

export interface NodePoolStatus {
  observedGeneration?: number;
  conditions?: {
    type: string;
    status: string;
    lastTransitionTime?: string;
    reason?: string;
    message?: string;
  }[];
  allocated?: {
    cpu: string;
    memory: string;
  };
}
*/

export class NodePool extends LensExtensionKubeObject<KubeObjectMetadata, any, any> {
  static readonly kind = "NodePool";
  static readonly namespaced = false;
  static readonly apiBase = "/apis/karpenter.sh/v1/nodepools";
  static readonly crd = {
    apiVersions: ["karpenter.sh/v1"],
    plural: "nodepools",
    singular: "nodepool",
    shortNames: ["np"],
  };
}

export class NodePoolApi extends Renderer.K8sApi.KubeApi<NodePool> {}

export class NodePoolStore extends Renderer.K8sApi.KubeObjectStore<NodePool, NodePoolApi> {}

export function getNodePoolStore(): Renderer.K8sApi.KubeObjectStore<NodePool> {
  return (NodePool as any).getStore() as Renderer.K8sApi.KubeObjectStore<NodePool>;
}

// ── NodeClaim ────────────────────────────────────────────────────────────────

export class NodeClaim extends LensExtensionKubeObject<KubeObjectMetadata, any, any> {
  static readonly kind = "NodeClaim";
  static readonly namespaced = false;
  static readonly apiBase = "/apis/karpenter.sh/v1/nodeclaims";
  static readonly crd = {
    apiVersions: ["karpenter.sh/v1"],
    plural: "nodeclaims",
    singular: "nodeclaim",
    shortNames: ["nc"],
  };
}

export class NodeClaimApi extends Renderer.K8sApi.KubeApi<NodeClaim> {}

export class NodeClaimStore extends Renderer.K8sApi.KubeObjectStore<NodeClaim, NodeClaimApi> {}

export function getNodeClaimStore(): Renderer.K8sApi.KubeObjectStore<NodeClaim> {
  return (NodeClaim as any).getStore() as Renderer.K8sApi.KubeObjectStore<NodeClaim>;
}

/** A NodeClaim is "claiming" when it has been created but no Node has been
 *  registered to it yet (i.e. status.nodeName is empty). */
export function isClaimingNodeClaim(nc: NodeClaim): boolean {
  if ((nc as any).metadata?.deletionTimestamp) return false;
  const status: any = (nc as any).status ?? {};
  const nodeName: string = status?.nodeName ?? "";
  return !nodeName;
}

/** Return the NodePool name that owns this NodeClaim (if any). */
export function getNodeClaimPoolName(nc: NodeClaim): string {
  const labels: Record<string, string> = (nc as any).metadata?.labels ?? {};
  const annotations: Record<string, string> = (nc as any).metadata?.annotations ?? {};
  return labels["karpenter.sh/nodepool"] || annotations["karpenter.sh/nodepool"] || "";
}

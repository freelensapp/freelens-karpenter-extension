import { Renderer } from "@freelensapp/extensions";
import type { KubeObjectMetadata } from "../core/metadata";

const LensExtensionKubeObject = ((Renderer.K8sApi as any).LensExtensionKubeObject ?? Renderer.K8sApi.KubeObject) as typeof Renderer.K8sApi.KubeObject;

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

export class NodePoolStore extends Renderer.K8sApi.KubeObjectStore<NodePool, NodePoolApi> {
}

export function getNodePoolStore(): Renderer.K8sApi.KubeObjectStore<NodePool> {
  return (NodePool as any).getStore() as Renderer.K8sApi.KubeObjectStore<NodePool>;
}

import { Renderer } from "@freelensapp/extensions";
import type { KubeObjectMetadata } from "../core/metadata";

const KubeObject = Renderer.K8sApi.KubeObject;
const KubeObjectStore = Renderer.K8sApi.KubeObjectStore;

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



export class NodePool extends KubeObject<KubeObjectMetadata, any, any> {
  static readonly kind = "NodePool";
  static readonly namespaced = false;
  static readonly apiBase = "/apis/karpenter.sh/v1/nodepools";
}

export class NodePoolApi extends Renderer.K8sApi.KubeApi<NodePool> {}
export const nodePoolApi = new NodePoolApi({ objectConstructor: NodePool });

export class NodePoolStore extends KubeObjectStore<NodePool> {
  api: Renderer.K8sApi.KubeApi<NodePool> = nodePoolApi;
}
export const nodePoolStore = new NodePoolStore();

Renderer.K8sApi.apiManager.registerStore(nodePoolStore);

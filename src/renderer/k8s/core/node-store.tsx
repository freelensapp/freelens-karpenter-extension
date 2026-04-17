import { Renderer } from "@freelensapp/extensions";
const KubeObject = Renderer.K8sApi.KubeObject;
const KubeObjectStore = Renderer.K8sApi.KubeObjectStore;
import type { KubeJsonApiData, KubeObjectMetadata, KubeObjectScope, NamespaceScopedMetadata } from "./api-types";

export interface NodeMetricsData extends KubeJsonApiData<KubeObjectMetadata<KubeObjectScope>, void, void> {
  timestamp: string;
  window: string;
}

export interface NodeMetricsContainerUsage {
  cpu: string;
  memory: string;
}

export interface NodeMetricsContainer {
  name: string;
  usage: NodeMetricsContainerUsage;
}
export class NodeMetrics extends KubeObject<NamespaceScopedMetadata, void, void> {
  static readonly kind = "NodeMetrics";

  static readonly apiBase = "/apis/metrics.k8s.io/v1beta1/nodes";

  timestamp: string;

  window: string;

  constructor({ timestamp, window, containers, ...rest }: NodeMetricsData) {
    super(rest as any);
    this.timestamp = timestamp;
    this.window = window;
  }
}



export class Node extends KubeObject {
  static readonly kind = "Node";
  static readonly namespaced = false;
  static readonly apiBase = "/api/v1/nodes";
}

export class NodeApi extends Renderer.K8sApi.KubeApi<Node> {}
export const nodeApi = new NodeApi({ objectConstructor: Node });
export class NodeStore extends KubeObjectStore<Node> {
  api = nodeApi;

  // Mappa: nodeName -> usage { cpu, memory }
  usageMetrics: Record<string, { cpu: string; memory: string }> = {};

  async loadUsageMetrics() {
    try {
      const res = await fetch("/apis/metrics.k8s.io/v1beta1/nodes");
      if (!res.ok) return;
      const data = await res.json();
      this.usageMetrics = {};
      for (const item of data.items ?? []) {
        this.usageMetrics[item.metadata.name] = {
          cpu: item.usage.cpu,
          memory: item.usage.memory,
        };
      }
    } catch {
      // metrics-server not available — silently ignore
    }
  }

  async loadAll(): Promise<Node[] | undefined> {
    const result = await super.loadAll();
    // Load metrics in background — don't block or throw
    this.loadUsageMetrics().then(() => {
      this.items.forEach(node => {
        const usage = this.usageMetrics[node.getName()];
        if (usage) {
          node.status = {
            ...node.status as any,
            usage,
          };
        }
      });
    }).catch(() => {/* ignore */});
    return result;
  }
}

export const nodeStore = new NodeStore();

Renderer.K8sApi.apiManager.registerStore(nodeStore);

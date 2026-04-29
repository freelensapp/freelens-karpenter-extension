/*import { Renderer } from "@freelensapp/extensions";
const KubeObject = Renderer.K8sApi.KubeObject;
const KubeObjectStore = Renderer.K8sApi.KubeObjectStore;

export class Node extends KubeObject {
  static readonly kind = "Node";
  static readonly namespaced = false;
  static readonly apiBase = "/api/v1/nodes";
}
export class NodeApi extends Renderer.K8sApi.KubeApi<Node> {}
export const nodeApi = new NodeApi({ objectConstructor: Node });

export class NodeStore extends KubeObjectStore<Node> {
  api = nodeApi;
}
export const nodeStore = new NodeStore();

Renderer.K8sApi.apiManager.registerStore(nodeStore);*/

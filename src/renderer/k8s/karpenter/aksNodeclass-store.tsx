import { Renderer } from "@freelensapp/extensions";
import type { KubeObjectMetadata } from "../core/metadata";

const KubeObject = Renderer.K8sApi.KubeObject;
const KubeObjectStore = Renderer.K8sApi.KubeObjectStore;

export class AKSNodeClass extends KubeObject<KubeObjectMetadata, any, any> {
  static readonly kind = "AKSNodeClass";
  static readonly namespaced = false;
  static readonly apiBase = "/apis/karpenter.azure.com/v1alpha2/aksnodeclasses";
}

export class AKSNodeClassApi extends Renderer.K8sApi.KubeApi<AKSNodeClass> {}
export const aksNodeClassApi = new AKSNodeClassApi({ objectConstructor: AKSNodeClass });

export class AKSNodeClassStore extends KubeObjectStore<AKSNodeClass> {
  api: Renderer.K8sApi.KubeApi<AKSNodeClass> = aksNodeClassApi;
}
export const aksNodeClassStore = new AKSNodeClassStore();

Renderer.K8sApi.apiManager.registerStore(aksNodeClassStore);

import { Renderer } from "@freelensapp/extensions";
import type { KubeObjectMetadata } from "../core/metadata";

const KubeObject = Renderer.K8sApi.KubeObject;
const KubeObjectStore = Renderer.K8sApi.KubeObjectStore;

export class EC2NodeClass extends KubeObject<KubeObjectMetadata, any, any> {
  static readonly kind = "EC2NodeClass";
  static readonly namespaced = false;
  static readonly apiBase = "/apis/karpenter.k8s.aws/v1/ec2nodeclasses";
}

export class EC2NodeClassApi extends Renderer.K8sApi.KubeApi<EC2NodeClass> {}
export const ec2NodeClassApi = new EC2NodeClassApi({ objectConstructor: EC2NodeClass });

export class EC2NodeClassStore extends KubeObjectStore<EC2NodeClass> {
  api: Renderer.K8sApi.KubeApi<EC2NodeClass> = ec2NodeClassApi;
}
export const ec2NodeClassStore = new EC2NodeClassStore();

Renderer.K8sApi.apiManager.registerStore(ec2NodeClassStore);

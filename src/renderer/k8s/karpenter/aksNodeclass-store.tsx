import { Renderer } from "@freelensapp/extensions";
import type { KubeObjectMetadata } from "../core/metadata";

const LensExtensionKubeObject = ((Renderer.K8sApi as any).LensExtensionKubeObject ?? Renderer.K8sApi.KubeObject) as typeof Renderer.K8sApi.KubeObject;

export class AKSNodeClass extends LensExtensionKubeObject<KubeObjectMetadata, any, any> {
  static readonly kind = "AKSNodeClass";
  static readonly namespaced = false;
  static readonly apiBase = "/apis/karpenter.azure.com/v1alpha2/aksnodeclasses";
  static readonly crd = {
    apiVersions: ["karpenter.azure.com/v1alpha2"],
    plural: "aksnodeclasses",
    singular: "aksnodeclass",
  };
}

export class AKSNodeClassApi extends Renderer.K8sApi.KubeApi<AKSNodeClass> {}

export class AKSNodeClassStore extends Renderer.K8sApi.KubeObjectStore<AKSNodeClass, AKSNodeClassApi> {
}

export function getAKSNodeClassStore(): Renderer.K8sApi.KubeObjectStore<AKSNodeClass> | undefined {
  try {
    return (AKSNodeClass as any).getStore() as Renderer.K8sApi.KubeObjectStore<AKSNodeClass>;
  } catch {
    return undefined;
  }
}

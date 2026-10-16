import { Renderer } from "@freelensapp/extensions";

import type { AKSNodeClassSpec, AKSNodeClassStatus } from "./aksnodeclass-v1alpha2-types";

export class AKSNodeClass extends Renderer.K8sApi.LensExtensionKubeObject<
  Renderer.K8sApi.ClusterScopedMetadata,
  AKSNodeClassStatus,
  AKSNodeClassSpec
> {
  declare kind: "AKSNodeClass";
  declare apiVersion: "karpenter.azure.com/v1alpha2";

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
export class AKSNodeClassStore extends Renderer.K8sApi.KubeObjectStore<AKSNodeClass, AKSNodeClassApi> {}

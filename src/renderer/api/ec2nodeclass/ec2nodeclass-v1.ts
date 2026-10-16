import { Renderer } from "@freelensapp/extensions";

import type { EC2NodeClassSpec, EC2NodeClassStatus } from "./ec2nodeclass-v1-types";

export class EC2NodeClass extends Renderer.K8sApi.LensExtensionKubeObject<
  Renderer.K8sApi.ClusterScopedMetadata,
  EC2NodeClassStatus,
  EC2NodeClassSpec
> {
  declare kind: "EC2NodeClass";
  declare apiVersion: "karpenter.k8s.aws/v1";

  static readonly kind = "EC2NodeClass";
  static readonly namespaced = false;
  static readonly apiBase = "/apis/karpenter.k8s.aws/v1/ec2nodeclasses";

  static readonly crd = {
    apiVersions: ["karpenter.k8s.aws/v1"],
    plural: "ec2nodeclasses",
    singular: "ec2nodeclass",
  };
}

export class EC2NodeClassApi extends Renderer.K8sApi.KubeApi<EC2NodeClass> {}
export class EC2NodeClassStore extends Renderer.K8sApi.KubeObjectStore<EC2NodeClass, EC2NodeClassApi> {}

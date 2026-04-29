import { Renderer } from "@freelensapp/extensions";
import type { KubeObjectMetadata } from "../core/metadata";

const LensExtensionKubeObject = ((Renderer.K8sApi as any).LensExtensionKubeObject ??
  Renderer.K8sApi.KubeObject) as typeof Renderer.K8sApi.KubeObject;

export class EC2NodeClass extends LensExtensionKubeObject<KubeObjectMetadata, any, any> {
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

export class EC2NodeClassStore extends Renderer.K8sApi.KubeObjectStore<EC2NodeClass, EC2NodeClassApi> {
  constructor(api: EC2NodeClassApi) {
    super(api);
  }
}

let ec2NodeClassStore: EC2NodeClassStore | undefined;

export function getEC2NodeClassStore(): EC2NodeClassStore {
  if (!ec2NodeClassStore) {
    ec2NodeClassStore = new EC2NodeClassStore(new EC2NodeClassApi({ objectConstructor: EC2NodeClass }));
    Renderer.K8sApi.apiManager.registerStore(ec2NodeClassStore);
  }

  return ec2NodeClassStore;
}

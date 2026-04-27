import { Renderer } from "@freelensapp/extensions";

const KubeObjectStore = Renderer.K8sApi.KubeObjectStore;

type CustomResourceDefinition = Renderer.K8sApi.CustomResourceDefinition;
const CustomResourceDefinition = Renderer.K8sApi.CustomResourceDefinition;

export class CrdApi extends Renderer.K8sApi.KubeApi<CustomResourceDefinition> {}

export class CrdStore extends KubeObjectStore<CustomResourceDefinition, CrdApi> {
  constructor(api: CrdApi) {
    super(api);
  }
}

let crdStore: CrdStore | undefined;

export function getCrdStore(): CrdStore {
  if (!crdStore) {
    crdStore = new CrdStore(new CrdApi({ objectConstructor: CustomResourceDefinition }));
    Renderer.K8sApi.apiManager.registerStore(crdStore);
  }

  return crdStore;
}

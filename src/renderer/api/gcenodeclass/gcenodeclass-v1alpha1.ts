import { Renderer } from "@freelensapp/extensions";

import type { GCENodeClassSpec, GCENodeClassStatus } from "./gcenodeclass-v1alpha1-types";

export class GCENodeClass extends Renderer.K8sApi.LensExtensionKubeObject<
  Renderer.K8sApi.ClusterScopedMetadata,
  GCENodeClassStatus,
  GCENodeClassSpec
> {
  declare kind: "GCENodeClass";
  declare apiVersion: "karpenter.k8s.gcp/v1alpha1";

  static readonly kind = "GCENodeClass";
  static readonly namespaced = false;
  static readonly apiBase = "/apis/karpenter.k8s.gcp/v1alpha1/gcenodeclasses";

  static readonly crd = {
    apiVersions: ["karpenter.k8s.gcp/v1alpha1"],
    plural: "gcenodeclasses",
    singular: "gcenodeclass",
  };

  /**
   * The image family the node class launches, as the provider resolves it (`GCENodeClass.ImageFamily()`):
   * `spec.imageFamily`, else the family of the first alias term (`ContainerOptimizedOS@latest`), else the first
   * family term, else `Custom`, for images selected by id. A family term is shown as written (`Ubuntu2404`), where
   * the provider folds the Ubuntu releases into `Ubuntu`.
   */
  static getImageFamily(nodeClass: GCENodeClass): string | undefined {
    const spec = nodeClass.spec;
    if (!spec) return undefined;
    if (spec.imageFamily) return spec.imageFamily;
    const terms = spec.imageSelectorTerms ?? [];
    const alias = terms.find((term) => term.alias)?.alias;
    if (alias) return alias.split("@")[0];
    const family = terms.find((term) => term.family)?.family;
    if (family) return family;
    return terms.length > 0 ? "Custom" : undefined;
  }
}

export class GCENodeClassApi extends Renderer.K8sApi.KubeApi<GCENodeClass> {}
export class GCENodeClassStore extends Renderer.K8sApi.KubeObjectStore<GCENodeClass, GCENodeClassApi> {}

import { Renderer } from "@freelensapp/extensions";

import type { KarpenterKubeObjectCRD } from "../types";
import type { GCECustomMachineTypeSpec, GCECustomMachineTypeStatus } from "./gcecustommachinetype-v1alpha1-types";

/**
 * A GCE custom machine type that the GCP provider adds to its instance types, with the prices it schedules by, which
 * GCP does not publish for custom shapes. The provider resolves it in the zones of the cluster.
 */
export class GCECustomMachineType extends Renderer.K8sApi.LensExtensionKubeObject<
  Renderer.K8sApi.ClusterScopedMetadata,
  GCECustomMachineTypeStatus,
  GCECustomMachineTypeSpec
> {
  declare kind: "GCECustomMachineType";
  declare apiVersion: "karpenter.k8s.gcp/v1alpha1";

  static readonly kind = "GCECustomMachineType";
  static readonly namespaced = false;
  static readonly apiBase = "/apis/karpenter.k8s.gcp/v1alpha1/gcecustommachinetypes";

  static readonly crd: KarpenterKubeObjectCRD = {
    apiVersions: ["karpenter.k8s.gcp/v1alpha1"],
    plural: "gcecustommachinetypes",
    singular: "gcecustommachinetype",
    title: "GCE Custom Machine Types",
  };

  /**
   * The memory the provider resolved for the machine type, as a quantity: `status.memoryMb` is in MiB, as GCE counts
   * the memory of a machine type (`n2-custom-8-24576` has 24 GiB), so `24576Mi`. None until it is resolved.
   */
  static getMemory(machineType: GCECustomMachineType): string | undefined {
    const memoryMb = machineType.status?.memoryMb;
    return memoryMb ? `${memoryMb}Mi` : undefined;
  }
}

export class GCECustomMachineTypeApi extends Renderer.K8sApi.KubeApi<GCECustomMachineType> {}
export class GCECustomMachineTypeStore extends Renderer.K8sApi.KubeObjectStore<
  GCECustomMachineType,
  GCECustomMachineTypeApi
> {}

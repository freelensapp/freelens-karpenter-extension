// The columns of `kubectl get gcenodeclasses -o wide`, from the `additionalPrinterColumns` of
// karpenter.k8s.gcp_gcenodeclasses.yaml of cloudpilot-ai/karpenter-provider-gcp v0.6.1: the value of each `jsonPath`
// as `kubectl` prints it, and the value it sorts by. The CRD has no `-o wide` column.

import { conditionStatus, conditionStatusOrder } from "../../utils/printer-columns";

import type { GCENodeClass } from "../../api/gcenodeclass/gcenodeclass-v1alpha1";

export interface GCENodeClassColumnValues {
  /** Ready: `.status.conditions[?(@.type=="Ready")].status`. */
  ready: string | undefined;
}

/** The cells of a GCENodeClass's row, Name and Age aside. */
export function gceNodeClassColumnValues(nodeClass: GCENodeClass): GCENodeClassColumnValues {
  return {
    ready: conditionStatus(nodeClass.status?.conditions, "Ready"),
  };
}

/**
 * What each column sorts by: the status of Ready in the order of the other pages, `True`, `False`, `Unknown`, then
 * none.
 */
export const gceNodeClassSortValues: Record<
  keyof GCENodeClassColumnValues,
  (nodeClass: GCENodeClass) => string | number
> = {
  ready: (nodeClass) => conditionStatusOrder(gceNodeClassColumnValues(nodeClass).ready),
};

/** The fields of an image selector term that name an image family, also of one made of `spec.imageFamily`. */
type ImageTerm = { alias?: string; family?: string; channel?: string; version?: string };

/**
 * Image Family, which the CRD has no printer column for: the family of each image selector term with its version,
 * `family=version`, its channel without one, `latest` without either; an alias term, `Family@version`, is the same
 * pair. A term without a family, which selects an image by id, has none. A node class without terms, which the CRD of
 * v0.6.1 rejects, with `spec.imageFamily` alone has that family at `latest`.
 */
export function gceNodeClassImageTerms(nodeClass: GCENodeClass): string[] {
  const spec = nodeClass.spec;
  const terms: ImageTerm[] = spec?.imageSelectorTerms?.length
    ? spec.imageSelectorTerms
    : spec?.imageFamily
      ? [{ family: spec.imageFamily }]
      : [];
  return terms.flatMap((term) => {
    const [aliasFamily, aliasVersion] = term.alias?.split("@") ?? [];
    const family = term.family ?? aliasFamily;
    return family ? [`${family}=${term.version || term.channel || aliasVersion || "latest"}`] : [];
  });
}

/**
 * Disks, which the CRD has no printer column for: each disk of `spec.disks` as one short text, the boot disk said so,
 * then its size and its category, `boot 100 GiB pd-balanced`; the details have the rest of each disk.
 */
export function gceNodeClassDiskLabels(nodeClass: GCENodeClass): string[] {
  return (nodeClass.spec?.disks ?? []).map(
    (disk) =>
      [disk.boot ? "boot" : undefined, disk.sizeGiB ? `${disk.sizeGiB} GiB` : undefined, disk.category]
        .filter(Boolean)
        .join(" ") || "disk",
  );
}

/** Subnet, which the CRD has no printer column for: `spec.subnetRangeName`; an empty one is none. */
export function gceNodeClassSubnet(nodeClass: GCENodeClass): string | undefined {
  return nodeClass.spec?.subnetRangeName || undefined;
}

// The columns of `kubectl get aksnodeclasses -o wide`, from the `additionalPrinterColumns` of
// karpenter.azure.com_aksnodeclasses.yaml of Azure/karpenter-provider-azure v1.14.5, the same in v1beta1 and
// v1alpha2: the value of each `jsonPath` as `kubectl` prints it, and the value it sorts by.

import { conditionStatus, conditionStatusOrder } from "../../utils/printer-columns";

import type { AKSNodeClass } from "../../data/stores";

export interface AKSNodeClassColumnValues {
  /** Ready: `.status.conditions[?(@.type=='Ready')].status`. */
  ready: string | undefined;
  /** ImageFamily: `.spec.imageFamily`, `-o wide`. Empty when it is not set, which the provider defaults. */
  imageFamily: string | undefined;
}

/** The cells of an AKSNodeClass's row, of either version, Name and Age aside. */
export function aksNodeClassColumnValues(nodeClass: AKSNodeClass): AKSNodeClassColumnValues {
  return {
    ready: conditionStatus(nodeClass.status?.conditions, "Ready"),
    imageFamily: nodeClass.spec?.imageFamily || undefined,
  };
}

/**
 * What each column sorts by: the status of Ready in the order of the other pages, `True`, `False`, `Unknown`, then
 * none, and the image family by its name, an AKSNodeClass without one first.
 */
export const aksNodeClassSortValues: Record<
  keyof AKSNodeClassColumnValues,
  (nodeClass: AKSNodeClass) => string | number
> = {
  ready: (nodeClass) => conditionStatusOrder(aksNodeClassColumnValues(nodeClass).ready),
  imageFamily: (nodeClass) => aksNodeClassColumnValues(nodeClass).imageFamily ?? "",
};

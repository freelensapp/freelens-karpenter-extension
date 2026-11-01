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

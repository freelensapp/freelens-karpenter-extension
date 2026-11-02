// The columns of `kubectl get gcecustommachinetypes -o wide`, from the `additionalPrinterColumns` of
// karpenter.k8s.gcp_gcecustommachinetypes.yaml of cloudpilot-ai/karpenter-provider-gcp v0.7.0: the value of each
// `jsonPath` as `kubectl` prints it, and the value it sorts by. The CRD has no `-o wide` column.

import { conditionStatus, conditionStatusOrder } from "../../utils/printer-columns";

import type { GCECustomMachineType } from "../../api/gcecustommachinetype/gcecustommachinetype-v1alpha1";

export interface GCECustomMachineTypeColumnValues {
  /** MachineType: `.spec.machineType`. */
  machineType: string | undefined;
  /** Ready: `.status.conditions[?(@.type=="Ready")].status`. */
  ready: string | undefined;
}

/** The cells of a GCECustomMachineType's row, Name and Age aside. */
export function gceCustomMachineTypeColumnValues(machineType: GCECustomMachineType): GCECustomMachineTypeColumnValues {
  return {
    machineType: machineType.spec?.machineType || undefined,
    ready: conditionStatus(machineType.status?.conditions, "Ready"),
  };
}

/**
 * What each column sorts by: the machine type by its name, none first, and the status of Ready in the order of the
 * other pages, `True`, `False`, `Unknown`, then none.
 */
export const gceCustomMachineTypeSortValues: Record<
  keyof GCECustomMachineTypeColumnValues,
  (machineType: GCECustomMachineType) => string | number
> = {
  machineType: (machineType) => gceCustomMachineTypeColumnValues(machineType).machineType ?? "",
  ready: (machineType) => conditionStatusOrder(gceCustomMachineTypeColumnValues(machineType).ready),
};

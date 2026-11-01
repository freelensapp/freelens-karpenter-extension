// The columns of `kubectl get nodeoverlays -o wide`, from the `additionalPrinterColumns` of
// karpenter.sh_nodeoverlays.yaml of kubernetes-sigs/karpenter v1.15.1: the value of each `jsonPath` as `kubectl`
// prints it, and the value it sorts by.

import { columnText, conditionStatus, conditionStatusOrder } from "../../utils/printer-columns";

import type { NodeOverlay } from "../../api/nodeoverlay/nodeoverlay-v1alpha1";

export interface NodeOverlayColumnValues {
  /** Ready: `.status.conditions[?(@.type=="Ready")].status`. */
  ready: string | undefined;
  /** Weight: `.spec.weight`, `-o wide`. */
  weight: string | undefined;
}

/** The cells of a NodeOverlay's row, Name and Age aside. */
export function nodeOverlayColumnValues(overlay: NodeOverlay): NodeOverlayColumnValues {
  return {
    ready: conditionStatus(overlay.status?.conditions, "Ready"),
    weight: columnText(overlay.spec?.weight),
  };
}

/**
 * What each column sorts by: the status of Ready in the order of the other pages, `True`, `False`, `Unknown`, then
 * none, and the weight by its value, a NodeOverlay without one first.
 */
export const nodeOverlaySortValues: Record<keyof NodeOverlayColumnValues, (overlay: NodeOverlay) => string | number> = {
  ready: (overlay) => conditionStatusOrder(conditionStatus(overlay.status?.conditions, "Ready")),
  weight: (overlay) => overlay.spec?.weight ?? -1,
};

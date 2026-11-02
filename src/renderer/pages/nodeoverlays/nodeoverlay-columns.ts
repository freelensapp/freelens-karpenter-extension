// The columns of `kubectl get nodeoverlays -o wide`, from the `additionalPrinterColumns` of
// karpenter.sh_nodeoverlays.yaml of kubernetes-sigs/karpenter v1.15.1: the value of each `jsonPath` as `kubectl`
// prints it, and the value it sorts by.

import { NodeOverlay } from "../../api/nodeoverlay/nodeoverlay-v1alpha1";
import { conditionStatus, conditionStatusOrder } from "../../utils/printer-columns";

export interface NodeOverlayColumnValues {
  /** Ready: `.status.conditions[?(@.type=="Ready")].status`. */
  ready: string | undefined;
  /** Weight: `.spec.weight`, `-o wide`; 0 without one, the weight Karpenter takes. */
  weight: string;
}

/** The cells of a NodeOverlay's row, Name and Age aside. */
export function nodeOverlayColumnValues(overlay: NodeOverlay): NodeOverlayColumnValues {
  return {
    ready: conditionStatus(overlay.status?.conditions, "Ready"),
    weight: String(NodeOverlay.getWeight(overlay)),
  };
}

/**
 * What each column sorts by: the status of Ready in the order of the other pages, `True`, `False`, `Unknown`, then
 * none, and the weight by its value, 0 without one.
 */
export const nodeOverlaySortValues: Record<keyof NodeOverlayColumnValues, (overlay: NodeOverlay) => string | number> = {
  ready: (overlay) => conditionStatusOrder(conditionStatus(overlay.status?.conditions, "Ready")),
  weight: (overlay) => NodeOverlay.getWeight(overlay),
};

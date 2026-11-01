// What the details of a NodeOverlay compute from it and from the NodePools around it.

import { NodeOverlay } from "../api/nodeoverlay/nodeoverlay-v1alpha1";
import { conditionStatus } from "../utils/printer-columns";

import type { NodePool } from "../api/nodepool/nodepool-v1";

/**
 * The NodePools whose nodes the NodeOverlay can apply to, by name: the same matching as `NodeOverlay.forNodePool`,
 * which lists the NodeOverlays of a NodePool in its details and on its card.
 */
export function nodePoolsOfOverlay(overlay: NodeOverlay, nodePools: readonly NodePool[]): string[] {
  return nodePools
    .filter((nodePool) => NodeOverlay.appliesTo(overlay, nodePool))
    .map((nodePool) => nodePool.getName())
    .sort((a, b) => a.localeCompare(b));
}

/**
 * Whether Karpenter rejected the NodeOverlay: its ValidationSucceeded condition is `False`, for a runtime validation
 * that failed (`RuntimeValidation`) or a conflict with an overlay of the same weight (`Conflict`). Karpenter then
 * applies it to no instance type. Before Karpenter has validated it, the condition is `Unknown` or missing, and the
 * overlay is not taken as rejected.
 */
export function isRejected(overlay: NodeOverlay): boolean {
  return conditionStatus(overlay.status?.conditions, "ValidationSucceeded") === "False";
}

// What the details of a NodeOverlay compute from it and from the NodePools around it.

import { NodeOverlay } from "../api/nodeoverlay/nodeoverlay-v1alpha1";

import type { NodePool } from "../api/nodepool/nodepool-v1";

/**
 * The NodePools whose nodes the NodeOverlay can apply to, by name: the matching of `NodeOverlay.appliesTo`, as the
 * details and the card of a NodePool list its NodeOverlays, the ones Karpenter rejected apart.
 */
export function nodePoolsOfOverlay(overlay: NodeOverlay, nodePools: readonly NodePool[]): string[] {
  return nodePools
    .filter((nodePool) => NodeOverlay.appliesTo(overlay, nodePool))
    .map((nodePool) => nodePool.getName())
    .sort((a, b) => a.localeCompare(b));
}

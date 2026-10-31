// What the details of a NodePool compute from it and from the objects around it.

import { NodeOverlay } from "../api/nodeoverlay/nodeoverlay-v1alpha1";

import type { NodeClaim } from "../api/nodeclaim/nodeclaim-v1";
import type { NodePool } from "../api/nodepool/nodepool-v1";

/** The NodeClaims of a NodePool, by its `karpenter.sh/nodepool` label, by name. */
export function nodeClaimsOfNodePool(nodePool: NodePool, nodeClaims: readonly NodeClaim[]): NodeClaim[] {
  const name = nodePool.getName();
  return nodeClaims
    .filter((nodeClaim) => nodeClaim.metadata?.labels?.["karpenter.sh/nodepool"] === name)
    .sort((a, b) => a.getName().localeCompare(b.getName()));
}

export interface OverlayOfNodePool {
  name: string;
  weight: number;
  /** What the overlay changes, as the NodePool card lists it. */
  changes: string;
}

/** The NodeOverlays that can apply to the nodes of a NodePool, the one that takes precedence first. */
export function overlaysOfNodePool(nodePool: NodePool, overlays: readonly NodeOverlay[]): OverlayOfNodePool[] {
  return NodeOverlay.forNodePool([...overlays], nodePool).map((overlay) => ({
    name: overlay.getName(),
    weight: NodeOverlay.getWeight(overlay),
    changes: NodeOverlay.describe(overlay).join(", "),
  }));
}

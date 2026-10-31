import { NodePool } from "./api/nodepool/nodepool-v1";

import type { Common } from "@freelensapp/extensions";

/**
 * The model classes of the kinds that have a page of the extension. While the extension is enabled, the host leaves
 * them out of the Custom Resources tree of the cluster sidebar, where they would be listed a second time next to
 * "Karpenter"; a group of the tree left without kinds goes with them. Every modeled version of a kind is listed. A
 * kind without a page of its own stays out, so that the tree keeps it.
 */
export const customResources: Common.Types.CustomResourceRegistration[] = [NodePool];

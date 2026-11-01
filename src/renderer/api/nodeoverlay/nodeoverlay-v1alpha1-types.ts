// The spec and status types of karpenter.sh/v1alpha1 (NodeOverlay), after the Go types of
// kubernetes-sigs/karpenter v1.15.0 (pkg/apis/v1alpha1) and the optional fields of its generated CRD.

import type { Condition, KarpenterNodeSelectorOperator, ResourceList } from "../types";

// Its own type in pkg/apis/v1alpha1, with the operators Gte and Lte too, so not the one of "../types".
export interface NodeSelectorRequirement {
  key: string;
  operator: KarpenterNodeSelectorOperator;
  values?: string[];
}

export interface NodeOverlaySpec {
  requirements: NodeSelectorRequirement[];
  priceAdjustment?: string;
  price?: string;
  capacity?: ResourceList;
  weight?: number;
}

export interface NodeOverlayStatus {
  conditions?: Condition[];
}

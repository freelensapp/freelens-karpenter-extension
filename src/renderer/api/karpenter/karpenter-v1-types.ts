// The spec and status types of karpenter.sh/v1 (NodePool, NodeClaim), after the Go types of
// kubernetes-sigs/karpenter v1.15.0 (pkg/apis/v1) and the optional fields of its generated CRDs.

import type { Condition, NillableDuration, NodeSelectorOperator, ResourceList, Taint } from "../types";

export interface ObjectMeta {
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
}

export interface NodeSelectorRequirementWithMinValues {
  key: string;
  operator: NodeSelectorOperator;
  values?: string[];
  minValues?: number;
}

export interface NodeClassReference {
  kind: string;
  name: string;
  group: string;
}

export interface NodeClaimTemplateSpec {
  taints?: Taint[];
  startupTaints?: Taint[];
  requirements: NodeSelectorRequirementWithMinValues[];
  nodeClassRef: NodeClassReference;
  terminationGracePeriod?: string;
  expireAfter?: NillableDuration;
}

export interface NodeClaimTemplate {
  metadata?: ObjectMeta;
  spec: NodeClaimTemplateSpec;
}

export type ConsolidationPolicy = "WhenEmpty" | "WhenEmptyOrUnderutilized" | "Balanced";

export type DisruptionReason = "Underutilized" | "Empty" | "Drifted" | "Unhealthy";

export interface Budget {
  reasons?: DisruptionReason[];
  nodes: string;
  schedule?: string;
  duration?: string;
}

export interface Disruption {
  consolidateAfter?: NillableDuration;
  consolidationPolicy?: ConsolidationPolicy;
  budgets?: Budget[];
}

export interface NodePoolSpec {
  template: NodeClaimTemplate;
  disruption?: Disruption;
  limits?: ResourceList;
  weight?: number;
  replicas?: number;
}

export interface NodePoolStatus {
  resources?: ResourceList;
  nodes?: number;
  nodeClassObservedGeneration?: number;
  conditions?: Condition[];
}

export interface ResourceRequirements {
  requests?: ResourceList;
}

export interface NodeClaimSpec {
  taints?: Taint[];
  startupTaints?: Taint[];
  requirements: NodeSelectorRequirementWithMinValues[];
  resources?: ResourceRequirements;
  nodeClassRef: NodeClassReference;
  terminationGracePeriod?: string;
  expireAfter?: NillableDuration;
}

export interface NodeClaimStatus {
  nodeName?: string;
  providerID?: string;
  imageID?: string;
  capacity?: ResourceList;
  allocatable?: ResourceList;
  conditions?: Condition[];
  lastPodEventTime?: string;
}

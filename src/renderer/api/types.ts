import type { Renderer } from "@freelensapp/extensions";

// Types of other packages that the Karpenter APIs use, shared by the models.

/** `status.Condition` of awslabs/operatorpkg: the host's condition type has the same fields. */
export type Condition = Renderer.K8sApi.Condition;

/**
 * `NillableDuration` of karpenter.sh/v1: a Go duration such as `720h` or `30s`, or `Never`.
 */
export type NillableDuration = string;

/**
 * `resource.Quantity`, `x-kubernetes-int-or-string` in a CRD. The API server keeps a quantity of a custom resource
 * as it was written, so one written without quotes, such as `cpu: 100`, comes back as a number.
 */
export type Quantity = string | number;

/** `corev1.ResourceList`: quantities by resource name, such as `{ cpu: "4", memory: "16Gi" }` or `{ cpu: 100 }`. */
export type ResourceList = Record<string, Quantity>;

/** `corev1.NodeSelectorOperator`. */
export type NodeSelectorOperator = "In" | "NotIn" | "Exists" | "DoesNotExist" | "Gt" | "Lt";

/**
 * The operators of a requirement of karpenter.sh, `v1` and `v1alpha1`: those of `corev1.NodeSelectorOperator`, with
 * `Gte` and `Lte` (the `+kubebuilder:validation:Enum` of their `operator`).
 */
export type KarpenterNodeSelectorOperator = NodeSelectorOperator | "Gte" | "Lte";

/** `corev1.NodeSelectorRequirement`. */
export interface NodeSelectorRequirement {
  key: string;
  operator: NodeSelectorOperator;
  values?: string[];
}

/** `corev1.TaintEffect`. */
export type TaintEffect = "NoSchedule" | "PreferNoSchedule" | "NoExecute";

/** `corev1.Taint`. */
export interface Taint {
  key: string;
  value?: string;
  effect: TaintEffect;
  timeAdded?: string;
}

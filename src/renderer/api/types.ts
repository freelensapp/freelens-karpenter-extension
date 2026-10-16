import type { Renderer } from "@freelensapp/extensions";

// Types of other packages that the Karpenter APIs use, shared by the models.

/** `status.Condition` of awslabs/operatorpkg: the host's condition type has the same fields. */
export type Condition = Renderer.K8sApi.Condition;

/**
 * `NillableDuration` of karpenter.sh/v1: a Go duration such as `720h` or `30s`, or `Never`.
 */
export type NillableDuration = string;

/** `corev1.ResourceList`: quantities by resource name, such as `{ cpu: "4", memory: "16Gi" }`. */
export type ResourceList = Record<string, string>;

/** `corev1.NodeSelectorOperator`. */
export type NodeSelectorOperator = "In" | "NotIn" | "Exists" | "DoesNotExist" | "Gt" | "Lt";

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

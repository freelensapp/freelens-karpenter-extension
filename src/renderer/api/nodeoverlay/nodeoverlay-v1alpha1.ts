import { Renderer } from "@freelensapp/extensions";

import type { NodePool } from "../nodepool/nodepool-v1";
import type { NodeOverlaySpec, NodeOverlayStatus, NodeSelectorRequirement } from "./nodeoverlay-v1alpha1-types";

/**
 * What a NodePool tells of a label of its nodes: its values, the values it excludes, the integers it is bounded to,
 * that it exists, or that it has none.
 */
type PoolConstraint =
  | { kind: "in"; values: Set<string> }
  | { kind: "notIn"; values: Set<string> }
  | { kind: "range"; range: IntegerRange }
  | { kind: "exists" }
  | { kind: "doesNotExist" };

/** The integers from `min` to `max`, both included; empty when `min` is above `max`. */
interface IntegerRange {
  min: number;
  max: number;
}

type NumericOperator = "Gt" | "Lt" | "Gte" | "Lte";

const isNumeric = (operator: string): operator is NumericOperator =>
  operator === "Gt" || operator === "Lt" || operator === "Gte" || operator === "Lte";

/**
 * The integers a numeric requirement allows. Its single value is an integer, which `Gt` and `Lt` exclude and `Gte`
 * and `Lte` include; `undefined` when the value is not a number.
 */
function numericRange(operator: NumericOperator, values: string[] | undefined): IntegerRange | undefined {
  const value = values?.[0]?.trim();
  const bound = Number(value);
  if (!value || Number.isNaN(bound)) return undefined;
  switch (operator) {
    case "Gt":
      return { min: Math.floor(bound) + 1, max: Infinity };
    case "Gte":
      return { min: Math.ceil(bound), max: Infinity };
    case "Lt":
      return { min: -Infinity, max: Math.ceil(bound) - 1 };
    case "Lte":
      return { min: -Infinity, max: Math.floor(bound) };
  }
}

const intersect = (a: IntegerRange, b: IntegerRange): IntegerRange => ({
  min: Math.max(a.min, b.min),
  max: Math.min(a.max, b.max),
});

const isEmpty = (range: IntegerRange) => range.min > range.max;

/** Whether a label value is an integer of the range. */
const contains = (range: IntegerRange, value: string) => {
  const number = Number(value);
  return value.trim() !== "" && Number.isInteger(number) && number >= range.min && number <= range.max;
};

export class NodeOverlay extends Renderer.K8sApi.LensExtensionKubeObject<
  Renderer.K8sApi.ClusterScopedMetadata,
  NodeOverlayStatus,
  NodeOverlaySpec
> {
  declare kind: "NodeOverlay";
  declare apiVersion: "karpenter.sh/v1alpha1";

  static readonly kind = "NodeOverlay";
  static readonly namespaced = false;
  static readonly apiBase = "/apis/karpenter.sh/v1alpha1/nodeoverlays";

  static readonly crd = {
    apiVersions: ["karpenter.sh/v1alpha1"],
    plural: "nodeoverlays",
    singular: "nodeoverlay",
  };

  /** The weight of a NodeOverlay; none is 0. A higher weight takes precedence. */
  static getWeight(overlay: NodeOverlay): number {
    return overlay.spec?.weight ?? 0;
  }

  /** What the NodeOverlay changes: the price, the price adjustment and the extended resources it adds. */
  static describe(overlay: NodeOverlay): string[] {
    const spec = overlay.spec ?? { requirements: [] };
    return [
      ...(spec.price !== undefined ? [`price ${spec.price}`] : []),
      ...(spec.priceAdjustment !== undefined ? [`price ${spec.priceAdjustment}`] : []),
      ...Object.entries(spec.capacity ?? {}).map(([resource, quantity]) => `+${quantity} ${resource}`),
    ];
  }

  /**
   * Whether the NodeOverlay can apply to the nodes of a NodePool. Karpenter applies it to the instance types whose
   * labels, with `karpenter.sh/nodepool` and the NodePool's template labels, are compatible with its requirements.
   * The instance types are the cloud provider's, so here a requirement on a label the NodePool does not fix (by its
   * name, its template labels or its requirements) can be met, and only one the NodePool rules out cannot.
   */
  static appliesTo(overlay: NodeOverlay, nodePool: NodePool): boolean {
    return (overlay.spec?.requirements ?? []).every((requirement) =>
      NodeOverlay.isCompatible(requirement, NodeOverlay.poolConstraint(nodePool, requirement.key)),
    );
  }

  /** The NodeOverlays that can apply to a NodePool, the one that takes precedence first. */
  static forNodePool(overlays: NodeOverlay[], nodePool: NodePool): NodeOverlay[] {
    return overlays
      .filter((overlay) => NodeOverlay.appliesTo(overlay, nodePool))
      .sort((a, b) => NodeOverlay.getWeight(b) - NodeOverlay.getWeight(a) || a.getName().localeCompare(b.getName()));
  }

  private static poolConstraint(nodePool: NodePool, key: string): PoolConstraint | undefined {
    if (key === "karpenter.sh/nodepool") return { kind: "in", values: new Set([nodePool.getName()]) };
    const label = nodePool.spec?.template?.metadata?.labels?.[key];
    if (label !== undefined) return { kind: "in", values: new Set([label]) };
    const requirements = (nodePool.spec?.template?.spec?.requirements ?? []).filter((r) => r.key === key);
    // A requirement on the values first; the numeric requirements of a key bound it together, as `Gte` and `Lte`
    // give a range.
    const requirement = requirements.find((r) => !isNumeric(r.operator)) ?? requirements[0];
    switch (requirement?.operator) {
      case "In":
        return { kind: "in", values: new Set(requirement.values ?? []) };
      case "NotIn":
        return { kind: "notIn", values: new Set(requirement.values ?? []) };
      case "Exists":
        return { kind: "exists" };
      case "DoesNotExist":
        return { kind: "doesNotExist" };
      case "Gt":
      case "Lt":
      case "Gte":
      case "Lte": {
        let range: IntegerRange = { min: -Infinity, max: Infinity };
        for (const { operator, values } of requirements) {
          const bound = isNumeric(operator) ? numericRange(operator, values) : undefined;
          if (bound) range = intersect(range, bound);
        }
        return { kind: "range", range };
      }
      default:
        return undefined;
    }
  }

  private static isCompatible(requirement: NodeSelectorRequirement, pool: PoolConstraint | undefined): boolean {
    const values = requirement.values ?? [];
    const { operator } = requirement;
    if (!pool) return true;
    // A numeric requirement whose value is not a number matches no label.
    const range = isNumeric(operator) ? numericRange(operator, values) : undefined;
    if (isNumeric(operator) && !range) return false;
    switch (pool.kind) {
      case "in": {
        const poolValues = [...pool.values];
        if (operator === "In") return poolValues.some((value) => values.includes(value));
        if (operator === "NotIn") return poolValues.some((value) => !values.includes(value));
        if (operator === "Exists") return true;
        if (operator === "DoesNotExist") return false;
        return poolValues.some((value) => contains(range!, value));
      }
      case "notIn":
        return operator !== "In" || values.some((value) => !pool.values.has(value));
      case "range":
        // A label bounded to no integer: the NodePool launches no node at all.
        if (isEmpty(pool.range)) return false;
        if (operator === "In") return values.some((value) => contains(pool.range, value));
        if (operator === "NotIn" || operator === "Exists") return true;
        if (operator === "DoesNotExist") return false;
        return !isEmpty(intersect(pool.range, range!));
      case "exists":
        return operator !== "DoesNotExist";
      case "doesNotExist":
        return operator === "NotIn" || operator === "DoesNotExist";
    }
  }
}

export class NodeOverlayApi extends Renderer.K8sApi.KubeApi<NodeOverlay> {}
export class NodeOverlayStore extends Renderer.K8sApi.KubeObjectStore<NodeOverlay, NodeOverlayApi> {}

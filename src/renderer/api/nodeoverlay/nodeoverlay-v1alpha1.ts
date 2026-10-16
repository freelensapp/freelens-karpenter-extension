import { Renderer } from "@freelensapp/extensions";

import type { NodePool } from "../nodepool/nodepool-v1";
import type { NodeOverlaySpec, NodeOverlayStatus, NodeSelectorRequirement } from "./nodeoverlay-v1alpha1-types";

/** What a NodePool tells of a label of its nodes: its values, the values it excludes, or that it has none. */
type PoolConstraint =
  | { kind: "in"; values: Set<string> }
  | { kind: "notIn"; values: Set<string> }
  | { kind: "exists" }
  | { kind: "doesNotExist" };

const NUMERIC: Record<string, (value: number, bound: number) => boolean> = {
  Gt: (value, bound) => value > bound,
  Lt: (value, bound) => value < bound,
  Gte: (value, bound) => value >= bound,
  Lte: (value, bound) => value <= bound,
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
    const requirement = nodePool.spec?.template?.spec?.requirements?.find((r) => r.key === key);
    switch (requirement?.operator) {
      case "In":
        return { kind: "in", values: new Set(requirement.values ?? []) };
      case "NotIn":
        return { kind: "notIn", values: new Set(requirement.values ?? []) };
      case "Exists":
        return { kind: "exists" };
      case "DoesNotExist":
        return { kind: "doesNotExist" };
      default:
        return undefined;
    }
  }

  private static isCompatible(requirement: NodeSelectorRequirement, pool: PoolConstraint | undefined): boolean {
    const values = requirement.values ?? [];
    const { operator } = requirement;
    if (!pool) return true;
    switch (pool.kind) {
      case "in": {
        const poolValues = [...pool.values];
        if (operator === "In") return poolValues.some((value) => values.includes(value));
        if (operator === "NotIn") return poolValues.some((value) => !values.includes(value));
        if (operator === "Exists") return true;
        if (operator === "DoesNotExist") return false;
        const bound = Number(values[0]);
        return poolValues.some((value) => NUMERIC[operator]!(Number(value), bound));
      }
      case "notIn":
        return operator !== "In" || values.some((value) => !pool.values.has(value));
      case "exists":
        return operator !== "DoesNotExist";
      case "doesNotExist":
        return operator === "NotIn" || operator === "DoesNotExist";
    }
  }
}

export class NodeOverlayApi extends Renderer.K8sApi.KubeApi<NodeOverlay> {}
export class NodeOverlayStore extends Renderer.K8sApi.KubeObjectStore<NodeOverlay, NodeOverlayApi> {}

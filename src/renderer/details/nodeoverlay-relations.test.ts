import { describe, expect, it } from "vitest";
import { NodeOverlay } from "../api/nodeoverlay/nodeoverlay-v1alpha1";
import { NodePool } from "../api/nodepool/nodepool-v1";
import { isRejected, nodePoolsOfOverlay } from "./nodeoverlay-relations";

import type { NodeSelectorRequirementWithMinValues } from "../api/karpenter/karpenter-v1-types";
import type { NodeOverlaySpec, NodeOverlayStatus } from "../api/nodeoverlay/nodeoverlay-v1alpha1-types";

const nodePool = (name: string, requirements: NodeSelectorRequirementWithMinValues[]) =>
  new NodePool({
    apiVersion: "karpenter.sh/v1",
    kind: "NodePool",
    metadata: { name, uid: name, resourceVersion: "1", selfLink: "" },
    spec: {
      template: {
        spec: { nodeClassRef: { group: "karpenter.k8s.aws", kind: "EC2NodeClass", name: "default" }, requirements },
      },
    },
  });

const overlay = (spec: Partial<NodeOverlaySpec>, status?: NodeOverlayStatus) =>
  new NodeOverlay({
    apiVersion: "karpenter.sh/v1alpha1",
    kind: "NodeOverlay",
    metadata: { name: "o", uid: "o", resourceVersion: "1", selfLink: "" },
    spec: { requirements: [], ...spec },
    status,
  });

// The NodePools of the AWS fixtures of the integration tests: general allows spot, gpu and empty on-demand only.
const general = nodePool("general", [
  { key: "karpenter.sh/capacity-type", operator: "In", values: ["spot", "on-demand"] },
]);
const gpu = nodePool("gpu", [
  { key: "karpenter.sh/capacity-type", operator: "In", values: ["on-demand"] },
  { key: "karpenter.k8s.aws/instance-cpu", operator: "Gte", values: ["8"] },
]);
const empty = nodePool("empty", [{ key: "karpenter.sh/capacity-type", operator: "In", values: ["on-demand"] }]);

describe("nodePoolsOfOverlay", () => {
  it("is the NodePools the overlay can apply to, by name", () => {
    const spotDiscount = overlay({
      requirements: [{ key: "karpenter.sh/capacity-type", operator: "In", values: ["spot"] }],
    });
    expect(nodePoolsOfOverlay(spotDiscount, [gpu, general, empty])).toEqual(["general"]);
  });

  it("is every NodePool for an overlay without requirements, sorted by name", () => {
    expect(nodePoolsOfOverlay(overlay({}), [general, gpu, empty])).toEqual(["empty", "general", "gpu"]);
  });

  it("follows the numeric requirements of the NodePools", () => {
    const small = overlay({
      requirements: [{ key: "karpenter.k8s.aws/instance-cpu", operator: "Lte", values: ["4"] }],
    });
    expect(nodePoolsOfOverlay(small, [general, gpu, empty])).toEqual(["empty", "general"]);
  });

  it("is the NodePool the overlay names", () => {
    const byName = overlay({ requirements: [{ key: "karpenter.sh/nodepool", operator: "In", values: ["gpu"] }] });
    expect(nodePoolsOfOverlay(byName, [general, gpu, empty])).toEqual(["gpu"]);
    expect(nodePoolsOfOverlay(byName, [])).toEqual([]);
  });
});

describe("isRejected", () => {
  const condition = (type: string, status: string, reason = "") => ({
    type,
    status,
    reason,
    message: "",
    lastTransitionTime: "2026-10-01T08:00:00Z",
  });

  it("is rejected when its validation failed", () => {
    expect(isRejected(overlay({}, { conditions: [condition("ValidationSucceeded", "False", "Conflict")] }))).toBe(true);
  });

  it("is not rejected when it is valid, or not validated yet", () => {
    expect(isRejected(overlay({}, { conditions: [condition("ValidationSucceeded", "True")] }))).toBe(false);
    expect(isRejected(overlay({}, { conditions: [condition("ValidationSucceeded", "Unknown")] }))).toBe(false);
    expect(isRejected(overlay({}))).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { NodeOverlay } from "../../api/nodeoverlay/nodeoverlay-v1alpha1";
import { nodeOverlayColumnValues, nodeOverlaySortValues } from "./nodeoverlay-columns";

import type { NodeOverlaySpec, NodeOverlayStatus } from "../../api/nodeoverlay/nodeoverlay-v1alpha1-types";

const overlay = (name: string, spec: Partial<NodeOverlaySpec> = {}, status?: NodeOverlayStatus) =>
  new NodeOverlay({
    apiVersion: "karpenter.sh/v1alpha1",
    kind: "NodeOverlay",
    metadata: { name, uid: name, resourceVersion: "1", selfLink: "" },
    spec: { requirements: [], ...spec },
    status,
  });

const lastTransitionTime = "2026-10-01T08:00:00Z";

// spot-discount of the fixtures of the integration tests.
const ready = overlay(
  "spot-discount",
  { weight: 10, priceAdjustment: "-10%" },
  { conditions: [{ type: "Ready", status: "True", reason: "Ready", message: "", lastTransitionTime }] },
);

// An overlay that Karpenter rejected.
const rejected = overlay(
  "conflicting",
  { weight: 10, price: "0.5" },
  {
    conditions: [
      { type: "ValidationSucceeded", status: "False", reason: "Conflict", message: "", lastTransitionTime },
      { type: "Ready", status: "False", reason: "UnhealthyDependents", message: "", lastTransitionTime },
    ],
  },
);

// An overlay without a weight and not reconciled yet.
const fresh = overlay("fresh");

describe("nodeOverlayColumnValues", () => {
  it("has the value of the jsonPath of each column, as kubectl prints it", () => {
    expect(nodeOverlayColumnValues(ready)).toEqual({ ready: "True", weight: "10" });
    expect(nodeOverlayColumnValues(rejected)).toEqual({ ready: "False", weight: "10" });
  });

  it("has no Ready where a NodeOverlay has none, and a weight of 0 without one, as Karpenter takes it", () => {
    expect(nodeOverlayColumnValues(fresh)).toEqual({ ready: undefined, weight: "0" });
  });
});

describe("nodeOverlaySortValues", () => {
  it("sorts the status of Ready True, False, Unknown, then none", () => {
    expect([ready, rejected, fresh].map(nodeOverlaySortValues.ready)).toEqual([0, 1, 3]);
  });

  it("sorts the weight by its value, 0 without one", () => {
    expect([ready, overlay("heavy", { weight: 100 }), fresh].map(nodeOverlaySortValues.weight)).toEqual([10, 100, 0]);
  });
});

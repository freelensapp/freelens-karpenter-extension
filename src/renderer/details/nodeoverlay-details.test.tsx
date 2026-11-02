// @vitest-environment jsdom

import { Renderer } from "@freelensapp/extensions";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NodeOverlay } from "../api/nodeoverlay/nodeoverlay-v1alpha1";
import { NodePool } from "../api/nodepool/nodepool-v1";
import { useSubscribedStores } from "../data/use-subscribed-stores";
import { NodeOverlayDetails } from "./nodeoverlay-details";

import type { NodeSelectorRequirementWithMinValues } from "../api/karpenter/karpenter-v1-types";

const lastTransitionTime = "2026-10-01T08:00:00Z";

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

// The NodePools of the AWS fixtures of the integration tests: general allows spot, gpu on-demand only.
const general = nodePool("general", [
  { key: "karpenter.sh/capacity-type", operator: "In", values: ["spot", "on-demand"] },
]);
const gpu = nodePool("gpu", [{ key: "karpenter.sh/capacity-type", operator: "In", values: ["on-demand"] }]);

// spot-discount of the fixtures, validated.
const spotDiscount = new NodeOverlay({
  apiVersion: "karpenter.sh/v1alpha1",
  kind: "NodeOverlay",
  metadata: { name: "spot-discount", uid: "1", resourceVersion: "1", selfLink: "" },
  spec: {
    weight: 10,
    requirements: [
      { key: "karpenter.sh/capacity-type", operator: "In", values: ["spot"] },
      { key: "karpenter.k8s.aws/instance-cpu", operator: "Gte", values: ["4"] },
    ],
    priceAdjustment: "-10%",
  },
  status: {
    conditions: [
      { type: "ValidationSucceeded", status: "True", reason: "ValidationSucceeded", message: "", lastTransitionTime },
      { type: "Ready", status: "True", reason: "Ready", message: "", lastTransitionTime },
    ],
  },
});

// An overlay of the same weight that changes the capacity of the same instance types: Karpenter rejects it.
const conflicting = new NodeOverlay({
  apiVersion: "karpenter.sh/v1alpha1",
  kind: "NodeOverlay",
  metadata: { name: "gpu-fpga", uid: "2", resourceVersion: "1", selfLink: "" },
  spec: {
    requirements: [{ key: "karpenter.sh/nodepool", operator: "In", values: ["gpu"] }],
    price: "1.25",
    capacity: { "example.com/fpga": 1 },
  },
  status: {
    conditions: [
      {
        type: "ValidationSucceeded",
        status: "False",
        reason: "Conflict",
        message: "conflict with another overlay",
        lastTransitionTime,
      },
      {
        type: "Ready",
        status: "False",
        reason: "UnhealthyDependents",
        message: "ValidationSucceeded=False",
        lastTransitionTime,
      },
    ],
  },
});

vi.mock("../data/stores", () => ({
  getNodePoolStore: () => ({ items: [gpu, general], api: { apiBase: "/apis/karpenter.sh/v1/nodepools" } }),
}));

vi.mock("../data/use-subscribed-stores", () => ({ useSubscribedStores: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("NodeOverlayDetails", () => {
  it("shows the spec of a NodeOverlay and the NodePools it applies to", () => {
    render(<NodeOverlayDetails object={spotDiscount} />);

    for (const text of [
      "10",
      "karpenter.sh/capacity-type In [spot]",
      "karpenter.k8s.aws/instance-cpu Gte 4",
      "-10%",
      "Applies To",
    ]) {
      expect(screen.getByText(text)).toBeTruthy();
    }
    for (const name of ["Not Ready", "Not Validated", "Price", "Capacity", "gpu"]) {
      expect(screen.queryByText(name)).toBeNull();
    }
  });

  it("opens a NodePool it applies to in the drawer", () => {
    render(<NodeOverlayDetails object={spotDiscount} />);

    fireEvent.click(screen.getByText("general"));
    expect(Renderer.Navigation.showDetails).toHaveBeenLastCalledWith("/apis/karpenter.sh/v1/nodepools/general");
  });

  it("shows why Karpenter rejected a NodeOverlay, and that it applies to nothing", () => {
    render(<NodeOverlayDetails object={conflicting} />);

    for (const text of [
      "False, Conflict: conflict with another overlay",
      "False, UnhealthyDependents: ValidationSucceeded=False",
      "1.25",
      "example.com/fpga 1",
      "Matches (not applied)",
      "gpu",
    ]) {
      expect(screen.getByText(text)).toBeTruthy();
    }
    // Without a weight, Karpenter takes it as 0.
    expect(screen.getByText("Weight").nextSibling?.textContent).toBe("0");
    expect(screen.queryByText("Applies To")).toBeNull();
  });

  it("subscribes to the store of the NodePools", () => {
    render(<NodeOverlayDetails object={spotDiscount} />);

    const [stores] = vi.mocked(useSubscribedStores).mock.calls[0] ?? [];
    expect(stores?.map((store) => store?.api.apiBase)).toEqual(["/apis/karpenter.sh/v1/nodepools"]);
  });
});

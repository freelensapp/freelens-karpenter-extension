// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import { observable, runInAction } from "mobx";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NodeOverlay } from "../../api/nodeoverlay/nodeoverlay-v1alpha1";
import { NodeOverlaysPage } from "./nodeoverlays-page";

import type { Renderer } from "@freelensapp/extensions";

const spotDiscount = new NodeOverlay({
  apiVersion: "karpenter.sh/v1alpha1",
  kind: "NodeOverlay",
  metadata: {
    name: "spot-discount",
    uid: "1",
    resourceVersion: "1",
    selfLink: "/apis/karpenter.sh/v1alpha1/nodeoverlays/spot-discount",
  },
  spec: {
    weight: 10,
    requirements: [{ key: "karpenter.sh/capacity-type", operator: "In", values: ["spot"] }],
    priceAdjustment: "-10%",
  },
  status: {
    conditions: [{ type: "Ready", status: "True", reason: "Ready", message: "", lastTransitionTime: "" }],
  },
});

// The host's API registry, which is observable, and the NodeOverlays of its store.
const served = observable.box(false);

vi.mock("../../data/stores", () => ({
  getNodeOverlayStore: () => (served.get() ? { items: [spotDiscount] } : undefined),
}));

const extension = {} as Renderer.LensExtension;

beforeEach(() => {
  runInAction(() => served.set(true));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("NodeOverlaysPage", () => {
  it("lists the NodeOverlays with the columns of kubectl get nodeoverlays -o wide", () => {
    render(<NodeOverlaysPage extension={extension} />);

    expect(screen.getByRole("heading", { name: "Node Overlays" })).toBeTruthy();
    expect(screen.getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual([
      "Name",
      "Weight",
      "Ready",
      "Age",
    ]);
    expect(screen.getAllByRole("cell").map((cell) => cell.textContent)).toEqual(["spot-discount", "10", "True", "age"]);
  });

  it("follows the CRD as the host registers it and removes it", () => {
    runInAction(() => served.set(false));
    render(<NodeOverlaysPage extension={extension} />);
    expect(screen.getByText("The cluster does not serve this resource.")).toBeTruthy();

    act(() => runInAction(() => served.set(true)));
    expect(screen.getByText("spot-discount")).toBeTruthy();
  });
});

// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import { observable, runInAction } from "mobx";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GCECustomMachineType } from "../../api/gcecustommachinetype/gcecustommachinetype-v1alpha1";
import { GCECustomMachineTypesPage } from "./gcecustommachinetypes-page";

import type { Renderer } from "@freelensapp/extensions";

const customShape = new GCECustomMachineType({
  apiVersion: "karpenter.k8s.gcp/v1alpha1",
  kind: "GCECustomMachineType",
  metadata: {
    name: "n2-custom-8-24576",
    uid: "1",
    resourceVersion: "1",
    selfLink: "/apis/karpenter.k8s.gcp/v1alpha1/gcecustommachinetypes/n2-custom-8-24576",
  },
  spec: { machineType: "n2-custom-8-24576", prices: { onDemand: "0.3891", spot: "0.0934" } },
  status: {
    guestCpus: 8,
    memoryMb: 24576,
    zones: ["us-central1-a"],
    conditions: [{ type: "Ready", status: "True", reason: "Ready", message: "", lastTransitionTime: "" }],
  },
});

// The host's API registry, which is observable, and the GCECustomMachineTypes of its store.
const served = observable.box(false);

vi.mock("../../data/stores", () => ({
  getGCECustomMachineTypeStore: () => (served.get() ? { items: [customShape] } : undefined),
}));

const extension = {} as Renderer.LensExtension;

beforeEach(() => {
  runInAction(() => served.set(true));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("GCECustomMachineTypesPage", () => {
  it("lists the GCECustomMachineTypes with the columns of kubectl get gcecustommachinetypes -o wide", () => {
    render(<GCECustomMachineTypesPage extension={extension} />);

    expect(screen.getByRole("heading", { name: "GCE Custom Machine Types" })).toBeTruthy();
    expect(screen.getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual([
      "Name",
      "Machine Type",
      "Ready",
      "Age",
    ]);
    expect(screen.getAllByRole("cell").map((cell) => cell.textContent)).toEqual([
      "n2-custom-8-24576",
      "n2-custom-8-24576",
      "True",
      "age",
    ]);
  });

  it("follows the CRD as the host registers it and removes it", () => {
    runInAction(() => served.set(false));
    render(<GCECustomMachineTypesPage extension={extension} />);
    expect(screen.getByText("The cluster does not serve this resource.")).toBeTruthy();

    act(() => runInAction(() => served.set(true)));
    expect(screen.getAllByText("n2-custom-8-24576")).toHaveLength(2);
  });
});

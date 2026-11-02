// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import { observable, runInAction } from "mobx";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GCENodeClass } from "../../api/gcenodeclass/gcenodeclass-v1alpha1";
import { GCENodeClassesPage } from "./gcenodeclasses-page";

import type { Renderer } from "@freelensapp/extensions";

const defaultClass = new GCENodeClass({
  apiVersion: "karpenter.k8s.gcp/v1alpha1",
  kind: "GCENodeClass",
  metadata: {
    name: "default",
    uid: "1",
    resourceVersion: "1",
    selfLink: "/apis/karpenter.k8s.gcp/v1alpha1/gcenodeclasses/default",
  },
  spec: {
    serviceAccount: "karpenter-node@lab.iam.gserviceaccount.com",
    imageSelectorTerms: [{ family: "ContainerOptimizedOS", channel: "stable" }],
    disks: [{ category: "pd-balanced", sizeGiB: 100, boot: true }],
    subnetRangeName: "pods",
  },
  status: {
    conditions: [{ type: "Ready", status: "True", reason: "Ready", message: "", lastTransitionTime: "" }],
  },
});

// A GCENodeClass of v0.7.0 with two pod ranges.
const rangesClass = new GCENodeClass({
  apiVersion: "karpenter.k8s.gcp/v1alpha1",
  kind: "GCENodeClass",
  metadata: {
    name: "ranges",
    uid: "2",
    resourceVersion: "1",
    selfLink: "/apis/karpenter.k8s.gcp/v1alpha1/gcenodeclasses/ranges",
  },
  spec: {
    imageSelectorTerms: [{ family: "Ubuntu2404", version: "latest" }],
    subnetRangeNames: ["pods-a", "pods-b"],
  },
});

// The host's API registry, which is observable, and the GCENodeClasses of its store.
const served = observable.box(false);
const items = observable.box([defaultClass]);

vi.mock("../../data/stores", () => ({
  getGCENodeClassStore: () => (served.get() ? { items: items.get() } : undefined),
}));

const extension = {} as Renderer.LensExtension;

beforeEach(() => {
  runInAction(() => {
    served.set(true);
    items.set([defaultClass]);
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("GCENodeClassesPage", () => {
  it("lists the GCENodeClasses with their image selector terms, disks and subnet, and the columns of kubectl get gcenodeclasses -o wide", () => {
    render(<GCENodeClassesPage extension={extension} />);

    expect(screen.getByRole("heading", { name: "GCE Node Classes" })).toBeTruthy();
    expect(screen.getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual([
      "Name",
      "Image Family",
      "Disks",
      "Subnet",
      "Ready",
      "Age",
    ]);
    expect(screen.getAllByRole("cell").map((cell) => cell.textContent)).toEqual([
      "default",
      "ContainerOptimizedOS=stable",
      "boot 100 GiB pd-balanced",
      "pods",
      "True",
      "age",
    ]);
  });

  it("shows several subnet range names each as a badge, and one as a text", () => {
    runInAction(() => items.set([defaultClass, rangesClass]));
    render(<GCENodeClassesPage extension={extension} />);

    // The cells of Subnet, the fourth column, of default and ranges.
    const subnetCells = screen
      .getAllByRole("row")
      .slice(1)
      .map((row) => row.querySelectorAll("td")[3]);
    expect([...(subnetCells[0]?.children ?? [])].map((element) => element.textContent)).toEqual(["pods"]);
    expect([...(subnetCells[1]?.children ?? [])].map((element) => element.textContent)).toEqual(["pods-a", "pods-b"]);
  });

  it("follows the CRD as the host registers it and removes it", () => {
    runInAction(() => served.set(false));
    render(<GCENodeClassesPage extension={extension} />);
    expect(screen.getByText("The cluster does not serve this resource.")).toBeTruthy();

    act(() => runInAction(() => served.set(true)));
    expect(screen.getByText("default")).toBeTruthy();
  });
});

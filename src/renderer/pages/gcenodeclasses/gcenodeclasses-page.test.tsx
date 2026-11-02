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
  },
  status: {
    conditions: [{ type: "Ready", status: "True", reason: "Ready", message: "", lastTransitionTime: "" }],
  },
});

// The host's API registry, which is observable, and the GCENodeClasses of its store.
const served = observable.box(false);

vi.mock("../../data/stores", () => ({
  getGCENodeClassStore: () => (served.get() ? { items: [defaultClass] } : undefined),
}));

const extension = {} as Renderer.LensExtension;

beforeEach(() => {
  runInAction(() => served.set(true));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("GCENodeClassesPage", () => {
  it("lists the GCENodeClasses with their image selector terms and the columns of kubectl get gcenodeclasses -o wide", () => {
    render(<GCENodeClassesPage extension={extension} />);

    expect(screen.getByRole("heading", { name: "GCE Node Classes" })).toBeTruthy();
    expect(screen.getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual([
      "Name",
      "ImageFamily",
      "Ready",
      "Age",
    ]);
    expect(screen.getAllByRole("cell").map((cell) => cell.textContent)).toEqual([
      "default",
      "family=ContainerOptimizedOSchannel=stable",
      "True",
      "age",
    ]);
  });

  it("follows the CRD as the host registers it and removes it", () => {
    runInAction(() => served.set(false));
    render(<GCENodeClassesPage extension={extension} />);
    expect(screen.getByText("The cluster does not serve this resource.")).toBeTruthy();

    act(() => runInAction(() => served.set(true)));
    expect(screen.getByText("default")).toBeTruthy();
  });
});

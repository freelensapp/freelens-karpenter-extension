// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import { observable, runInAction } from "mobx";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AKSNodeClass as AKSNodeClassV1alpha2 } from "../../api/aksnodeclass/aksnodeclass-v1alpha2";
import { AKSNodeClass as AKSNodeClassV1beta1 } from "../../api/aksnodeclass/aksnodeclass-v1beta1";
import { AKSNodeClassesPage } from "./aksnodeclasses-page";

import type { Renderer } from "@freelensapp/extensions";

const defaultClass = new AKSNodeClassV1beta1({
  apiVersion: "karpenter.azure.com/v1beta1",
  kind: "AKSNodeClass",
  metadata: {
    name: "default",
    uid: "1",
    resourceVersion: "1",
    selfLink: "/apis/karpenter.azure.com/v1beta1/aksnodeclasses/default",
  },
  spec: { imageFamily: "AzureLinux" },
  status: {
    conditions: [{ type: "Ready", status: "True", reason: "Ready", message: "", lastTransitionTime: "" }],
  },
});

const legacyClass = new AKSNodeClassV1alpha2({
  apiVersion: "karpenter.azure.com/v1alpha2",
  kind: "AKSNodeClass",
  metadata: {
    name: "legacy",
    uid: "2",
    resourceVersion: "1",
    selfLink: "/apis/karpenter.azure.com/v1alpha2/aksnodeclasses/legacy",
  },
  spec: { imageFamily: "Ubuntu2204" },
});

// The host's API registry, which is observable, and the version it serves: v1beta1 on the Azure provider 1.14.3 and
// newer, v1alpha2 on an older one.
const served = observable.box<"v1beta1" | "v1alpha2" | undefined>("v1beta1");

vi.mock("../../data/stores", () => ({
  getAKSNodeClassStore: () => {
    switch (served.get()) {
      case "v1beta1":
        return { items: [defaultClass] };
      case "v1alpha2":
        return { items: [legacyClass] };
      default:
        return undefined;
    }
  },
}));

const extension = {} as Renderer.LensExtension;

beforeEach(() => {
  runInAction(() => served.set("v1beta1"));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AKSNodeClassesPage", () => {
  it("lists the AKSNodeClasses with the columns of kubectl get aksnodeclasses -o wide", () => {
    render(<AKSNodeClassesPage extension={extension} />);

    expect(screen.getByRole("heading", { name: "AKS Node Classes" })).toBeTruthy();
    expect(screen.getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual([
      "Name",
      "Ready",
      "Age",
      "ImageFamily",
    ]);
    expect(screen.getAllByRole("cell").map((cell) => cell.textContent)).toEqual([
      "default",
      "True",
      "age",
      "AzureLinux",
    ]);
  });

  it("lists the AKSNodeClasses of v1alpha2 on a cluster that serves only that version", () => {
    runInAction(() => served.set("v1alpha2"));
    render(<AKSNodeClassesPage extension={extension} />);

    expect(screen.getAllByRole("cell").map((cell) => cell.textContent)).toEqual(["legacy", "", "age", "Ubuntu2204"]);
  });

  it("follows the CRD as the host registers it and removes it", () => {
    runInAction(() => served.set(undefined));
    render(<AKSNodeClassesPage extension={extension} />);
    expect(screen.getByText("The cluster does not serve this resource.")).toBeTruthy();

    act(() => runInAction(() => served.set("v1beta1")));
    expect(screen.getByText("default")).toBeTruthy();
  });
});

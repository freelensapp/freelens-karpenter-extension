// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import { observable, runInAction } from "mobx";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EC2NodeClass } from "../../api/ec2nodeclass/ec2nodeclass-v1";
import { EC2NodeClassesPage } from "./ec2nodeclasses-page";

import type { Renderer } from "@freelensapp/extensions";

const defaultClass = new EC2NodeClass({
  apiVersion: "karpenter.k8s.aws/v1",
  kind: "EC2NodeClass",
  metadata: {
    name: "default",
    uid: "1",
    resourceVersion: "1",
    selfLink: "/apis/karpenter.k8s.aws/v1/ec2nodeclasses/default",
  },
  spec: {
    role: "KarpenterNodeRole-lab",
    amiSelectorTerms: [{ alias: "al2023@latest" }],
    subnetSelectorTerms: [{ tags: { "karpenter.sh/discovery": "lab" } }],
    securityGroupSelectorTerms: [{ tags: { "karpenter.sh/discovery": "lab" } }],
  },
  status: {
    conditions: [{ type: "Ready", status: "True", reason: "Ready", message: "", lastTransitionTime: "" }],
  },
});

// The host's API registry, which is observable, and the EC2NodeClasses of its store.
const served = observable.box(false);

vi.mock("../../data/stores", () => ({
  getEC2NodeClassStore: () => (served.get() ? { items: [defaultClass] } : undefined),
}));

const extension = {} as Renderer.LensExtension;

beforeEach(() => {
  runInAction(() => served.set(true));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("EC2NodeClassesPage", () => {
  it("lists the EC2NodeClasses with the columns of kubectl get ec2nodeclasses -o wide", () => {
    render(<EC2NodeClassesPage extension={extension} />);

    expect(screen.getByRole("heading", { name: "EC2 Node Classes" })).toBeTruthy();
    expect(screen.getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual([
      "Name",
      "Ready",
      "Age",
      "Role",
    ]);
    expect(screen.getAllByRole("cell").map((cell) => cell.textContent)).toEqual([
      "default",
      "True",
      "age",
      "KarpenterNodeRole-lab",
    ]);
  });

  it("follows the CRD as the host registers it and removes it", () => {
    runInAction(() => served.set(false));
    render(<EC2NodeClassesPage extension={extension} />);
    expect(screen.getByText("The cluster does not serve this resource.")).toBeTruthy();

    act(() => runInAction(() => served.set(true)));
    expect(screen.getByText("default")).toBeTruthy();
  });
});

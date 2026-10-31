// @vitest-environment jsdom

import { Renderer } from "@freelensapp/extensions";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { observable, runInAction } from "mobx";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NodePool } from "../../api/nodepool/nodepool-v1";
import { NodePoolsPage } from "./nodepools-page";

const general = new NodePool({
  apiVersion: "karpenter.sh/v1",
  kind: "NodePool",
  metadata: { name: "general", uid: "1", resourceVersion: "1", selfLink: "/apis/karpenter.sh/v1/nodepools/general" },
  spec: {
    weight: 50,
    template: {
      spec: {
        nodeClassRef: { group: "karpenter.k8s.aws", kind: "EC2NodeClass", name: "default" },
        requirements: [],
      },
    },
  },
  status: {
    nodes: 4,
    resources: { cpu: "16", memory: "59687568Ki" },
    conditions: [{ type: "Ready", status: "True" }],
  },
});

// The host's API registry, which is observable, and the NodePools of its store.
const served = observable.box(false);

vi.mock("../../data/stores", () => ({
  getNodePoolStore: () => (served.get() ? { items: [general] } : undefined),
  getEC2NodeClassStore: () =>
    served.get() ? { api: { apiBase: "/apis/karpenter.k8s.aws/v1/ec2nodeclasses" } } : undefined,
  getAKSNodeClassStore: () => undefined,
  getGCENodeClassStore: () => undefined,
}));

const extension = {} as Renderer.LensExtension;

beforeEach(() => {
  runInAction(() => served.set(true));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("NodePoolsPage", () => {
  it("lists the NodePools with the columns of kubectl get nodepools -o wide", () => {
    render(<NodePoolsPage extension={extension} />);

    expect(screen.getByRole("heading", { name: "Node Pools" })).toBeTruthy();
    expect(screen.getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual([
      "Name",
      "NodeClass",
      "Nodes",
      "Ready",
      "Age",
      "Weight",
      "CPU",
      "Memory",
    ]);
    expect(screen.getAllByRole("cell").map((cell) => cell.textContent)).toEqual([
      "general",
      "default",
      "4",
      "True",
      "age",
      "50",
      "16",
      "59687568Ki",
    ]);
  });

  it("opens the node class of a NodePool in the drawer", () => {
    render(<NodePoolsPage extension={extension} />);

    fireEvent.click(screen.getByText("default"));

    expect(Renderer.Navigation.showDetails).toHaveBeenLastCalledWith(
      "/apis/karpenter.k8s.aws/v1/ec2nodeclasses/default",
    );
  });

  it("follows the CRD as the host registers it and removes it", () => {
    runInAction(() => served.set(false));
    render(<NodePoolsPage extension={extension} />);
    expect(screen.getByText("The cluster does not serve this resource.")).toBeTruthy();

    act(() => runInAction(() => served.set(true)));
    expect(screen.getByText("general")).toBeTruthy();
  });
});

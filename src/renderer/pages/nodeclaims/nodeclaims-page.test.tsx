// @vitest-environment jsdom

import { Renderer } from "@freelensapp/extensions";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { observable, runInAction } from "mobx";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NodeClaim } from "../../api/nodeclaim/nodeclaim-v1";
import { NodeClaimsPage } from "./nodeclaims-page";

const launched = new NodeClaim({
  apiVersion: "karpenter.sh/v1",
  kind: "NodeClaim",
  metadata: {
    name: "general-9qwmt",
    uid: "1",
    resourceVersion: "1",
    selfLink: "/apis/karpenter.sh/v1/nodeclaims/general-9qwmt",
    labels: {
      "karpenter.sh/nodepool": "general",
      "karpenter.sh/capacity-type": "on-demand",
      "node.kubernetes.io/instance-type": "m5.2xlarge",
      "topology.kubernetes.io/zone": "eu-west-1b",
    },
  },
  spec: {
    nodeClassRef: { group: "karpenter.k8s.aws", kind: "EC2NodeClass", name: "default" },
    requirements: [],
  },
  status: {
    nodeName: "ip-10-0-2-12",
    providerID: "aws:///eu-west-1b/i-0b79059e1a64a764c",
    imageID: "ami-0a1b2c3d4e5f60001",
    conditions: [
      { type: "Ready", status: "True" },
      { type: "Drifted", status: "True" },
    ],
  },
});

// The host's API registry, which is observable, and the NodeClaims of its store.
const served = observable.box(false);

vi.mock("../../data/stores", () => ({
  getNodeClaimStore: () => (served.get() ? { items: [launched] } : undefined),
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

describe("NodeClaimsPage", () => {
  it("lists the NodeClaims with the columns of kubectl get nodeclaims -o wide", () => {
    render(<NodeClaimsPage extension={extension} />);

    expect(screen.getByRole("heading", { name: "Node Claims" })).toBeTruthy();
    expect(screen.getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual([
      "Name",
      "Type",
      "Capacity",
      "Zone",
      "Node",
      "Ready",
      "Age",
      "ImageID",
      "ID",
      "NodePool",
      "NodeClass",
      "Drifted",
    ]);
    expect(screen.getAllByRole("cell").map((cell) => cell.textContent)).toEqual([
      "general-9qwmt",
      "m5.2xlarge",
      "on-demand",
      "eu-west-1b",
      "ip-10-0-2-12",
      "True",
      "age",
      "ami-0a1b2c3d4e5f60001",
      "aws:///eu-west-1b/i-0b79059e1a64a764c",
      "general",
      "default",
      "True",
    ]);
  });

  it("opens the node and the node class over the page, and the NodePool on the Node Pools page", () => {
    render(<NodeClaimsPage extension={extension} />);

    fireEvent.click(screen.getByText("ip-10-0-2-12"));
    expect(Renderer.Navigation.showDetails).toHaveBeenLastCalledWith("/api/v1/nodes/ip-10-0-2-12");

    fireEvent.click(screen.getByText("default"));
    expect(Renderer.Navigation.showDetails).toHaveBeenLastCalledWith(
      "/apis/karpenter.k8s.aws/v1/ec2nodeclasses/default",
    );

    fireEvent.click(screen.getByText("general"));
    expect(Renderer.Navigation.navigate).toHaveBeenLastCalledWith(
      "/extension/freelensapp--karpenter-extension/nodepools?kube-details=%2Fapis%2Fkarpenter.sh%2Fv1%2Fnodepools%2Fgeneral&kube-selected=%2Fapis%2Fkarpenter.sh%2Fv1%2Fnodepools%2Fgeneral",
    );
  });

  it("follows the CRD as the host registers it and removes it", () => {
    runInAction(() => served.set(false));
    render(<NodeClaimsPage extension={extension} />);
    expect(screen.getByText("The cluster does not serve this resource.")).toBeTruthy();

    act(() => runInAction(() => served.set(true)));
    expect(screen.getByText("general-9qwmt")).toBeTruthy();
  });
});

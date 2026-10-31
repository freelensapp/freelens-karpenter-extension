// @vitest-environment jsdom

import { Renderer } from "@freelensapp/extensions";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NodeClaim } from "../api/nodeclaim/nodeclaim-v1";
import { NodeOverlay } from "../api/nodeoverlay/nodeoverlay-v1alpha1";
import { NodePool } from "../api/nodepool/nodepool-v1";
import { useSubscribedStores } from "../data/use-subscribed-stores";
import { NodePoolDetails } from "./nodepool-details";

// gpu of the AWS fixtures of the integration tests, with what they leave out.
const gpu = new NodePool({
  apiVersion: "karpenter.sh/v1",
  kind: "NodePool",
  metadata: { name: "gpu", uid: "gpu", resourceVersion: "1", selfLink: "/apis/karpenter.sh/v1/nodepools/gpu" },
  spec: {
    weight: 50,
    replicas: 2,
    template: {
      metadata: { labels: { team: "ml" }, annotations: { "example.com/owner": "ml-platform" } },
      spec: {
        nodeClassRef: { group: "karpenter.k8s.aws", kind: "EC2NodeClass", name: "gpu" },
        requirements: [
          { key: "karpenter.k8s.aws/instance-family", operator: "In", values: ["g5"] },
          { key: "karpenter.k8s.aws/instance-cpu", operator: "Lte", values: ["16"] },
        ],
        taints: [{ key: "nvidia.com/gpu", effect: "NoSchedule" }],
        startupTaints: [{ key: "example.com/agent", value: "starting", effect: "NoExecute" }],
        expireAfter: "Never",
        terminationGracePeriod: "48h",
      },
    },
    limits: { cpu: 32 },
    disruption: {
      consolidationPolicy: "WhenEmpty",
      consolidateAfter: "10m",
      budgets: [{ nodes: "10%" }, { nodes: "0", reasons: ["Drifted"], schedule: "0 9 * * *", duration: "8h" }],
    },
  },
  status: {
    nodes: 1,
    nodeClassObservedGeneration: 3,
    resources: { cpu: "4", memory: "16202400Ki" },
    conditions: [{ type: "Ready", status: "False", reason: "NodeClassNotReady", message: "" }],
  },
});

const claim = new NodeClaim({
  apiVersion: "karpenter.sh/v1",
  kind: "NodeClaim",
  metadata: {
    name: "gpu-x1",
    uid: "c",
    resourceVersion: "1",
    selfLink: "",
    labels: { "karpenter.sh/nodepool": "gpu" },
  },
  status: { nodeName: "ip-10-0-0-1" },
});

const overlay = new NodeOverlay({
  apiVersion: "karpenter.sh/v1alpha1",
  kind: "NodeOverlay",
  metadata: { name: "gpu-price", uid: "o", resourceVersion: "1", selfLink: "" },
  spec: { requirements: [{ key: "team", operator: "In", values: ["ml"] }], price: "1.5", weight: 5 },
});

vi.mock("../data/stores", () => ({
  getNodeClaimStore: () => ({ items: [claim], api: { apiBase: "/apis/karpenter.sh/v1/nodeclaims" } }),
  getNodeOverlayStore: () => ({ items: [overlay], api: { apiBase: "/apis/karpenter.sh/v1alpha1/nodeoverlays" } }),
  getEC2NodeClassStore: () => ({ api: { apiBase: "/apis/karpenter.k8s.aws/v1/ec2nodeclasses" } }),
  getAKSNodeClassStore: () => undefined,
  getGCENodeClassStore: () => undefined,
}));

vi.mock("../data/use-subscribed-stores", () => ({ useSubscribedStores: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("NodePoolDetails", () => {
  it("shows the spec, the status, the template and the disruption of a NodePool", () => {
    render(<NodePoolDetails object={gpu} />);

    for (const text of [
      "EC2NodeClass gpu",
      "50",
      "2 (static NodePool)",
      "False, NodeClassNotReady",
      "3",
      "4 / 32",
      "16202400Ki / no limit",
      "team=ml",
      "example.com/owner=ml-platform",
      "karpenter.k8s.aws/instance-family In [g5]",
      "karpenter.k8s.aws/instance-cpu Lte 16",
      "nvidia.com/gpu:NoSchedule",
      "example.com/agent=starting:NoExecute",
      "Never",
      "48h",
      "WhenEmpty",
      "10m",
      "10% nodes; all reasons",
      "0 nodes; Drifted; schedule 0 9 * * * for 8h",
    ]) {
      expect(screen.getByText(text)).toBeTruthy();
    }
  });

  it("links to its node class, its NodeClaims and the NodeOverlays that apply to it, in the drawer", () => {
    render(<NodePoolDetails object={gpu} />);

    expect(screen.getByText("(price 1.5)", { exact: false })).toBeTruthy();
    expect(screen.getByText("(ip-10-0-0-1)", { exact: false })).toBeTruthy();

    fireEvent.click(screen.getByText("EC2NodeClass gpu"));
    expect(Renderer.Navigation.showDetails).toHaveBeenLastCalledWith("/apis/karpenter.k8s.aws/v1/ec2nodeclasses/gpu");
    fireEvent.click(screen.getByText("gpu-x1"));
    expect(Renderer.Navigation.showDetails).toHaveBeenLastCalledWith("/apis/karpenter.sh/v1/nodeclaims/gpu-x1");
    fireEvent.click(screen.getByText("gpu-price"));
    expect(Renderer.Navigation.showDetails).toHaveBeenLastCalledWith(
      "/apis/karpenter.sh/v1alpha1/nodeoverlays/gpu-price",
    );
  });

  it("subscribes to the stores of the NodeClaims and the NodeOverlays", () => {
    render(<NodePoolDetails object={gpu} />);

    const [stores] = vi.mocked(useSubscribedStores).mock.calls[0] ?? [];
    expect(stores?.map((store) => store?.api.apiBase)).toEqual([
      "/apis/karpenter.sh/v1/nodeclaims",
      "/apis/karpenter.sh/v1alpha1/nodeoverlays",
    ]);
  });
});

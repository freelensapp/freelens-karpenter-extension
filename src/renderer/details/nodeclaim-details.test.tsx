// @vitest-environment jsdom

import { Renderer } from "@freelensapp/extensions";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NodeClaim } from "../api/nodeclaim/nodeclaim-v1";
import { NodeClaimDetails } from "./nodeclaim-details";

const lastTransitionTime = "2026-10-01T08:00:00Z";

// general-9qwmt of the AWS fixtures of the integration tests, with what they leave out.
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
    requirements: [
      { key: "node.kubernetes.io/instance-type", operator: "In", values: ["m5.2xlarge"] },
      { key: "karpenter.k8s.aws/instance-cpu", operator: "Gte", values: ["4"] },
    ],
    resources: { requests: { cpu: "1500m", pods: 7 } },
    taints: [{ key: "dedicated", value: "general", effect: "NoSchedule" }],
    startupTaints: [{ key: "example.com/agent", effect: "NoExecute" }],
    expireAfter: "720h",
    terminationGracePeriod: "48h",
  },
  status: {
    nodeName: "ip-10-0-2-12",
    providerID: "aws:///eu-west-1b/i-0b79059e1a64a764c",
    imageID: "ami-0a1b2c3d4e5f60001",
    capacity: { cpu: "8", memory: "32118888Ki", "ephemeral-storage": "20Gi" },
    allocatable: { cpu: "7920m", memory: "28906999Ki" },
    lastPodEventTime: "2026-10-01T09:30:00Z",
    conditions: [
      { type: "Ready", status: "True", reason: "Ready", message: "", lastTransitionTime },
      { type: "Drifted", status: "True", reason: "AMIDrift", message: "", lastTransitionTime },
    ],
  },
});

// general-pend1, still waiting for its node.
const pending = new NodeClaim({
  apiVersion: "karpenter.sh/v1",
  kind: "NodeClaim",
  metadata: {
    name: "general-pend1",
    uid: "2",
    resourceVersion: "1",
    selfLink: "",
    labels: { "karpenter.sh/nodepool": "general", "karpenter.sh/capacity-type": "on-demand" },
  },
  spec: {
    nodeClassRef: { group: "karpenter.k8s.aws", kind: "EC2NodeClass", name: "default" },
    requirements: [{ key: "karpenter.sh/nodepool", operator: "In", values: ["general"] }],
  },
  status: {
    conditions: [
      {
        type: "Launched",
        status: "Unknown",
        reason: "NotLaunched",
        message: "Waiting for an instance",
        lastTransitionTime,
      },
    ],
  },
});

vi.mock("../data/stores", () => ({
  getEC2NodeClassStore: () => ({ api: { apiBase: "/apis/karpenter.k8s.aws/v1/ec2nodeclasses" } }),
  getAKSNodeClassStore: () => undefined,
  getGCENodeClassStore: () => undefined,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("NodeClaimDetails", () => {
  it("shows the status and the spec of a NodeClaim", () => {
    render(<NodeClaimDetails object={launched} />);

    for (const text of [
      "AMIDrift",
      "m5.2xlarge",
      "on-demand",
      "eu-west-1b",
      "aws:///eu-west-1b/i-0b79059e1a64a764c",
      "ami-0a1b2c3d4e5f60001",
      "2026-10-01T09:30:00Z",
      "8 / 7920m",
      "32118888Ki / 28906999Ki",
      "20Gi / -",
      "cpu 1500m",
      "pods 7",
      "node.kubernetes.io/instance-type In [m5.2xlarge]",
      "karpenter.k8s.aws/instance-cpu Gte 4",
      "dedicated=general:NoSchedule",
      "example.com/agent:NoExecute",
      "720h",
      "48h",
    ]) {
      expect(screen.getByText(text)).toBeTruthy();
    }
    expect(screen.queryByText("Not Ready")).toBeNull();
  });

  it("links to its node, its NodePool and its node class, in the drawer", () => {
    render(<NodeClaimDetails object={launched} />);

    fireEvent.click(screen.getByText("ip-10-0-2-12"));
    expect(Renderer.Navigation.showDetails).toHaveBeenLastCalledWith("/api/v1/nodes/ip-10-0-2-12");
    fireEvent.click(screen.getByText("general"));
    expect(Renderer.Navigation.showDetails).toHaveBeenLastCalledWith("/apis/karpenter.sh/v1/nodepools/general");
    fireEvent.click(screen.getByText("EC2NodeClass default"));
    expect(Renderer.Navigation.showDetails).toHaveBeenLastCalledWith(
      "/apis/karpenter.k8s.aws/v1/ec2nodeclasses/default",
    );
  });

  it("shows why a NodeClaim without a node has none, and nothing of the node", () => {
    render(<NodeClaimDetails object={pending} />);

    expect(screen.getByText("Not Launched")).toBeTruthy();
    expect(screen.getByText("Unknown, NotLaunched: Waiting for an instance")).toBeTruthy();
    for (const name of ["Node", "Instance Type", "Zone", "Provider ID", "Image ID", "Drifted"]) {
      expect(screen.queryByText(name)).toBeNull();
    }
    expect(screen.queryByText("Resources (capacity / allocatable)")).toBeNull();
  });
});

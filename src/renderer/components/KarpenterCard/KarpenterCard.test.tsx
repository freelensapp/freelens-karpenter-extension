// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NodePool } from "../../api/nodepool/nodepool-v1";
import { KarpenterCard, NodesList } from "./KarpenterCard";

import type { Node } from "../../utils/kube-helpers";

// No event in the store, no pod, no NodeOverlay.
vi.mock("../../data/stores", () => ({
  getKarpenterEventStore: () => ({ items: [], isLoaded: true, loadAll: vi.fn(async () => undefined) }),
  getNodeOverlayStore: () => undefined,
  getPodStore: () => ({ items: [] }),
  karpenterEventNamespaces: ["default"],
}));

vi.mock("../../data/node-metrics", () => ({
  useNodeMetrics: vi.fn(),
  getNodeUsage: () => ({ cpu: 0.5, memory: 1024 ** 3 }),
}));

const nodePool = new NodePool({
  apiVersion: "karpenter.sh/v1",
  kind: "NodePool",
  metadata: { name: "general", uid: "general", resourceVersion: "1", selfLink: "" },
  spec: {
    template: {
      spec: { nodeClassRef: { group: "karpenter.k8s.aws", kind: "EC2NodeClass", name: "default" }, requirements: [] },
    },
  },
  status: { conditions: [{ type: "Ready", status: "True" }] },
});

const node = {
  metadata: {
    name: "ip-10-0-1-11",
    creationTimestamp: "2026-10-16T08:00:00Z",
    labels: { "karpenter.sh/nodepool": "general", "node.kubernetes.io/instance-type": "m5.large" },
  },
  spec: {},
  status: { conditions: [{ type: "Ready", status: "True" }] },
  getName: () => "ip-10-0-1-11",
} as unknown as Node;

afterEach(cleanup);

describe("KarpenterCard", () => {
  it("says that the NodePool has no events, with a refresh and without the debug table", () => {
    render(<KarpenterCard nodePool={nodePool} nodes={[node]} />);

    fireEvent.click(screen.getByTitle("Toggle scaling event history"));

    expect(screen.getByText(/No events found for/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Refresh/ })).toBeTruthy();
    expect(screen.queryByText(/debug/i)).toBeNull();
  });

  it("shows the kubelet version and the usage of each node against its allocatable", () => {
    const withInfo = {
      ...node,
      status: { ...node.status, nodeInfo: { kubeletVersion: "v1.33.5" }, allocatable: { cpu: "2", memory: "4Gi" } },
    } as unknown as Node;
    render(<NodesList nodes={[withInfo]} podCountMap={{}} />);

    expect(screen.getByText("v1.33.5")).toBeTruthy();
    expect(screen.getByText("0.50 / 2.00")).toBeTruthy();
    expect(screen.getByText("1.0Gi / 4.0Gi")).toBeTruthy();
  });
});

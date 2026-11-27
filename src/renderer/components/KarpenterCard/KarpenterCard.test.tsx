// @vitest-environment jsdom

import { Renderer } from "@freelensapp/extensions";
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
    labels: {
      "karpenter.sh/nodepool": "general",
      "node.kubernetes.io/instance-type": "m5.large",
      "kubernetes.io/arch": "arm64",
    },
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
    expect(screen.getByText("arm64")).toBeTruthy();
    expect(screen.getByText("0.50 / 2.00")).toBeTruthy();
    expect(screen.getByText("1.0Gi / 4.0Gi")).toBeTruthy();
  });

  it("cordons the selected nodes through the API, and drains them in a terminal after a confirmation", () => {
    const other = { ...node, metadata: { ...node.metadata, name: "ip-10-0-1-12" } } as unknown as Node;
    render(<KarpenterCard nodePool={nodePool} nodes={[node, other]} />);
    expect(screen.queryByText(/selected/)).toBeNull();

    fireEvent.click(screen.getByLabelText("Select all nodes"));
    expect(screen.getByText("2 nodes selected")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cordon" }));
    expect(Renderer.K8sApi.nodesApi.patch).toHaveBeenCalledTimes(2);
    expect(Renderer.K8sApi.nodesApi.patch).toHaveBeenLastCalledWith(
      { name: "ip-10-0-1-12" },
      { spec: { unschedulable: true } },
      "merge",
    );
    expect(Renderer.Component.terminalStore.sendCommand).not.toHaveBeenCalled();
    expect(screen.queryByText(/selected/)).toBeNull();

    fireEvent.click(screen.getByLabelText("Select ip-10-0-1-12"));
    fireEvent.click(screen.getByRole("button", { name: "Drain" }));
    expect(Renderer.Component.ConfirmDialog.open).toHaveBeenCalledTimes(1);
    expect(Renderer.Component.terminalStore.sendCommand).toHaveBeenLastCalledWith(
      "kubectl drain ip-10-0-1-12 --delete-emptydir-data --ignore-daemonsets --force",
      { enter: true },
    );
    expect(Renderer.Navigation.showDetails).not.toHaveBeenCalled();
  });

  it("divides the node table into sections by the field chosen", () => {
    const spot = {
      ...node,
      metadata: { ...node.metadata, name: "ip-10-0-1-12", labels: { "karpenter.sh/capacity-type": "spot" } },
    } as unknown as Node;
    render(<KarpenterCard nodePool={nodePool} nodes={[node, spot]} />);

    fireEvent.change(screen.getByLabelText(/Group by/), { target: { value: "capacityType" } });

    const rows = screen.getAllByRole("row").map((row) => row.textContent ?? "");
    expect(rows.findIndex((t) => t.startsWith("spot"))).toBeLessThan(rows.findIndex((t) => t.includes("ip-10-0-1-12")));
    expect(rows.findIndex((t) => t.startsWith("—"))).toBeLessThan(rows.findIndex((t) => t.includes("ip-10-0-1-11")));
  });
});

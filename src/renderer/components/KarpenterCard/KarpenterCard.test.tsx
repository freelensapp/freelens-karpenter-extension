// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NodeClaim } from "../../api/nodeclaim/nodeclaim-v1";
import { NodePool } from "../../api/nodepool/nodepool-v1";
import { KarpenterCard } from "./KarpenterCard";

import type { Node } from "../../utils/kube-helpers";

// No event in the store, no pod, no NodeOverlay.
vi.mock("../../data/stores", () => ({
  getKarpenterEventStore: () => ({ items: [], isLoaded: true, loadAll: vi.fn(async () => undefined) }),
  getNodeOverlayStore: () => undefined,
  getPodStore: () => ({ items: [] }),
  karpenterEventNamespaces: ["default"],
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
  it("says that the NodePool has no events, with a refresh and without the debug table (C3)", () => {
    render(<KarpenterCard nodePool={nodePool} nodes={[node]} />);

    fireEvent.click(screen.getByTitle("Toggle scaling event history"));

    expect(screen.getByText(/No events found for/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Refresh/ })).toBeTruthy();
    expect(screen.queryByText(/debug/i)).toBeNull();
  });

  it("keeps a click on a link to details from the document, where the host's drawer listens (B14)", () => {
    const claim = new NodeClaim({
      apiVersion: "karpenter.sh/v1",
      kind: "NodeClaim",
      metadata: {
        name: "general-pend1",
        uid: "pend1",
        resourceVersion: "1",
        selfLink: "",
        labels: { "karpenter.sh/nodepool": "general" },
      },
      spec: { nodeClassRef: { group: "karpenter.k8s.aws", kind: "EC2NodeClass", name: "default" }, requirements: [] },
    });
    render(<KarpenterCard nodePool={nodePool} nodes={[node]} claims={[claim]} />);
    const reached = vi.fn();
    document.addEventListener("click", reached);
    try {
      for (const title of ["Click to open NodeClaim details", "Click to open node details", "Open NodePool general"]) {
        fireEvent.click(screen.getAllByTitle(title)[0]!);
      }
    } finally {
      document.removeEventListener("click", reached);
    }
    expect(reached).not.toHaveBeenCalled();
  });
});

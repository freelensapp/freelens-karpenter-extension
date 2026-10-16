// @vitest-environment jsdom

import { Renderer } from "@freelensapp/extensions";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { NodeKarpenterDetails } from "./node-karpenter-details";

const node = (labels: Record<string, string>, annotations: Record<string, string> = {}) =>
  ({
    metadata: { name: "kwok-general-abc12", creationTimestamp: "2026-10-16T08:00:00Z", labels, annotations },
    spec: {},
    status: { conditions: [{ type: "Ready", status: "True" }] },
  }) as unknown as Renderer.K8sApi.Node;

afterEach(cleanup);

describe("NodeKarpenterDetails", () => {
  it("shows the Karpenter section of a Karpenter node, with links that open its NodePool and NodeClaim in the drawer", () => {
    render(
      <NodeKarpenterDetails
        object={node(
          {
            "karpenter.sh/nodepool": "general",
            "karpenter.sh/nodeclaim": "general-abc12",
            "karpenter.sh/capacity-type": "on-demand",
            "karpenter.sh/registered": "true",
          },
          { "karpenter.sh/do-not-disrupt": "true" },
        )}
      />,
    );

    expect(screen.getByText("Karpenter")).toBeTruthy();
    expect(screen.getByText("On-Demand")).toBeTruthy();
    expect(screen.getByText("Registered")).toBeTruthy();
    expect(screen.getByText("Do not disrupt")).toBeTruthy();

    // In place of the node's details, over the same page, as the host's own links in a drawer.
    // The click's default is prevented, or the host's drawer would take it for a click outside itself (fireEvent
    // returns false when it is).
    expect(fireEvent.click(screen.getByText("general"))).toBe(false);
    expect(Renderer.Navigation.showDetails).toHaveBeenLastCalledWith("/apis/karpenter.sh/v1/nodepools/general");
    expect(fireEvent.click(screen.getByText("general-abc12"))).toBe(false);
    expect(Renderer.Navigation.showDetails).toHaveBeenLastCalledWith("/apis/karpenter.sh/v1/nodeclaims/general-abc12");
    expect(Renderer.Navigation.navigate).not.toHaveBeenCalled();
  });

  it("shows nothing for another node", () => {
    const { container } = render(<NodeKarpenterDetails object={node({ "kubernetes.io/os": "linux" })} />);
    expect(container.innerHTML).toBe("");
  });
});

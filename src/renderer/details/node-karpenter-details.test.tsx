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
  it("shows the Karpenter section of a Karpenter node, with links to its NodePool and NodeClaim", () => {
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

    fireEvent.click(screen.getByText("general"));
    expect(Renderer.Navigation.navigate).toHaveBeenLastCalledWith(
      "/crd/karpenter.sh/nodepools?kube-details=%2Fapis%2Fkarpenter.sh%2Fv1%2Fnodepools%2Fgeneral&kube-selected=%2Fapis%2Fkarpenter.sh%2Fv1%2Fnodepools%2Fgeneral",
    );
    fireEvent.click(screen.getByText("general-abc12"));
    expect(Renderer.Navigation.navigate).toHaveBeenLastCalledWith(
      expect.stringContaining("%2Fapis%2Fkarpenter.sh%2Fv1%2Fnodeclaims%2Fgeneral-abc12"),
    );
  });

  it("shows nothing for another node", () => {
    const { container } = render(<NodeKarpenterDetails object={node({ "kubernetes.io/os": "linux" })} />);
    expect(container.innerHTML).toBe("");
  });
});

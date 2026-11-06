// @vitest-environment jsdom

import { Renderer } from "@freelensapp/extensions";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PieChart } from "./pie-chart";

import type { Node } from "../../utils/kube-helpers";

const node = (name: string) =>
  ({
    metadata: { name, labels: { "karpenter.sh/nodepool": "general" } },
    spec: {},
    status: { conditions: [{ type: "Ready", status: "True" }] },
    getName: () => name,
  }) as unknown as Node;

const chartData = () => vi.mocked(Renderer.Component.PieChart).mock.lastCall?.[0].data;

describe("PieChart", () => {
  it("gives the host's chart the same data while the counts stay, so that it does not animate again", () => {
    const props = { nodePools: [], objects: [], title: "Overview", limits: { cpu: "", memory: "" } };
    const { rerender } = render(<PieChart {...props} nodes={[node("a")]} />);
    const first = chartData();

    rerender(<PieChart {...props} nodes={[node("a")]} />);
    expect(chartData()).toBe(first);

    rerender(<PieChart {...props} nodes={[node("a"), node("b")]} />);
    expect(chartData()).not.toBe(first);
  });
});

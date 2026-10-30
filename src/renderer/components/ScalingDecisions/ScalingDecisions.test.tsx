// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { observable, runInAction } from "mobx";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ScalingDecisions } from "./ScalingDecisions";

// The stores of the host keep one observable array each and update it in place.
const events = observable.array<object>([], { deep: false });
const nodePools = observable.array<object>([], { deep: false });
const nodes = observable.array<object>([], { deep: false });

vi.mock("../../data/stores", () => ({
  getKarpenterEventStore: () => ({ items: events }),
  getNodePoolStore: () => ({ items: nodePools }),
  getNodeStore: () => ({ items: nodes }),
}));

const NOW = Date.parse("2026-10-16T12:00:00Z");
const MIN = 60_000;

let version = 0;
const versioned = <T extends object>(id: string, fields: T) => ({
  ...fields,
  getId: () => id,
  getName: () => id,
  getResourceVersion: () => String(++version),
});

const event = (id: string, reason: string, kind: string, name: string, minutesAgo: number, source = "karpenter") =>
  versioned(id, {
    metadata: { uid: id, creationTimestamp: new Date(NOW - minutesAgo * MIN).toISOString() },
    involvedObject: { kind, name, namespace: kind === "Pod" ? "default" : undefined },
    reason,
    type: "Normal",
    message: `${reason} ${name}`,
    source: { component: source },
    lastTimestamp: new Date(NOW - minutesAgo * MIN).toISOString(),
  });

const pool = (name: string) => versioned(name, { metadata: { name } });

const node = (name: string, pool: string, claim: string) =>
  versioned(name, { metadata: { name, labels: { "karpenter.sh/nodepool": pool, "karpenter.sh/nodeclaim": claim } } });

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
    left: 0,
    top: 0,
    width: 800,
    height: 200,
  } as DOMRect);
  Element.prototype.scrollIntoView = vi.fn();
});

afterAll(() => {
  vi.useRealTimers();
});

afterEach(() => {
  cleanup();
  runInAction(() => {
    events.clear();
    nodePools.clear();
    nodes.clear();
  });
});

describe("ScalingDecisions", () => {
  it("shows the Karpenter events in the tables and a panel per NodePool", () => {
    runInAction(() => {
      nodePools.replace([pool("general")]);
      nodes.replace([node("n1", "general", "general-a")]);
      events.replace([
        event("e1", "Launched", "NodeClaim", "general-a", 20),
        event("e2", "Nominated", "Pod", "web-1", 19),
        event("e3", "Pulled", "Pod", "web-1", 18, "kubelet"),
      ]);
    });
    render(<ScalingDecisions />);

    expect(screen.getByText("2 / 2 karpenter events")).toBeTruthy();
    expect(screen.getByText("NodePool: general")).toBeTruthy();
    expect(screen.getByText("1 nodes now · 1 events in window")).toBeTruthy();
    expect(screen.getByText("Launched general-a")).toBeTruthy();
    expect(screen.getByText("Nominated web-1")).toBeTruthy();
    expect(screen.queryByText("Pulled web-1")).toBeNull();
  });

  it("follows the stores while it is open", () => {
    runInAction(() => {
      nodePools.replace([pool("general")]);
      nodes.replace([node("n1", "general", "general-a")]);
      events.replace([event("e1", "Launched", "NodeClaim", "general-a", 20)]);
    });
    render(<ScalingDecisions />);
    expect(screen.getByText("1 / 1 karpenter events")).toBeTruthy();

    act(() =>
      runInAction(() => {
        events.push(event("e2", "Launched", "NodeClaim", "general-b", 5));
        nodes.push(node("n2", "general", "general-b"));
      }),
    );
    expect(screen.getByText("2 / 2 karpenter events")).toBeTruthy();
    expect(screen.getByText("2 nodes now · 2 events in window")).toBeTruthy();

    // An event updated in place, as a repeated event is, moves out of the 1h range.
    fireEvent.click(screen.getByRole("button", { name: "1h" }));
    expect(screen.getByText("2 / 2 karpenter events")).toBeTruthy();
    act(() => runInAction(() => events.splice(1, 1, event("e2", "Launched", "NodeClaim", "general-b", 90))));
    expect(screen.getByText("1 / 2 karpenter events")).toBeTruthy();
  });

  it("filters by NodePool and by group", () => {
    runInAction(() => {
      nodePools.replace([pool("general"), pool("gpu")]);
      events.replace([
        event("e1", "Launched", "NodeClaim", "general-a", 20),
        event("e2", "Launched", "NodeClaim", "gpu-a", 15),
        event("e3", "Finalized", "NodeClaim", "gpu-b", 10),
      ]);
    });
    render(<ScalingDecisions />);
    expect(screen.getByText("3 / 3 karpenter events")).toBeTruthy();

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "gpu" } });
    expect(screen.getByText("2 / 3 karpenter events")).toBeTruthy();

    // The group tabs of the "All NodePools" panel.
    fireEvent.click(screen.getAllByTitle("Toggle Scale down")[0]!);
    expect(screen.getByText("1 / 3 karpenter events")).toBeTruthy();
    expect(screen.queryByText("Finalized gpu-b")).toBeNull();
  });

  it("selects the bucket clicked on the chart and clears it", () => {
    runInAction(() => {
      nodePools.replace([pool("general")]);
      events.replace([event("e1", "Launched", "NodeClaim", "general-a", 8)]);
    });
    const { container } = render(<ScalingDecisions />);
    expect(screen.queryAllByTitle("Clear selected time bucket")).toHaveLength(0);

    // 6h in 5m buckets is 73 buckets over the 756 of the plot; the event is in the bucket of 11:50, the 71st.
    const chart = container.querySelector("svg")!;
    fireEvent.mouseMove(chart, { clientX: 36 + 70.5 * (756 / 73) });
    fireEvent.click(chart);
    // Every panel offers to clear it.
    expect(screen.getAllByTitle("Clear selected time bucket")).toHaveLength(2);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();

    fireEvent.click(screen.getAllByTitle("Clear selected time bucket")[0]!);
    expect(screen.queryAllByTitle("Clear selected time bucket")).toHaveLength(0);
  });
});

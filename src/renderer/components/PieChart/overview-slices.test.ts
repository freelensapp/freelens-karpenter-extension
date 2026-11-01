import { describe, expect, it } from "vitest";
import { NodePool } from "../../api/nodepool/nodepool-v1";
import { COLOR, STATUS_BORDER_COLOR } from "../../config/theme";
import { computeOverviewSlices, nodePoolDotColor, overviewChartData } from "./overview-slices";

import type { OverviewStats } from "./overview-stats";

const stats = (counts: Partial<OverviewStats>): OverviewStats => ({
  total: 0,
  karpenter: 0,
  nonKarpenter: 0,
  ready: 0,
  notReady: 0,
  provisioning: 0,
  terminating: 0,
  poolCount: 0,
  poolsReady: 0,
  poolsNotReady: 0,
  ...counts,
});

const pool = (name: string, conditions: { type: string; status: string }[]) =>
  new NodePool({
    apiVersion: "karpenter.sh/v1",
    kind: "NodePool",
    metadata: { name, uid: name, resourceVersion: "1", selfLink: "" },
    spec: { template: { spec: { nodeClassRef: { group: "g", kind: "k", name: "n" }, requirements: [] } } },
    status: { conditions },
  });

describe("computeOverviewSlices", () => {
  it("has a slice per node status, in the colours of the stat boxes, and the other nodes in grey", () => {
    const slices = computeOverviewSlices(
      stats({ total: 10, karpenter: 9, nonKarpenter: 1, ready: 4, provisioning: 3, terminating: 1, notReady: 1 }),
    );

    expect(slices.map(({ label, value, color }) => ({ label, value, color }))).toEqual([
      { label: "Ready", value: 4, color: COLOR.success },
      { label: "Provisioning", value: 3, color: COLOR.warning },
      { label: "Terminating", value: 1, color: COLOR.terminating },
      { label: "Not Ready", value: 1, color: COLOR.danger },
      { label: "Non-Karpenter", value: 1, color: COLOR.neutral },
    ]);
  });

  it("leaves out a status with no node: Ready Karpenter nodes and another node are green and grey", () => {
    const slices = computeOverviewSlices(stats({ total: 2, karpenter: 1, nonKarpenter: 1, ready: 1 }));

    expect(slices.map(({ label, color }) => ({ label, color }))).toEqual([
      { label: "Ready", color: COLOR.success },
      { label: "Non-Karpenter", color: COLOR.neutral },
    ]);
  });

  it("has no slice without nodes", () => {
    expect(computeOverviewSlices(stats({}))).toEqual([]);
  });

  it("names the status and the share in the tooltip", () => {
    const [ready, notReady, other] = computeOverviewSlices(
      stats({ total: 4, karpenter: 3, nonKarpenter: 1, ready: 2, notReady: 1 }),
    );

    expect(ready?.tooltip("50%")).toBe("Ready: 50%");
    expect(notReady?.tooltip("25%")).toBe("Not Ready: 25%");
    expect(other?.tooltip("25%")).toBe("Non-Karpenter: 25%");
  });

  it("uses fixed colours only, which the canvas of the chart can draw", () => {
    const slices = computeOverviewSlices(
      stats({ total: 5, karpenter: 4, nonKarpenter: 1, ready: 1, provisioning: 1, terminating: 1, notReady: 1 }),
    );

    for (const slice of slices) {
      expect(slice.color).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

describe("overviewChartData", () => {
  it("gives the chart the values, colours, labels and tooltips of the slices, in their order", () => {
    const slices = computeOverviewSlices(stats({ total: 3, karpenter: 2, nonKarpenter: 1, ready: 2 }));
    const data = overviewChartData(slices);

    expect(data.labels).toEqual(["Ready: 2", "Non-Karpenter: 1"]);
    expect(data.datasets).toHaveLength(1);
    const [dataset] = data.datasets ?? [];
    expect(dataset?.data).toEqual([2, 1]);
    expect(dataset?.backgroundColor).toEqual([COLOR.success, COLOR.neutral]);
    expect(dataset?.tooltipLabels?.map((label) => (typeof label === "function" ? label("10%") : label))).toEqual([
      "Ready: 10%",
      "Non-Karpenter: 10%",
    ]);
  });

  it("has an empty dataset without slices", () => {
    const data = overviewChartData([]);

    expect(data.labels).toEqual([]);
    expect(data.datasets?.[0]?.data).toEqual([]);
  });
});

describe("nodePoolDotColor", () => {
  it("is the colour of the card of the NodePool for its status", () => {
    expect(nodePoolDotColor(pool("ready", [{ type: "Ready", status: "True" }]))).toBe(COLOR.success);
    expect(nodePoolDotColor(pool("broken", [{ type: "Ready", status: "False" }]))).toBe(COLOR.danger);
    expect(nodePoolDotColor(pool("new", []))).toBe(STATUS_BORDER_COLOR.Unknown);
  });
});

import { describe, expect, it } from "vitest";
import {
  computeKpi,
  GROUP_PALETTE,
  getNodeCapacityType,
  getNodeClassRef,
  getNodeZone,
  groupNodes,
  nodeSize,
  OTHER_GROUP_COLOR,
  type Rect,
  squarify,
} from "./topology-utils";

import type { NodePool } from "../../api/nodepool/nodepool-v1";
import type { Node } from "../../utils/kube-helpers";

const now = Date.parse("2026-10-16T10:00:00Z");
const old = "2026-10-16T08:00:00Z";

const node = (
  name: string,
  fields: {
    labels?: Record<string, string>;
    ready?: "True" | "False";
    creationTimestamp?: string;
    deletionTimestamp?: string;
    allocatable?: Record<string, string>;
    capacity?: Record<string, string>;
  } = {},
) =>
  ({
    metadata: {
      name,
      labels: fields.labels,
      creationTimestamp: fields.creationTimestamp ?? old,
      deletionTimestamp: fields.deletionTimestamp,
    },
    spec: {},
    status: {
      conditions: fields.ready ? [{ type: "Ready", status: fields.ready }] : [],
      allocatable: fields.allocatable,
      capacity: fields.capacity,
    },
  }) as unknown as Node;

const pool = (name: string, nodeClassRef?: { group?: string; kind?: string; name?: string }) =>
  ({
    metadata: { name },
    spec: { template: { spec: nodeClassRef ? { nodeClassRef } : {} } },
  }) as unknown as NodePool;

const karpenterNode = (name: string, pool: string, extra: Record<string, string> = {}) =>
  node(name, {
    ready: "True",
    labels: { "karpenter.sh/nodepool": pool, ...extra },
    allocatable: { cpu: "2", memory: "8Gi", pods: "110" },
  });

describe("node classification", () => {
  it("reads the zone from the current label, then the deprecated one", () => {
    expect(getNodeZone(node("a", { labels: { "topology.kubernetes.io/zone": "eu-1a" } }))).toBe("eu-1a");
    expect(getNodeZone(node("a", { labels: { "failure-domain.beta.kubernetes.io/zone": "eu-1b" } }))).toBe("eu-1b");
    expect(getNodeZone(node("a"))).toBe("unknown");
  });

  it("reads the capacity type of Karpenter, of the AWS provider and of EKS", () => {
    expect(getNodeCapacityType(node("a", { labels: { "karpenter.sh/capacity-type": "spot" } }))).toBe("spot");
    expect(getNodeCapacityType(node("a", { labels: { "karpenter.k8s.aws/capacity-type": "on-demand" } }))).toBe(
      "on-demand",
    );
    // EKS managed node groups label ON_DEMAND.
    expect(getNodeCapacityType(node("a", { labels: { "eks.amazonaws.com/capacityType": "ON_DEMAND" } }))).toBe(
      "on-demand",
    );
    expect(getNodeCapacityType(node("a", { labels: { "eks.amazonaws.com/capacityType": "SPOT" } }))).toBe("spot");
    expect(getNodeCapacityType(node("a", { labels: { "eks.amazonaws.com/capacityType": "ONDEMAND" } }))).toBe(
      "on-demand",
    );
    expect(getNodeCapacityType(node("a"))).toBe("unknown");
  });

  it("names the node class of the node's NodePool, or unknown", () => {
    const pools = new Map([
      ["general", pool("general", { group: "karpenter.k8s.aws", kind: "EC2NodeClass", name: "default" })],
      ["bare", pool("bare")],
    ]);
    expect(getNodeClassRef(karpenterNode("a", "general"), pools)).toBe("EC2NodeClass/default");
    expect(getNodeClassRef(karpenterNode("a", "bare"), pools)).toBe("unknown");
    expect(getNodeClassRef(karpenterNode("a", "missing"), pools)).toBe("unknown");
    expect(getNodeClassRef(node("a"), pools)).toBe("unknown");
  });
});

describe("groupNodes", () => {
  const pools = [
    pool("general", { kind: "EC2NodeClass", name: "default" }),
    pool("gpu", { kind: "EC2NodeClass", name: "gpu" }),
  ];
  const nodes = [
    karpenterNode("g1", "general", { "topology.kubernetes.io/zone": "a", "node.kubernetes.io/instance-type": "m5" }),
    karpenterNode("g2", "general", { "topology.kubernetes.io/zone": "b", "node.kubernetes.io/instance-type": "m5" }),
    karpenterNode("p1", "gpu", { "topology.kubernetes.io/zone": "b", "node.kubernetes.io/instance-type": "g5" }),
    node("cp", { ready: "True" }),
  ];

  it("groups by NodePool, the largest group first, and puts the other nodes last", () => {
    const groups = groupNodes(nodes, pools, "pool");
    expect(groups.map((g) => [g.label, g.nodes.map((n) => n.metadata.name)])).toEqual([
      ["general", ["g1", "g2"]],
      ["gpu", ["p1"]],
      ["Other (non-Karpenter)", ["cp"]],
    ]);
    expect(groups.map((g) => g.color)).toEqual([GROUP_PALETTE[0], GROUP_PALETTE[1], OTHER_GROUP_COLOR]);
    expect(groups.at(-1)?.isOther).toBe(true);
  });

  it("groups by zone, instance type and node class, ties in alphabetical order", () => {
    const labels = (groupBy: Parameters<typeof groupNodes>[2]) =>
      groupNodes(nodes, pools, groupBy).map((g) => `${g.label}:${g.nodes.length}`);
    expect(labels("zone")).toEqual(["b:2", "a:1", "Other (non-Karpenter):1"]);
    expect(labels("instanceType")).toEqual(["m5:2", "g5:1", "Other (non-Karpenter):1"]);
    expect(labels("nodeClass")).toEqual(["EC2NodeClass/default:2", "EC2NodeClass/gpu:1", "Other (non-Karpenter):1"]);
  });

  it("has no other group when every node is Karpenter's, and no group without nodes", () => {
    expect(groupNodes(nodes.slice(0, 3), pools, "pool").some((g) => g.isOther)).toBe(false);
    expect(groupNodes([], pools, "pool")).toEqual([]);
  });
});

describe("nodeSize", () => {
  it("weighs a node by CPU, memory, pods or equally, never zero", () => {
    const n = karpenterNode("a", "general");
    expect(nodeSize(n, "cpu")).toBe(2);
    expect(nodeSize(n, "memory")).toBe(8);
    expect(nodeSize(n, "pods")).toBe(110);
    expect(nodeSize(n, "equal")).toBe(1);
    const bare = node("b");
    expect(["cpu", "memory", "pods", "equal"].map((s) => nodeSize(bare, s as "cpu"))).toEqual([1, 1, 1, 1]);
  });

  it("falls back to the capacity without allocatable", () => {
    expect(nodeSize(node("a", { capacity: { cpu: "4", memory: "16Gi" } }), "cpu")).toBe(4);
    expect(nodeSize(node("a", { capacity: { cpu: "4", memory: "16Gi" } }), "memory")).toBe(16);
  });
});

describe("computeKpi", () => {
  it("counts the nodes by status, capacity type and owner, and sums their capacity", () => {
    const nodes = [
      karpenterNode("ready", "general", { "karpenter.sh/capacity-type": "spot" }),
      node("young", {
        labels: { "karpenter.sh/nodepool": "general", "karpenter.sh/capacity-type": "on-demand" },
        creationTimestamp: "2026-10-16T09:58:00Z",
      }),
      node("down", { ready: "False", labels: { "karpenter.sh/nodepool": "general" } }),
      node("leaving", { ready: "True", deletionTimestamp: "2026-10-16T09:59:00Z", allocatable: { cpu: "500m" } }),
    ];
    expect(computeKpi(nodes, [pool("general"), pool("empty")], now)).toEqual({
      poolCount: 2,
      totalNodes: 4,
      karpenterNodes: 3,
      ready: 1,
      provisioning: 1,
      notReady: 1,
      terminating: 1,
      totalCpuCores: 2.5,
      totalMemGi: 8,
      spotNodes: 1,
      onDemandNodes: 1,
      karpenterCoverage: 75,
    });
  });

  it("has a coverage of 0 without nodes", () => {
    expect(computeKpi([], [], now).karpenterCoverage).toBe(0);
  });
});

describe("squarify", () => {
  const area: Rect = { x: 10, y: 20, w: 400, h: 300 };
  const weighted = (values: number[]) => values.map((value, i) => ({ item: `n${i}`, value }));
  const areaOf = (r: Rect) => r.w * r.h;

  const expectInside = (rect: Rect) => {
    const eps = 1e-6;
    expect(rect.x).toBeGreaterThanOrEqual(area.x - eps);
    expect(rect.y).toBeGreaterThanOrEqual(area.y - eps);
    expect(rect.x + rect.w).toBeLessThanOrEqual(area.x + area.w + eps);
    expect(rect.y + rect.h).toBeLessThanOrEqual(area.y + area.h + eps);
  };

  it("places every item once, inside the area, with an area proportional to its weight", () => {
    const values = [8, 5, 5, 3, 2, 1, 1, 0.5];
    const out = squarify(weighted(values), area);
    expect(out.map((o) => o.item).sort()).toEqual(values.map((_, i) => `n${i}`).sort());
    const total = values.reduce((s, v) => s + v, 0);
    for (const { item, rect } of out) {
      expectInside(rect);
      const value = values[Number(item.slice(1))]!;
      expect(areaOf(rect)).toBeCloseTo((value / total) * areaOf(area), 6);
    }
    expect(out.reduce((s, o) => s + areaOf(o.rect), 0)).toBeCloseTo(areaOf(area), 6);
  });

  it("does not overlap two items", () => {
    const out = squarify(weighted([7, 6, 6, 4, 3, 2, 2, 1, 1, 1]), area);
    for (const [i, a] of out.entries()) {
      for (const b of out.slice(i + 1)) {
        const w = Math.min(a.rect.x + a.rect.w, b.rect.x + b.rect.w) - Math.max(a.rect.x, b.rect.x);
        const h = Math.min(a.rect.y + a.rect.h, b.rect.y + b.rect.h) - Math.max(a.rect.y, b.rect.y);
        expect(w <= 1e-6 || h <= 1e-6).toBe(true);
      }
    }
  });

  it("gives one item the whole area", () => {
    expect(squarify(weighted([3]), area)).toEqual([{ item: "n0", rect: area }]);
  });

  it("lays out many equal weights", () => {
    const out = squarify(weighted(Array.from({ length: 200 }, () => 1)), area);
    expect(out).toHaveLength(200);
    for (const { rect } of out) expect(areaOf(rect)).toBeCloseTo(areaOf(area) / 200, 6);
  });

  it("returns nothing for an empty or degenerate area, or without positive weights", () => {
    expect(squarify(weighted([1, 2]), { x: 0, y: 0, w: 0, h: 300 })).toEqual([]);
    expect(squarify(weighted([1, 2]), { x: 0, y: 0, w: 400, h: -1 })).toEqual([]);
    expect(squarify(weighted([1, 2]), { x: 0, y: 0, w: Number.NaN, h: 300 })).toEqual([]);
    expect(squarify([], area)).toEqual([]);
    expect(squarify(weighted([0, -1, Number.NaN]), area)).toEqual([]);
  });

  it("skips the items without a positive weight", () => {
    expect(squarify(weighted([0, 2, -1]), area).map((o) => o.item)).toEqual(["n1"]);
  });

  // #33: a tiny or a very thin area could leave the row empty with NaN ratios,
  // and the layout called itself on the same list without end.
  it("ends on a tiny or very thin area and on extreme weights (#33)", () => {
    const many = weighted(Array.from({ length: 500 }, (_, i) => (i % 7) + 1));
    for (const a of [
      { x: 0, y: 0, w: 1e-9, h: 1e-9 },
      { x: 0, y: 0, w: 1, h: 1e6 },
      { x: 0, y: 0, w: 1e6, h: 1 },
      { x: 0, y: 0, w: Number.MIN_VALUE, h: 300 },
    ]) {
      const out = squarify(many, a);
      expect(out.length).toBeLessThanOrEqual(500);
    }
    const extreme = squarify(weighted([1e300, 1e-300, 1, Number.MAX_VALUE]), area);
    expect(extreme.length).toBeLessThanOrEqual(4);
  });
});

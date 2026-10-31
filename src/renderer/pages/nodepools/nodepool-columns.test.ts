import { describe, expect, it } from "vitest";
import { NodePool } from "../../api/nodepool/nodepool-v1";
import { nodePoolColumnValues, nodePoolSortValues } from "./nodepool-columns";

import type { NodePoolSpec, NodePoolStatus } from "../../api/karpenter/karpenter-v1-types";

const nodePool = (name: string, spec: Partial<NodePoolSpec> = {}, status?: NodePoolStatus) =>
  new NodePool({
    apiVersion: "karpenter.sh/v1",
    kind: "NodePool",
    metadata: { name, uid: name, resourceVersion: "1", selfLink: "" },
    spec: {
      template: {
        spec: {
          nodeClassRef: { group: "karpenter.k8s.aws", kind: "EC2NodeClass", name: "default" },
          requirements: [],
        },
      },
      ...spec,
    },
    status,
  });

// general of the AWS fixtures of the integration tests, with a weight.
const general = nodePool(
  "general",
  { weight: 50 },
  {
    nodes: 4,
    resources: { cpu: "16", memory: "59687568Ki", pods: "174" },
    conditions: [
      { type: "NodeClassReady", status: "True" },
      { type: "Ready", status: "False", reason: "NodeClassNotReady" },
    ],
  },
);

describe("nodePoolColumnValues", () => {
  it("has the value of the jsonPath of each column, as kubectl prints it", () => {
    expect(nodePoolColumnValues(general)).toEqual({
      nodeClass: "default",
      nodes: "4",
      ready: "False",
      weight: "50",
      cpu: "16",
      memory: "59687568Ki",
    });
  });

  it("has no value where the NodePool has none", () => {
    expect(nodePoolColumnValues(nodePool("new"))).toEqual({
      nodeClass: "default",
      nodes: undefined,
      ready: undefined,
      weight: undefined,
      cpu: undefined,
      memory: undefined,
    });
  });

  it("shows a quantity written as a number as it is", () => {
    expect(nodePoolColumnValues(nodePool("n", {}, { resources: { cpu: 8 } })).cpu).toBe("8");
  });
});

describe("nodePoolSortValues", () => {
  it("sorts numbers and quantities by their amount, and a NodePool without a value first", () => {
    const small = nodePool("small", { weight: 9 }, { nodes: 10, resources: { cpu: "500m", memory: "512Mi" } });
    const none = nodePool("none");
    expect(nodePoolSortValues.nodes(general)).toBe(4);
    expect(nodePoolSortValues.nodes(small)).toBe(10);
    expect(nodePoolSortValues.nodes(none)).toBe(-1);
    expect(nodePoolSortValues.weight(small)).toBeLessThan(nodePoolSortValues.weight(general) as number);
    expect(nodePoolSortValues.weight(none)).toBe(-1);
    expect(nodePoolSortValues.cpu(small)).toBe(0.5);
    expect(nodePoolSortValues.cpu(general)).toBe(16);
    expect(nodePoolSortValues.memory(small)).toBe(0.5);
    expect(nodePoolSortValues.memory(none)).toBe(-1);
    expect(nodePoolSortValues.nodeClass(general)).toBe("default");
  });

  it("sorts Ready before not ready, and both before unknown", () => {
    const ready = nodePool("r", {}, { conditions: [{ type: "Ready", status: "True" }] });
    const unknown = nodePool("u", {}, { conditions: [{ type: "Ready", status: "Unknown" }] });
    const order = [nodePool("none"), unknown, general, ready].map((p) => nodePoolSortValues.ready(p));
    expect(order).toEqual([3, 2, 1, 0]);
  });
});

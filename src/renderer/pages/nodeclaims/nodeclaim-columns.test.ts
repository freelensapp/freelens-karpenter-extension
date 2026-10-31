import { describe, expect, it } from "vitest";
import { NodeClaim } from "../../api/nodeclaim/nodeclaim-v1";
import { nodeClaimColumnValues, nodeClaimSortValues } from "./nodeclaim-columns";

import type { NodeClaimStatus } from "../../api/karpenter/karpenter-v1-types";

const nodeClaim = (name: string, labels: Record<string, string> = {}, status?: NodeClaimStatus) =>
  new NodeClaim({
    apiVersion: "karpenter.sh/v1",
    kind: "NodeClaim",
    metadata: { name, uid: name, resourceVersion: "1", selfLink: "", labels },
    spec: {
      nodeClassRef: { group: "karpenter.k8s.aws", kind: "EC2NodeClass", name: "default" },
      requirements: [],
    },
    status,
  });

// general-9qwmt of the AWS fixtures of the integration tests.
const launched = nodeClaim(
  "general-9qwmt",
  {
    "karpenter.sh/nodepool": "general",
    "karpenter.sh/capacity-type": "on-demand",
    "node.kubernetes.io/instance-type": "m5.2xlarge",
    "topology.kubernetes.io/zone": "eu-west-1b",
  },
  {
    nodeName: "ip-10-0-2-12.eu-west-1.compute.internal",
    providerID: "aws:///eu-west-1b/i-0b79059e1a64a764c",
    imageID: "ami-0a1b2c3d4e5f60001",
    conditions: [
      { type: "Ready", status: "True" },
      { type: "Drifted", status: "True", reason: "AMIDrift" },
    ],
  },
);

// general-pend1, still waiting for its node.
const pending = nodeClaim(
  "general-pend1",
  { "karpenter.sh/nodepool": "general", "karpenter.sh/capacity-type": "on-demand" },
  { conditions: [{ type: "Launched", status: "Unknown", reason: "NotLaunched" }] },
);

describe("nodeClaimColumnValues", () => {
  it("has the value of the jsonPath of each column, as kubectl prints it", () => {
    expect(nodeClaimColumnValues(launched)).toEqual({
      type: "m5.2xlarge",
      capacity: "on-demand",
      zone: "eu-west-1b",
      node: "ip-10-0-2-12.eu-west-1.compute.internal",
      ready: "True",
      imageID: "ami-0a1b2c3d4e5f60001",
      id: "aws:///eu-west-1b/i-0b79059e1a64a764c",
      nodePool: "general",
      nodeClass: "default",
      drifted: "True",
    });
  });

  it("has no value where a NodeClaim without a node has none", () => {
    expect(nodeClaimColumnValues(pending)).toEqual({
      type: undefined,
      capacity: "on-demand",
      zone: undefined,
      node: undefined,
      ready: undefined,
      imageID: undefined,
      id: undefined,
      nodePool: "general",
      nodeClass: "default",
      drifted: undefined,
    });
  });

  it("takes an empty field for no value, as kubectl does", () => {
    const empty = nodeClaim("e", { "topology.kubernetes.io/zone": "" }, { nodeName: "", providerID: "" });
    expect(nodeClaimColumnValues(empty)).toMatchObject({ zone: undefined, node: undefined, id: undefined });
  });
});

describe("nodeClaimSortValues", () => {
  it("sorts texts by their text, and a NodeClaim without one first", () => {
    expect(nodeClaimSortValues.type(launched)).toBe("m5.2xlarge");
    expect(nodeClaimSortValues.type(pending)).toBe("");
    expect(nodeClaimSortValues.node(pending)).toBe("");
    expect(nodeClaimSortValues.id(launched)).toBe("aws:///eu-west-1b/i-0b79059e1a64a764c");
    expect(nodeClaimSortValues.nodePool(pending)).toBe("general");
    expect(nodeClaimSortValues.nodeClass(pending)).toBe("default");
  });

  it("sorts the statuses of Ready and Drifted True, False, Unknown, then none", () => {
    const notReady = nodeClaim("n", {}, { conditions: [{ type: "Ready", status: "False" }] });
    expect([launched, notReady, pending].map(nodeClaimSortValues.ready)).toEqual([0, 1, 3]);
    expect([launched, pending].map(nodeClaimSortValues.drifted)).toEqual([0, 3]);
  });
});

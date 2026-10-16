import { describe, expect, it } from "vitest";
import { NodeClaim } from "../api/nodeclaim/nodeclaim-v1";
import { NodePool } from "../api/nodepool/nodepool-v1";
import { claimingByPoolName, nodePoolMatchesFilter, nodesOfPool, parseSearchTokens } from "./overview-filter";

import type { Node } from "../utils/kube-helpers";

const created = "2026-10-16T08:00:00Z";
const later = Date.parse(created) + 60 * 60_000;

const pool = (name: string, ready?: "True" | "False") =>
  new NodePool({
    apiVersion: "karpenter.sh/v1",
    kind: "NodePool",
    metadata: { name, uid: name, resourceVersion: "1", selfLink: "" },
    spec: { template: { spec: { nodeClassRef: { group: "g", kind: "k", name: "n" }, requirements: [] } } },
    status: ready ? { conditions: [{ type: "Ready", status: ready }] } : {},
  });

const node = (name: string, poolName: string, ready: "True" | "False", type: string) =>
  ({
    metadata: {
      name,
      creationTimestamp: created,
      labels: { "karpenter.sh/nodepool": poolName, "node.kubernetes.io/instance-type": type },
    },
    spec: {},
    status: { conditions: [{ type: "Ready", status: ready }] },
  }) as unknown as Node;

const claim = (name: string, poolName: string | undefined, nodeName?: string) =>
  new NodeClaim({
    apiVersion: "karpenter.sh/v1",
    kind: "NodeClaim",
    metadata: {
      name,
      uid: name,
      resourceVersion: "1",
      selfLink: "",
      labels: poolName ? { "karpenter.sh/nodepool": poolName } : {},
    },
    spec: { nodeClassRef: { group: "g", kind: "k", name: "n" }, requirements: [] },
    status: nodeName ? { nodeName } : {},
  });

describe("parseSearchTokens", () => {
  it("splits name terms from status:, type: and poolstatus: tokens, lowercased", () => {
    expect(parseSearchTokens("  Gen status:Ready type:m5 poolstatus:notready gpu ")).toEqual({
      nameTerms: ["gen", "gpu"],
      statusTokens: ["ready"],
      typeTokens: ["m5"],
      poolStatusTokens: ["notready"],
    });
  });
});

describe("nodesOfPool and claimingByPoolName", () => {
  it("groups by the karpenter.sh/nodepool label", () => {
    const nodes = [node("a", "general", "True", "m5.large"), node("b", "gpu", "True", "g5.xlarge")];
    expect(nodesOfPool(nodes, "general").map((n) => n.metadata.name)).toEqual(["a"]);
  });

  it("keeps only the claims without a node and with a NodePool", () => {
    const claims = [claim("c1", "general"), claim("c2", "general", "a"), claim("c3", undefined), claim("c4", "gpu")];
    const byPool = claimingByPoolName(claims);
    expect(Object.keys(byPool).sort()).toEqual(["general", "gpu"]);
    expect(byPool.general.map((c) => c.metadata.name)).toEqual(["c1"]);
  });
});

describe("nodePoolMatchesFilter", () => {
  const general = pool("general", "True");
  const gpu = pool("gpu", "False");
  const generalNodes = [node("a", "general", "True", "m5.large"), node("b", "general", "False", "c6i.large")];
  const match = (
    np: NodePool,
    nodes: Node[],
    search: string,
    quick: Parameters<typeof nodePoolMatchesFilter>[3] = [],
    claims: NodeClaim[] = [],
  ) => nodePoolMatchesFilter(np, nodes, parseSearchTokens(search), quick, claims, later);

  it("matches every name term against the pool name", () => {
    expect(match(general, generalNodes, "gen")).toBe(true);
    expect(match(general, generalNodes, "gen gpu")).toBe(false);
  });

  it("matches poolstatus: against the Ready condition of the NodePool", () => {
    expect(match(general, generalNodes, "poolstatus:ready")).toBe(true);
    expect(match(gpu, [], "poolstatus:ready")).toBe(false);
    expect(match(gpu, [], "poolstatus:notready")).toBe(true);
    expect(match(pool("new"), [], "poolstatus:unknown")).toBe(true);
  });

  it("matches status: and the quick filters against the status of the nodes", () => {
    expect(match(general, generalNodes, "status:notready")).toBe(true);
    expect(match(general, generalNodes, "", ["Provisioning"])).toBe(false);
    expect(match(general, generalNodes, "", ["Ready"])).toBe(true);
  });

  it("matches Claiming against the claims of the pool", () => {
    expect(match(general, [], "", ["Claiming"], [claim("c1", "general")])).toBe(true);
    expect(match(general, [], "", ["Claiming"])).toBe(false);
  });

  it("matches type: against the instance types of the nodes", () => {
    expect(match(general, generalNodes, "type:c6i")).toBe(true);
    expect(match(general, generalNodes, "type:g5")).toBe(false);
  });
});

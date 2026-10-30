import { describe, expect, it } from "vitest";
import { NodePool } from "../../api/nodepool/nodepool-v1";
import { computeOverviewStats } from "./overview-stats";

import type { Node } from "../../utils/kube-helpers";

const created = "2026-10-16T08:00:00Z";
const later = Date.parse(created) + 60 * 60_000;

const pool = (name: string, ready: "True" | "False") =>
  new NodePool({
    apiVersion: "karpenter.sh/v1",
    kind: "NodePool",
    metadata: { name, uid: name, resourceVersion: "1", selfLink: "" },
    spec: { template: { spec: { nodeClassRef: { group: "g", kind: "k", name: "n" }, requirements: [] } } },
    status: { conditions: [{ type: "Ready", status: ready }] },
  });

const node = (name: string, poolName: string | undefined, ready: "True" | "False", deleting = false) =>
  ({
    metadata: {
      name,
      creationTimestamp: created,
      deletionTimestamp: deleting ? later : undefined,
      labels: poolName ? { "karpenter.sh/nodepool": poolName } : {},
    },
    spec: {},
    status: { conditions: [{ type: "Ready", status: ready }] },
  }) as unknown as Node;

describe("computeOverviewStats", () => {
  it("counts every NodePool, those without nodes included, and the nodes by status", () => {
    const pools = [pool("general", "True"), pool("gpu", "False"), pool("azure", "True"), pool("empty", "True")];
    const nodes = [
      node("a", "general", "True"),
      node("b", "general", "False"),
      node("c", "gpu", "True", true),
      node("d", "azure", "True"),
      node("cp", undefined, "True"),
    ];

    expect(computeOverviewStats(nodes, pools, later)).toEqual({
      total: 5,
      karpenter: 4,
      nonKarpenter: 1,
      ready: 2,
      notReady: 1,
      provisioning: 0,
      terminating: 1,
      poolCount: 4,
      poolsReady: 3,
      poolsNotReady: 1,
    });
  });

  it("has no NodePool and no node in an empty cluster", () => {
    expect(computeOverviewStats([], [], later)).toMatchObject({
      total: 0,
      poolCount: 0,
      poolsReady: 0,
      poolsNotReady: 0,
    });
  });
});

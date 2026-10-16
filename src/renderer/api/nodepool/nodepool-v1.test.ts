import { describe, expect, it } from "vitest";
import { NodePool } from "./nodepool-v1";

const nodePool = new NodePool({
  apiVersion: "karpenter.sh/v1",
  kind: "NodePool",
  metadata: { name: "general", uid: "1", resourceVersion: "1", selfLink: "" },
  spec: {
    template: {
      spec: {
        nodeClassRef: { group: "karpenter.k8s.aws", kind: "EC2NodeClass", name: "default" },
        requirements: [{ key: "karpenter.sh/capacity-type", operator: "In", values: ["spot"] }],
        expireAfter: "720h",
      },
    },
  },
  status: {
    conditions: [
      { type: "NodeClassReady", status: "True" },
      { type: "Ready", status: "False", reason: "NodeClassNotReady" },
    ],
  },
});

describe("NodePool (karpenter.sh/v1)", () => {
  it("has the metadata of its CRD", () => {
    expect(NodePool.kind).toBe("NodePool");
    expect(NodePool.namespaced).toBe(false);
    expect(NodePool.apiBase).toBe("/apis/karpenter.sh/v1/nodepools");
    expect(NodePool.crd.apiVersions).toEqual(["karpenter.sh/v1"]);
  });

  it("reads the spec of the NodeClaim template", () => {
    expect(NodePool.getTemplateSpec(nodePool)?.expireAfter).toBe("720h");
    expect(NodePool.getTemplateSpec(nodePool)?.nodeClassRef.kind).toBe("EC2NodeClass");
  });

  it("finds a condition by type", () => {
    expect(NodePool.getCondition(nodePool, "Ready")?.reason).toBe("NodeClassNotReady");
    expect(NodePool.getCondition(nodePool, "Missing")).toBeUndefined();
  });
});

import { describe, expect, it } from "vitest";
import { NodeClaim } from "./nodeclaim-v1";

const metadata = { name: "general-abc12", uid: "1", resourceVersion: "1", selfLink: "" };

const build = (overrides: Partial<ConstructorParameters<typeof NodeClaim>[0]> = {}) =>
  new NodeClaim({
    apiVersion: "karpenter.sh/v1",
    kind: "NodeClaim",
    metadata,
    spec: {
      nodeClassRef: { group: "karpenter.k8s.aws", kind: "EC2NodeClass", name: "default" },
      requirements: [],
    },
    ...overrides,
  });

describe("NodeClaim (karpenter.sh/v1)", () => {
  describe("isClaiming", () => {
    it("is claiming while it has no node", () => {
      expect(NodeClaim.isClaiming(build({ status: {} }))).toBe(true);
      expect(NodeClaim.isClaiming(build())).toBe(true);
    });

    it("is not claiming once it has a node", () => {
      expect(NodeClaim.isClaiming(build({ status: { nodeName: "ip-10-0-1-11" } }))).toBe(false);
    });

    it("is not claiming while it is deleted", () => {
      expect(
        NodeClaim.isClaiming(build({ metadata: { ...metadata, deletionTimestamp: "2026-10-16T08:00:00Z" } })),
      ).toBe(false);
    });
  });

  describe("getNodePoolName", () => {
    it("reads the karpenter.sh/nodepool label", () => {
      expect(
        NodeClaim.getNodePoolName(build({ metadata: { ...metadata, labels: { "karpenter.sh/nodepool": "general" } } })),
      ).toBe("general");
    });

    it("falls back to the annotation", () => {
      expect(
        NodeClaim.getNodePoolName(
          build({ metadata: { ...metadata, annotations: { "karpenter.sh/nodepool": "gpu" } } }),
        ),
      ).toBe("gpu");
    });

    it("is empty without either", () => {
      expect(NodeClaim.getNodePoolName(build())).toBe("");
    });
  });
});

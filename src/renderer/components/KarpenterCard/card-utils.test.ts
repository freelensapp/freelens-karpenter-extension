import { describe, expect, it } from "vitest";
import { NodeClaim } from "../../api/nodeclaim/nodeclaim-v1";
import { formatUsage, getNodeClaimInstanceType } from "./card-utils";

const claim = (labels: Record<string, string>, values?: string[]) =>
  new NodeClaim({
    apiVersion: "karpenter.sh/v1",
    kind: "NodeClaim",
    metadata: { name: "c", uid: "1", resourceVersion: "1", selfLink: "", labels },
    spec: {
      nodeClassRef: { group: "karpenter.k8s.aws", kind: "EC2NodeClass", name: "default" },
      requirements: values ? [{ key: "node.kubernetes.io/instance-type", operator: "In", values }] : [],
    },
  });

describe("getNodeClaimInstanceType", () => {
  it("reads the label, then a requirement with one value, then counts the values", () => {
    expect(getNodeClaimInstanceType(claim({ "node.kubernetes.io/instance-type": "m5.large" }, ["c5.large"]))).toBe(
      "m5.large",
    );
    expect(getNodeClaimInstanceType(claim({}, ["c5.large"]))).toBe("c5.large");
    expect(getNodeClaimInstanceType(claim({}, ["c5.large", "m5.large"]))).toBe("2 types");
    expect(getNodeClaimInstanceType(claim({}))).toBe("—");
  });
});

describe("formatUsage", () => {
  const gi = (v: number) => `${v.toFixed(1)}Gi`;

  it("shows the usage against the limit", () => {
    expect(formatUsage(47, 256, gi)).toBe("47.0Gi / 256.0Gi");
  });

  it("shows a dash for a NodePool without a limit, not a zero limit (B8)", () => {
    expect(formatUsage(47, undefined, gi)).toBe("47.0Gi / —");
    expect(formatUsage(47, 0, gi)).toBe("47.0Gi / 0.0Gi");
  });
});

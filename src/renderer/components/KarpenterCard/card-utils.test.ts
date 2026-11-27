import { describe, expect, it } from "vitest";
import { NodeClaim } from "../../api/nodeclaim/nodeclaim-v1";
import {
  claimGroupKey,
  formatUsage,
  getNodeClaimArch,
  getNodeClaimInstanceType,
  groupBy,
  nodeGroupKey,
} from "./card-utils";

import type { Node } from "../../utils/kube-helpers";

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

describe("getNodeClaimArch", () => {
  const withArch = (labels: Record<string, string>, values?: string[]) => {
    const c = claim(labels);
    if (values) c.spec.requirements = [{ key: "kubernetes.io/arch", operator: "In", values }];
    return c;
  };

  it("reads the label, then the values of its In requirement", () => {
    expect(getNodeClaimArch(withArch({ "kubernetes.io/arch": "arm64" }, ["amd64"]))).toBe("arm64");
    expect(getNodeClaimArch(withArch({}, ["amd64", "arm64"]))).toBe("amd64, arm64");
    expect(getNodeClaimArch(withArch({}))).toBe("—");
  });
});

describe("formatUsage", () => {
  const gi = (v: number) => `${v.toFixed(1)}Gi`;

  it("shows the usage against the limit", () => {
    expect(formatUsage(47, 256, gi)).toBe("47.0Gi / 256.0Gi");
  });

  it("shows a dash for a NodePool without a limit, not a zero limit", () => {
    expect(formatUsage(47, undefined, gi)).toBe("47.0Gi / —");
    expect(formatUsage(47, 0, gi)).toBe("47.0Gi / 0.0Gi");
  });
});

describe("nodeGroupKey and claimGroupKey", () => {
  const node = {
    metadata: { labels: { "karpenter.sh/capacity-type": "spot", "node.kubernetes.io/instance-type": "m5.large" } },
    status: { conditions: [{ type: "Ready", status: "True" }] },
  } as unknown as Node;

  it("reads the section of a node and of a pending NodeClaim, with `—` for a missing label", () => {
    expect(nodeGroupKey(node, "capacityType")).toBe("spot");
    expect(nodeGroupKey(node, "instanceType")).toBe("m5.large");
    expect(nodeGroupKey(node, "zone")).toBe("—");
    expect(nodeGroupKey(node, "status")).toBe("Ready");
    expect(claimGroupKey(claim({ "topology.kubernetes.io/zone": "eu-west-1a" }), "zone")).toBe("eu-west-1a");
    expect(claimGroupKey(claim({}), "status")).toBe("Claiming");
  });
});

describe("groupBy", () => {
  it("sorts the sections by key, numbers by value and `—` last, keeping the order inside each", () => {
    expect(groupBy(["b1", "—", "a10", "a2", "b2"], (s) => (s === "—" ? s : s.replace(/\d+$/, "")))).toEqual([
      ["a", ["a10", "a2"]],
      ["b", ["b1", "b2"]],
      ["—", ["—"]],
    ]);
    expect(groupBy(["m5.2xlarge", "m5.10xlarge"], (s) => s).map(([k]) => k)).toEqual(["m5.2xlarge", "m5.10xlarge"]);
  });
});

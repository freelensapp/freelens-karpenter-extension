import { describe, expect, it } from "vitest";
import { formatBudget, formatRequirement, formatTaint, notTrueReason, resourceRows } from "./karpenter-v1";

describe("formatRequirement", () => {
  it("writes each operator of karpenter.sh/v1, with minValues", () => {
    expect(
      formatRequirement({ key: "karpenter.sh/capacity-type", operator: "In", values: ["spot", "on-demand"] }),
    ).toBe("karpenter.sh/capacity-type In [spot on-demand]");
    expect(formatRequirement({ key: "kubernetes.io/arch", operator: "NotIn", values: ["arm64"] })).toBe(
      "kubernetes.io/arch NotIn [arm64]",
    );
    expect(formatRequirement({ key: "example.com/ssd", operator: "Exists" })).toBe("example.com/ssd Exists");
    expect(formatRequirement({ key: "example.com/ssd", operator: "DoesNotExist" })).toBe(
      "example.com/ssd DoesNotExist",
    );
    expect(formatRequirement({ key: "karpenter.k8s.aws/instance-cpu", operator: "Gte", values: ["4"] })).toBe(
      "karpenter.k8s.aws/instance-cpu Gte 4",
    );
    expect(
      formatRequirement({
        key: "karpenter.k8s.aws/instance-family",
        operator: "In",
        values: ["c5", "m5"],
        minValues: 2,
      }),
    ).toBe("karpenter.k8s.aws/instance-family In [c5 m5], minValues 2");
  });
});

describe("notTrueReason", () => {
  it("tells why a condition is not True, and nothing when it is", () => {
    const conditions = [
      { type: "Ready", status: "False", reason: "NodeClassNotReady", message: "EC2NodeClass gpu is not ready" },
      { type: "NodeClassReady", status: "False", reason: "NodeClassNotReady", message: "" },
      { type: "ValidationSucceeded", status: "Unknown" },
      { type: "NodeRegistrationHealthy", status: "True", reason: "NodeRegistrationHealthy" },
    ];
    expect(notTrueReason(conditions, "Ready")).toBe("False, NodeClassNotReady: EC2NodeClass gpu is not ready");
    expect(notTrueReason(conditions, "NodeClassReady")).toBe("False, NodeClassNotReady");
    expect(notTrueReason(conditions, "ValidationSucceeded")).toBe("Unknown");
    expect(notTrueReason(conditions, "NodeRegistrationHealthy")).toBeUndefined();
    expect(notTrueReason(conditions, "Missing")).toBeUndefined();
  });
});

describe("formatTaint", () => {
  it("writes a taint as kubectl describe does", () => {
    expect(formatTaint({ key: "nvidia.com/gpu", effect: "NoSchedule" })).toBe("nvidia.com/gpu:NoSchedule");
    expect(formatTaint({ key: "team", value: "ml", effect: "NoExecute" })).toBe("team=ml:NoExecute");
  });
});

describe("resourceRows", () => {
  it("joins the resources in use and the limits, the well-known ones first", () => {
    expect(
      resourceRows(
        { pods: "174", memory: "59687568Ki", cpu: "16", "nvidia.com/gpu": "1" },
        { cpu: 64, memory: "256Gi" },
      ),
    ).toEqual([
      { name: "cpu", inUse: "16", limit: "64" },
      { name: "memory", inUse: "59687568Ki", limit: "256Gi" },
      { name: "pods", inUse: "174", limit: undefined },
      { name: "nvidia.com/gpu", inUse: "1", limit: undefined },
    ]);
    expect(resourceRows(undefined, { cpu: "16" })).toEqual([{ name: "cpu", inUse: undefined, limit: "16" }]);
    expect(resourceRows(undefined, undefined)).toEqual([]);
  });
});

describe("formatBudget", () => {
  it("writes how many nodes, for which reasons and when", () => {
    expect(formatBudget({ nodes: "10%" })).toBe("10% nodes; all reasons");
    expect(
      formatBudget({ nodes: "0", reasons: ["Drifted", "Underutilized"], schedule: "0 9 * * mon-fri", duration: "8h" }),
    ).toBe("0 nodes; Drifted, Underutilized; schedule 0 9 * * mon-fri for 8h");
  });
});

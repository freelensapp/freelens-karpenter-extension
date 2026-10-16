import { describe, expect, it } from "vitest";
import { detectProvider, nodeClassSelfLink } from "./nodeclass";

describe("detectProvider", () => {
  it("reads the provider from the kind or the group of the nodeClassRef", () => {
    expect(detectProvider({ kind: "EC2NodeClass", group: "karpenter.k8s.aws", name: "default" })).toBe("aws");
    expect(detectProvider({ kind: "AKSNodeClass", group: "karpenter.azure.com", name: "default" })).toBe("azure");
    expect(detectProvider({ group: "karpenter.azure.com" })).toBe("azure");
    expect(detectProvider({ group: "karpenter.k8s.aws" })).toBe("aws");
  });

  it("is unknown for another provider when no node class store has items", () => {
    expect(detectProvider({ kind: "KWOKNodeClass", group: "karpenter.kwok.sh", name: "default" })).toBe("unknown");
    expect(detectProvider()).toBe("unknown");
  });
});

describe("nodeClassSelfLink", () => {
  it("uses the newest API version when the cluster serves none", () => {
    expect(nodeClassSelfLink("default", "aws")).toBe("/apis/karpenter.k8s.aws/v1/ec2nodeclasses/default");
    expect(nodeClassSelfLink("default", "azure")).toBe("/apis/karpenter.azure.com/v1beta1/aksnodeclasses/default");
    expect(nodeClassSelfLink("default", "unknown")).toBe("");
  });
});

import { describe, expect, it } from "vitest";
import { EC2NodeClass } from "./ec2nodeclass-v1";

describe("EC2NodeClass (karpenter.k8s.aws/v1)", () => {
  it("has the metadata of its CRD", () => {
    expect(EC2NodeClass.kind).toBe("EC2NodeClass");
    expect(EC2NodeClass.namespaced).toBe(false);
    expect(EC2NodeClass.apiBase).toBe("/apis/karpenter.k8s.aws/v1/ec2nodeclasses");
    expect(EC2NodeClass.crd.apiVersions).toEqual(["karpenter.k8s.aws/v1"]);
    expect(EC2NodeClass.crd.plural).toBe("ec2nodeclasses");
    expect(EC2NodeClass.crd.singular).toBe("ec2nodeclass");
  });

  it("has the title of its sidebar entry and its list page", () => {
    expect(EC2NodeClass.crd.title).toBe("EC2 Node Classes");
  });
});

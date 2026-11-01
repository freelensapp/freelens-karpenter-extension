import { describe, expect, it } from "vitest";
import { AKSNodeClass } from "./aksnodeclass-v1alpha2";

describe("AKSNodeClass (karpenter.azure.com/v1alpha2)", () => {
  it("has the metadata of its CRD", () => {
    expect(AKSNodeClass.kind).toBe("AKSNodeClass");
    expect(AKSNodeClass.namespaced).toBe(false);
    expect(AKSNodeClass.apiBase).toBe("/apis/karpenter.azure.com/v1alpha2/aksnodeclasses");
    expect(AKSNodeClass.crd.apiVersions).toEqual(["karpenter.azure.com/v1alpha2"]);
    expect(AKSNodeClass.crd.plural).toBe("aksnodeclasses");
    expect(AKSNodeClass.crd.singular).toBe("aksnodeclass");
  });

  it("has the same title as v1beta1, for the one page of both versions", () => {
    expect(AKSNodeClass.crd.title).toBe("AKS Node Classes");
  });
});

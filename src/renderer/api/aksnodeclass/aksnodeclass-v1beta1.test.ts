import { describe, expect, it } from "vitest";
import { AKSNodeClass } from "./aksnodeclass-v1beta1";

describe("AKSNodeClass (karpenter.azure.com/v1beta1)", () => {
  it("has the metadata of its CRD", () => {
    expect(AKSNodeClass.kind).toBe("AKSNodeClass");
    expect(AKSNodeClass.namespaced).toBe(false);
    expect(AKSNodeClass.apiBase).toBe("/apis/karpenter.azure.com/v1beta1/aksnodeclasses");
    expect(AKSNodeClass.crd.apiVersions).toEqual(["karpenter.azure.com/v1beta1"]);
    expect(AKSNodeClass.crd.plural).toBe("aksnodeclasses");
    expect(AKSNodeClass.crd.singular).toBe("aksnodeclass");
  });

  it("has the title of its sidebar entry and its list page", () => {
    expect(AKSNodeClass.crd.title).toBe("AKS Node Classes");
  });
});

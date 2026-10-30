import { describe, expect, it } from "vitest";
import { GCENodeClass } from "./gcenodeclass-v1alpha1";

import type { GCENodeClassSpec } from "./gcenodeclass-v1alpha1-types";

const nodeClass = (spec?: GCENodeClassSpec) =>
  new GCENodeClass({
    apiVersion: "karpenter.k8s.gcp/v1alpha1",
    kind: "GCENodeClass",
    metadata: { name: "default", uid: "1", resourceVersion: "1", selfLink: "" },
    spec,
  });

describe("GCENodeClass (karpenter.k8s.gcp/v1alpha1)", () => {
  it("has the metadata of its CRD", () => {
    expect(GCENodeClass.kind).toBe("GCENodeClass");
    expect(GCENodeClass.namespaced).toBe(false);
    expect(GCENodeClass.apiBase).toBe("/apis/karpenter.k8s.gcp/v1alpha1/gcenodeclasses");
    expect(GCENodeClass.crd.apiVersions).toEqual(["karpenter.k8s.gcp/v1alpha1"]);
    expect(GCENodeClass.crd.plural).toBe("gcenodeclasses");
  });

  it("takes the image family from spec.imageFamily first", () => {
    const spec: GCENodeClassSpec = {
      imageFamily: "Ubuntu",
      imageSelectorTerms: [{ alias: "ContainerOptimizedOS@latest" }],
    };
    expect(GCENodeClass.getImageFamily(nodeClass(spec))).toBe("Ubuntu");
  });

  it("takes the image family from an alias term, then from a family term", () => {
    expect(
      GCENodeClass.getImageFamily(
        nodeClass({ imageSelectorTerms: [{ id: "x" }, { alias: "ContainerOptimizedOS@latest" }] }),
      ),
    ).toBe("ContainerOptimizedOS");
    expect(
      GCENodeClass.getImageFamily(nodeClass({ imageSelectorTerms: [{ family: "Ubuntu2404", version: "latest" }] })),
    ).toBe("Ubuntu2404");
  });

  it("is Custom for images selected by id, and unknown without terms", () => {
    expect(GCENodeClass.getImageFamily(nodeClass({ imageSelectorTerms: [{ id: "projects/p/global/images/i" }] }))).toBe(
      "Custom",
    );
    expect(GCENodeClass.getImageFamily(nodeClass({ imageSelectorTerms: [] }))).toBeUndefined();
    expect(GCENodeClass.getImageFamily(nodeClass())).toBeUndefined();
  });
});

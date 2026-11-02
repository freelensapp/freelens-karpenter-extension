import { describe, expect, it } from "vitest";
import { GCENodeClass } from "./gcenodeclass-v1alpha1";

import type { DiskCategory, GCENodeClassSpec, GCENodeClassStatus } from "./gcenodeclass-v1alpha1-types";

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
    expect(GCENodeClass.crd.singular).toBe("gcenodeclass");
  });

  it("has the title of its sidebar entry and its list page", () => {
    expect(GCENodeClass.crd.title).toBe("GCE Node Classes");
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

  it("takes the subnet range names from spec.subnetRangeNames first", () => {
    expect(
      GCENodeClass.getSubnetRangeNames(nodeClass({ imageSelectorTerms: [], subnetRangeNames: ["pods-a", "pods-b"] })),
    ).toEqual(["pods-a", "pods-b"]);
  });

  it("takes the deprecated spec.subnetRangeName as one name, and has none without either", () => {
    expect(GCENodeClass.getSubnetRangeNames(nodeClass({ imageSelectorTerms: [], subnetRangeName: "pods" }))).toEqual([
      "pods",
    ]);
    expect(
      GCENodeClass.getSubnetRangeNames(
        nodeClass({ imageSelectorTerms: [], subnetRangeName: "", subnetRangeNames: [] }),
      ),
    ).toEqual([]);
    expect(GCENodeClass.getSubnetRangeNames(nodeClass())).toEqual([]);
  });

  it("types the fields of v0.7.0", () => {
    const spec: GCENodeClassSpec = {
      imageSelectorTerms: [{ family: "ContainerOptimizedOS", channel: "stable" }],
      subnetRangeNames: ["pods-a"],
      linuxNodeConfig: { hugepages: { hugepageSize2m: 512, hugepageSize1g: 2 } },
      advancedMachineFeatures: { enableNestedVirtualization: true },
      localSsdMode: "Ephemeral",
      preemptionNoticeDuration: "120s",
      kubeletConfiguration: { serializeImagePulls: false, maxParallelImagePulls: 5 },
      disks: [{ category: "pd-ssd", sizeGiB: 100, boot: true }],
    };
    const status: GCENodeClassStatus = { subnetRanges: [{ name: "pods-a", totalFreeIP: 3840 }, { name: "pods-b" }] };
    expect(GCENodeClass.getSubnetRangeNames(nodeClass(spec))).toEqual(["pods-a"]);
    expect(status.subnetRanges?.map((range) => range.totalFreeIP)).toEqual([3840, undefined]);
  });

  it("has the disk categories of v0.7.0, without local-ssd", () => {
    // @ts-expect-error v0.7.0 sets local SSDs with spec.localSsdMode, not as a disk category.
    const localSsd: DiskCategory = "local-ssd";
    expect(localSsd).toBe("local-ssd");
  });
});

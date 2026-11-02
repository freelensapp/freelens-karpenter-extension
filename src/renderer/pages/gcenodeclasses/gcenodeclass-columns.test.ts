import { describe, expect, it } from "vitest";
import { GCENodeClass } from "../../api/gcenodeclass/gcenodeclass-v1alpha1";
import {
  gceNodeClassColumnValues,
  gceNodeClassDiskLabels,
  gceNodeClassImageTerms,
  gceNodeClassSortValues,
  gceNodeClassSubnet,
} from "./gcenodeclass-columns";

import type { GCENodeClassSpec, GCENodeClassStatus } from "../../api/gcenodeclass/gcenodeclass-v1alpha1-types";

const nodeClass = (name: string, status?: GCENodeClassStatus) =>
  new GCENodeClass({
    apiVersion: "karpenter.k8s.gcp/v1alpha1",
    kind: "GCENodeClass",
    metadata: { name, uid: name, resourceVersion: "1", selfLink: "" },
    spec: { imageSelectorTerms: [{ family: "ContainerOptimizedOS", channel: "stable" }] },
    status,
  });

const lastTransitionTime = "2026-10-01T08:00:00Z";

// default of the fixtures of the integration tests, one that found no image, and one not reconciled yet.
const ready = nodeClass("default", {
  conditions: [{ type: "Ready", status: "True", reason: "Ready", message: "", lastTransitionTime }],
});
const notReady = nodeClass("ubuntu", {
  conditions: [
    { type: "Ready", status: "False", reason: "UnhealthyDependents", message: "ImagesReady=False", lastTransitionTime },
  ],
});
const unknown = nodeClass("new", {
  conditions: [{ type: "Ready", status: "Unknown", reason: "AwaitingReconciliation", message: "", lastTransitionTime }],
});
const unreconciled = nodeClass("fresh");

describe("gceNodeClassColumnValues", () => {
  it("has the value of the jsonPath of each column, as kubectl prints it", () => {
    expect(gceNodeClassColumnValues(ready)).toEqual({ ready: "True" });
    expect(gceNodeClassColumnValues(notReady)).toEqual({ ready: "False" });
    expect(gceNodeClassColumnValues(unknown)).toEqual({ ready: "Unknown" });
  });

  it("has no value where a GCENodeClass has none", () => {
    expect(gceNodeClassColumnValues(unreconciled)).toEqual({ ready: undefined });
  });
});

describe("gceNodeClassSortValues", () => {
  it("sorts the status of Ready True, False, Unknown, then none", () => {
    expect([ready, notReady, unknown, unreconciled].map(gceNodeClassSortValues.ready)).toEqual([0, 1, 2, 3]);
  });
});

describe("gceNodeClassImageTerms", () => {
  const withSpec = (spec: Partial<GCENodeClassSpec>) =>
    new GCENodeClass({
      apiVersion: "karpenter.k8s.gcp/v1alpha1",
      kind: "GCENodeClass",
      metadata: { name: "c", uid: "c", resourceVersion: "1", selfLink: "" },
      spec: { imageSelectorTerms: [], ...spec },
    });

  it("has each field of each image selector term as key=value", () => {
    expect(
      gceNodeClassImageTerms(
        withSpec({
          imageSelectorTerms: [{ family: "ContainerOptimizedOS", channel: "stable" }, { id: "projects/lab/images/x" }],
        }),
      ),
    ).toEqual(["family=ContainerOptimizedOS", "channel=stable", "id=projects/lab/images/x"]);
  });

  it("orders the fields of a term as the Go struct, whatever order the API server returns them in", () => {
    expect(
      gceNodeClassImageTerms(withSpec({ imageSelectorTerms: [{ channel: "stable", family: "ContainerOptimizedOS" }] })),
    ).toEqual(["family=ContainerOptimizedOS", "channel=stable"]);
  });

  it("takes the image family alone for a term of that family", () => {
    expect(gceNodeClassImageTerms(withSpec({ imageFamily: "Ubuntu" }))).toEqual(["family=Ubuntu"]);
  });

  it("takes the terms over the image family, and has nothing without either", () => {
    expect(
      gceNodeClassImageTerms(withSpec({ imageFamily: "Ubuntu", imageSelectorTerms: [{ alias: "Ubuntu@latest" }] })),
    ).toEqual(["alias=Ubuntu@latest"]);
    expect(gceNodeClassImageTerms(withSpec({}))).toEqual([]);
  });
});

describe("gceNodeClassDiskLabels", () => {
  const withDisks = (disks: GCENodeClassSpec["disks"]) =>
    new GCENodeClass({
      apiVersion: "karpenter.k8s.gcp/v1alpha1",
      kind: "GCENodeClass",
      metadata: { name: "c", uid: "c", resourceVersion: "1", selfLink: "" },
      spec: { imageSelectorTerms: [], disks },
    });

  it("has each disk as its size and category, the boot disk said so", () => {
    expect(
      gceNodeClassDiskLabels(
        withDisks([
          { category: "pd-balanced", sizeGiB: 100, boot: true },
          { category: "hyperdisk-balanced", sizeGiB: 500, provisionedIOPS: 3000 },
        ]),
      ),
    ).toEqual(["boot 100 GiB pd-balanced", "500 GiB hyperdisk-balanced"]);
  });

  it("has a disk without any of them as a disk, and nothing without disks", () => {
    expect(gceNodeClassDiskLabels(withDisks([{}]))).toEqual(["disk"]);
    expect(gceNodeClassDiskLabels(withDisks(undefined))).toEqual([]);
  });
});

describe("gceNodeClassSubnet", () => {
  const withSubnet = (subnetRangeName?: string) =>
    new GCENodeClass({
      apiVersion: "karpenter.k8s.gcp/v1alpha1",
      kind: "GCENodeClass",
      metadata: { name: "c", uid: "c", resourceVersion: "1", selfLink: "" },
      spec: { imageSelectorTerms: [], subnetRangeName },
    });

  it("has the subnet range name, and none for an empty one", () => {
    expect(gceNodeClassSubnet(withSubnet("pods"))).toBe("pods");
    expect(gceNodeClassSubnet(withSubnet(""))).toBeUndefined();
    expect(gceNodeClassSubnet(withSubnet())).toBeUndefined();
  });
});

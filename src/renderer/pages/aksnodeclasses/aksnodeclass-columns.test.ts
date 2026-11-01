import { describe, expect, it } from "vitest";
import { AKSNodeClass as AKSNodeClassV1alpha2 } from "../../api/aksnodeclass/aksnodeclass-v1alpha2";
import { AKSNodeClass as AKSNodeClassV1beta1 } from "../../api/aksnodeclass/aksnodeclass-v1beta1";
import { aksNodeClassColumnValues, aksNodeClassSortValues } from "./aksnodeclass-columns";

import type { AKSNodeClassSpec, AKSNodeClassStatus } from "../../api/aksnodeclass/aksnodeclass-v1beta1-types";

const lastTransitionTime = "2026-10-01T08:00:00Z";

const v1beta1 = (name: string, spec: AKSNodeClassSpec = {}, status?: AKSNodeClassStatus) =>
  new AKSNodeClassV1beta1({
    apiVersion: "karpenter.azure.com/v1beta1",
    kind: "AKSNodeClass",
    metadata: { name, uid: name, resourceVersion: "1", selfLink: "" },
    spec,
    status,
  });

// default of the fixtures of the integration tests.
const ready = v1beta1(
  "default",
  { imageFamily: "AzureLinux", osDiskSizeGB: 128, maxPods: 50 },
  { conditions: [{ type: "Ready", status: "True", reason: "Ready", message: "", lastTransitionTime }] },
);

// An AKSNodeClass whose image family the provider defaults, not reconciled yet.
const defaulted = v1beta1("defaulted");

// An AKSNodeClass of karpenter.azure.com/v1alpha2, which the Azure provider served until v1.14.2.
const v1alpha2 = new AKSNodeClassV1alpha2({
  apiVersion: "karpenter.azure.com/v1alpha2",
  kind: "AKSNodeClass",
  metadata: { name: "legacy", uid: "legacy", resourceVersion: "1", selfLink: "" },
  spec: { imageFamily: "Ubuntu2204" },
  status: {
    conditions: [{ type: "Ready", status: "False", reason: "ImagesNotReady", message: "no image", lastTransitionTime }],
  },
});

describe("aksNodeClassColumnValues", () => {
  it("has the value of the jsonPath of each column, as kubectl prints it", () => {
    expect(aksNodeClassColumnValues(ready)).toEqual({ ready: "True", imageFamily: "AzureLinux" });
  });

  it("has the same columns in v1alpha2", () => {
    expect(aksNodeClassColumnValues(v1alpha2)).toEqual({ ready: "False", imageFamily: "Ubuntu2204" });
  });

  it("has no value where an AKSNodeClass has none", () => {
    expect(aksNodeClassColumnValues(defaulted)).toEqual({ ready: undefined, imageFamily: undefined });
  });
});

describe("aksNodeClassSortValues", () => {
  it("sorts the status of Ready True, False, Unknown, then none", () => {
    expect([ready, v1alpha2, defaulted].map(aksNodeClassSortValues.ready)).toEqual([0, 1, 3]);
  });

  it("sorts the image family by its name, an AKSNodeClass without one first", () => {
    expect([ready, defaulted].map(aksNodeClassSortValues.imageFamily)).toEqual(["AzureLinux", ""]);
  });
});

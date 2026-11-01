import { describe, expect, it } from "vitest";
import { GCENodeClass } from "../../api/gcenodeclass/gcenodeclass-v1alpha1";
import { gceNodeClassColumnValues, gceNodeClassSortValues } from "./gcenodeclass-columns";

import type { GCENodeClassStatus } from "../../api/gcenodeclass/gcenodeclass-v1alpha1-types";

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

import { describe, expect, it } from "vitest";
import { GCECustomMachineType } from "../../api/gcecustommachinetype/gcecustommachinetype-v1alpha1";
import { gceCustomMachineTypeColumnValues, gceCustomMachineTypeSortValues } from "./gcecustommachinetype-columns";

import type { GCECustomMachineTypeStatus } from "../../api/gcecustommachinetype/gcecustommachinetype-v1alpha1-types";

const machineType = (name: string, shape: string, status?: GCECustomMachineTypeStatus) =>
  new GCECustomMachineType({
    apiVersion: "karpenter.k8s.gcp/v1alpha1",
    kind: "GCECustomMachineType",
    metadata: { name, uid: name, resourceVersion: "1", selfLink: "" },
    spec: { machineType: shape, prices: { onDemand: "0.3891", spot: "0.0934" } },
    status,
  });

const lastTransitionTime = "2026-10-01T08:00:00Z";

// n2-custom-8-24576 of the fixtures of the integration tests, a shape GCE has in none of the cluster's zones, one not
// resolved yet, and one not reconciled yet.
const ready = machineType("n2-custom-8-24576", "n2-custom-8-24576", {
  guestCpus: 8,
  memoryMb: 24576,
  zones: ["us-central1-a"],
  conditions: [{ type: "Ready", status: "True", reason: "Ready", message: "", lastTransitionTime }],
});
const notReady = machineType("e2-custom-4-8192", "e2-custom-4-8192", {
  conditions: [
    {
      type: "Ready",
      status: "False",
      reason: "MachineTypeNotFound",
      message: '"e2-custom-4-8192" is not a valid or available custom machine type in any cluster zone',
      lastTransitionTime,
    },
  ],
});
const unknown = machineType("c3-custom-4-8192", "c3-custom-4-8192", {
  conditions: [{ type: "Ready", status: "Unknown", reason: "AwaitingReconciliation", message: "", lastTransitionTime }],
});
const unreconciled = machineType("a2-custom-4-8192-ext", "a2-custom-4-8192-ext");

describe("gceCustomMachineTypeColumnValues", () => {
  it("has the value of the jsonPath of each column, as kubectl prints it", () => {
    expect(gceCustomMachineTypeColumnValues(ready)).toEqual({ machineType: "n2-custom-8-24576", ready: "True" });
    expect(gceCustomMachineTypeColumnValues(notReady)).toEqual({ machineType: "e2-custom-4-8192", ready: "False" });
    expect(gceCustomMachineTypeColumnValues(unknown)).toEqual({ machineType: "c3-custom-4-8192", ready: "Unknown" });
  });

  it("has no value where a GCECustomMachineType has none", () => {
    expect(gceCustomMachineTypeColumnValues(unreconciled)).toEqual({
      machineType: "a2-custom-4-8192-ext",
      ready: undefined,
    });
    expect(gceCustomMachineTypeColumnValues(machineType("empty", "")).machineType).toBeUndefined();
  });
});

describe("gceCustomMachineTypeSortValues", () => {
  it("sorts the machine type by its name", () => {
    expect([ready, notReady, unreconciled].map(gceCustomMachineTypeSortValues.machineType)).toEqual([
      "n2-custom-8-24576",
      "e2-custom-4-8192",
      "a2-custom-4-8192-ext",
    ]);
  });

  it("sorts the status of Ready True, False, Unknown, then none", () => {
    expect([ready, notReady, unknown, unreconciled].map(gceCustomMachineTypeSortValues.ready)).toEqual([0, 1, 2, 3]);
  });
});

import { describe, expect, it } from "vitest";
import { GCENodeClass } from "../gcenodeclass/gcenodeclass-v1alpha1";
import { GCECustomMachineType } from "./gcecustommachinetype-v1alpha1";

import type { GCECustomMachineTypeStatus } from "./gcecustommachinetype-v1alpha1-types";

const machineType = (status?: GCECustomMachineTypeStatus) =>
  new GCECustomMachineType({
    apiVersion: "karpenter.k8s.gcp/v1alpha1",
    kind: "GCECustomMachineType",
    metadata: { name: "n2-custom-8-24576", uid: "1", resourceVersion: "1", selfLink: "" },
    spec: { machineType: "n2-custom-8-24576", prices: { onDemand: "0.3891", spot: "0.0934" } },
    status,
  });

describe("GCECustomMachineType (karpenter.k8s.gcp/v1alpha1)", () => {
  it("has the metadata of its CRD", () => {
    expect(GCECustomMachineType.kind).toBe("GCECustomMachineType");
    expect(GCECustomMachineType.namespaced).toBe(false);
    expect(GCECustomMachineType.apiBase).toBe("/apis/karpenter.k8s.gcp/v1alpha1/gcecustommachinetypes");
    expect(GCECustomMachineType.crd.apiVersions).toEqual(["karpenter.k8s.gcp/v1alpha1"]);
    expect(GCECustomMachineType.crd.plural).toBe("gcecustommachinetypes");
    expect(GCECustomMachineType.crd.singular).toBe("gcecustommachinetype");
  });

  it("has the title of its sidebar entry and its list page", () => {
    expect(GCECustomMachineType.crd.title).toBe("GCE Custom Machine Types");
  });

  it("is of its own kind, not a GCENodeClass of the same group and version", () => {
    const object = machineType();
    expect(object.kind).toBe("GCECustomMachineType");
    expect(object.apiVersion).toBe("karpenter.k8s.gcp/v1alpha1");
    // @ts-expect-error the kinds differ, so a GCENodeClass is not a GCECustomMachineType.
    const nodeClass: GCECustomMachineType = new GCENodeClass({
      apiVersion: "karpenter.k8s.gcp/v1alpha1",
      kind: "GCENodeClass",
      metadata: { name: "default", uid: "2", resourceVersion: "1", selfLink: "" },
    });
    expect(nodeClass.kind).toBe("GCENodeClass");
  });

  it("has the resolved memory as a quantity of MiB", () => {
    expect(GCECustomMachineType.getMemory(machineType({ guestCpus: 8, memoryMb: 24576 }))).toBe("24576Mi");
  });

  it("has no memory until the provider resolves it", () => {
    expect(GCECustomMachineType.getMemory(machineType({ guestCpus: 8 }))).toBeUndefined();
    expect(GCECustomMachineType.getMemory(machineType())).toBeUndefined();
  });
});

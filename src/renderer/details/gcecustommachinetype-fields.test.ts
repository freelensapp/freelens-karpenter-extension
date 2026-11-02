import { describe, expect, it } from "vitest";
import { GCECustomMachineType } from "../api/gcecustommachinetype/gcecustommachinetype-v1alpha1";
import { formatPrice, guestCpusText, memoryText } from "./gcecustommachinetype-fields";

import type { GCECustomMachineTypeStatus } from "../api/gcecustommachinetype/gcecustommachinetype-v1alpha1-types";

const machineType = (status?: GCECustomMachineTypeStatus) =>
  new GCECustomMachineType({
    apiVersion: "karpenter.k8s.gcp/v1alpha1",
    kind: "GCECustomMachineType",
    metadata: { name: "n2-custom-8-24576", uid: "1", resourceVersion: "1", selfLink: "" },
    spec: { machineType: "n2-custom-8-24576", prices: { onDemand: "0.3891", spot: "0.0934" } },
    status,
  });

describe("formatPrice", () => {
  it("writes an hourly price in USD as written", () => {
    expect(formatPrice("0.3891")).toBe("0.3891 USD per hour");
    expect(formatPrice("1")).toBe("1 USD per hour");
  });

  it("writes nothing without a price", () => {
    expect(formatPrice("")).toBeUndefined();
    expect(formatPrice(undefined)).toBeUndefined();
  });
});

describe("guestCpusText", () => {
  it("writes the resolved vCPUs, and nothing until they are resolved", () => {
    expect(guestCpusText(machineType({ guestCpus: 8 }))).toBe("8");
    expect(guestCpusText(machineType({}))).toBeUndefined();
    expect(guestCpusText(machineType())).toBeUndefined();
  });
});

describe("memoryText", () => {
  it("writes the resolved memory in units, as the host's Node details show it", () => {
    expect(memoryText(machineType({ memoryMb: 24576 }))).toBe("24.0GiB");
    expect(memoryText(machineType({ memoryMb: 8704 }))).toBe("8.5GiB");
  });

  it("writes nothing until the memory is resolved", () => {
    expect(memoryText(machineType({ guestCpus: 8 }))).toBeUndefined();
    expect(memoryText(machineType())).toBeUndefined();
  });
});

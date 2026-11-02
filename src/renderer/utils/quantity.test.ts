import { describe, expect, it } from "vitest";
import { bytesToUnits, quantityToNumber, resourceQuantity } from "./quantity";

describe("quantityToNumber", () => {
  it("reads the binary and the decimal suffixes, and a quantity without one", () => {
    expect(quantityToNumber("16202400Ki")).toBe(16202400 * 1024);
    expect(quantityToNumber("2Gi")).toBe(2 * 1024 ** 3);
    expect(quantityToNumber("1G")).toBe(1e9);
    expect(quantityToNumber("500m")).toBe(0.5);
    expect(quantityToNumber("1.5e3")).toBe(1500);
    expect(quantityToNumber("1024")).toBe(1024);
    expect(quantityToNumber(4096)).toBe(4096);
  });

  it("has no number for a text that is not a quantity", () => {
    expect(quantityToNumber("lots")).toBeUndefined();
    expect(quantityToNumber("1Gib")).toBeUndefined();
  });
});

describe("bytesToUnits", () => {
  it("writes bytes as the host does, with one decimal", () => {
    expect(bytesToUnits(16202400 * 1024)).toBe("15.5GiB");
    expect(bytesToUnits(512 * 1024 ** 2)).toBe("512.0MiB");
    expect(bytesToUnits(100)).toBe("100.0B");
  });

  it("has no units for no bytes", () => {
    expect(bytesToUnits(0)).toBeUndefined();
    expect(bytesToUnits(Number.NaN)).toBeUndefined();
  });
});

describe("resourceQuantity", () => {
  it("shows memory and ephemeral storage in units", () => {
    expect(resourceQuantity("memory", "59687568Ki")).toBe("56.9GiB");
    expect(resourceQuantity("ephemeral-storage", "100G")).toBe("93.1GiB");
  });

  it("shows any other resource as it was written", () => {
    expect(resourceQuantity("cpu", "7920m")).toBe("7920m");
    expect(resourceQuantity("pods", 110)).toBe("110");
  });

  it("shows a quantity it cannot read, or none, as it was written", () => {
    expect(resourceQuantity("memory", "0")).toBe("0");
    expect(resourceQuantity("memory", "lots")).toBe("lots");
    expect(resourceQuantity("memory", undefined)).toBeUndefined();
  });
});

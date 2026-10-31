import { describe, expect, it } from "vitest";
import { columnText, conditionStatus, conditionStatusOrder } from "./printer-columns";

describe("printer columns", () => {
  it("reads the status of the condition of a type", () => {
    const conditions = [
      { type: "Ready", status: "False" },
      { type: "Drifted", status: "True" },
    ];
    expect(conditionStatus(conditions, "Ready")).toBe("False");
    expect(conditionStatus(conditions, "Drifted")).toBe("True");
    expect(conditionStatus(conditions, "Missing")).toBeUndefined();
    expect(conditionStatus(undefined, "Ready")).toBeUndefined();
  });

  it("prints a number as text, and nothing for none", () => {
    expect(columnText(4)).toBe("4");
    expect(columnText(0)).toBe("0");
    expect(columnText("16Gi")).toBe("16Gi");
    expect(columnText(undefined)).toBeUndefined();
  });

  it("orders the statuses of a condition", () => {
    expect(["True", "False", "Unknown", undefined, "Other"].map(conditionStatusOrder)).toEqual([0, 1, 2, 3, 3]);
  });
});

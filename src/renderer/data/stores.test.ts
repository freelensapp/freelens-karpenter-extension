import { describe, expect, it } from "vitest";
import { getServedStore } from "./stores";

const notServed = () => {
  throw new Error("Store is not registered");
};

describe("getServedStore", () => {
  it("returns the store of the first version the cluster serves", () => {
    expect(
      getServedStore(
        notServed,
        () => "v1beta1",
        () => "v1alpha2",
      ),
    ).toBe("v1beta1");
    expect(getServedStore(notServed, () => "v1alpha2")).toBe("v1alpha2");
  });

  it("returns undefined when the cluster serves none", () => {
    expect(getServedStore(notServed, notServed)).toBeUndefined();
  });
});

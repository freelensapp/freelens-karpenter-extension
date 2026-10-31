import { describe, expect, it } from "vitest";
import { NodePool } from "./api/nodepool/nodepool-v1";
import { customResources } from "./custom-resources";

describe("customResources", () => {
  it("lists the kinds with a page of the extension, and no other", () => {
    expect(customResources).toEqual([NodePool]);
  });
});

import { describe, expect, it } from "vitest";
import { EC2NodeClass } from "./api/ec2nodeclass/ec2nodeclass-v1";
import { NodeClaim } from "./api/nodeclaim/nodeclaim-v1";
import { NodeOverlay } from "./api/nodeoverlay/nodeoverlay-v1alpha1";
import { NodePool } from "./api/nodepool/nodepool-v1";
import { customResources } from "./custom-resources";

describe("customResources", () => {
  it("lists the kinds with a page of the extension, and no other", () => {
    expect(customResources).toEqual([NodePool, NodeClaim, NodeOverlay, EC2NodeClass]);
  });
});

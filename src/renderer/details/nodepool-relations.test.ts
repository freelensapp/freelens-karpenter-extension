import { describe, expect, it } from "vitest";
import { NodeClaim } from "../api/nodeclaim/nodeclaim-v1";
import { NodeOverlay } from "../api/nodeoverlay/nodeoverlay-v1alpha1";
import { NodePool } from "../api/nodepool/nodepool-v1";
import { nodeClaimsOfNodePool, overlaysOfNodePool } from "./nodepool-relations";

import type { NodeOverlaySpec } from "../api/nodeoverlay/nodeoverlay-v1alpha1-types";

const general = new NodePool({
  apiVersion: "karpenter.sh/v1",
  kind: "NodePool",
  metadata: { name: "general", uid: "general", resourceVersion: "1", selfLink: "" },
  spec: {
    template: {
      spec: {
        nodeClassRef: { group: "karpenter.k8s.aws", kind: "EC2NodeClass", name: "default" },
        requirements: [{ key: "karpenter.sh/capacity-type", operator: "In", values: ["spot", "on-demand"] }],
      },
    },
  },
});

const nodeClaim = (name: string, nodePool: string) =>
  new NodeClaim({
    apiVersion: "karpenter.sh/v1",
    kind: "NodeClaim",
    metadata: { name, uid: name, resourceVersion: "1", selfLink: "", labels: { "karpenter.sh/nodepool": nodePool } },
  });

const overlay = (name: string, spec: Partial<NodeOverlaySpec>) =>
  new NodeOverlay({
    apiVersion: "karpenter.sh/v1alpha1",
    kind: "NodeOverlay",
    metadata: { name, uid: name, resourceVersion: "1", selfLink: "" },
    spec: { requirements: [], ...spec },
  });

describe("nodeClaimsOfNodePool", () => {
  it("finds the NodeClaims of a NodePool by their label, by name", () => {
    const claims = [nodeClaim("general-b", "general"), nodeClaim("gpu-a", "gpu"), nodeClaim("general-a", "general")];
    expect(nodeClaimsOfNodePool(general, claims).map((claim) => claim.getName())).toEqual(["general-a", "general-b"]);
  });
});

describe("overlaysOfNodePool", () => {
  it("lists the NodeOverlays that can apply, the one that takes precedence first, with their changes", () => {
    const overlays = [
      overlay("spot-discount", {
        requirements: [{ key: "karpenter.sh/capacity-type", operator: "In", values: ["spot"] }],
        priceAdjustment: "-10%",
        weight: 10,
      }),
      overlay("gpu-only", { requirements: [{ key: "karpenter.sh/nodepool", operator: "In", values: ["gpu"] }] }),
      overlay("fpga", { capacity: { "example.com/fpga": 1 }, weight: 50 }),
    ];
    expect(overlaysOfNodePool(general, overlays)).toEqual([
      { name: "fpga", weight: 50, changes: "+1 example.com/fpga" },
      { name: "spot-discount", weight: 10, changes: "price -10%" },
    ]);
  });
});

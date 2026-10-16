import { describe, expect, it } from "vitest";
import { karpenterNodeInfo } from "./node-karpenter";

import type { Node } from "../utils/kube-helpers";

const created = "2026-10-16T08:00:00Z";
const later = Date.parse(created) + 60 * 60_000;

const node = (fields: {
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
  ownerReferences?: { kind: string; name: string }[];
  taints?: { key: string; effect: string }[];
}) =>
  ({
    metadata: {
      name: "ip-10-0-1-11",
      creationTimestamp: created,
      labels: fields.labels,
      annotations: fields.annotations,
      ownerReferences: fields.ownerReferences,
    },
    spec: { taints: fields.taints },
    status: { conditions: [{ type: "Ready", status: "True" }] },
  }) as unknown as Node;

const labels = {
  "karpenter.sh/nodepool": "general",
  "karpenter.sh/capacity-type": "spot",
  "karpenter.sh/registered": "true",
  "karpenter.sh/initialized": "true",
  "node.kubernetes.io/instance-type": "c6i.large",
  "topology.kubernetes.io/zone": "eu-west-1a",
};

describe("karpenterNodeInfo", () => {
  it("reads the NodePool, the NodeClaim of the ownerReference, the type, capacity, zone, status and lifecycle", () => {
    const info = karpenterNodeInfo(
      node({ labels, ownerReferences: [{ kind: "NodeClaim", name: "general-abc12" }] }),
      later,
    );
    expect(info).toEqual({
      nodePool: "general",
      nodeClaim: "general-abc12",
      instanceType: "c6i.large",
      capacityType: "spot",
      zone: "eu-west-1a",
      status: "Ready",
      registered: true,
      initialized: true,
      disrupting: false,
      doNotDisrupt: false,
    });
  });

  it("sees a disruption by either taint, and the do-not-disrupt annotation", () => {
    expect(
      karpenterNodeInfo(node({ labels, taints: [{ key: "karpenter.sh/disrupted", effect: "NoSchedule" }] }), later),
    ).toMatchObject({ disrupting: true });
    expect(
      karpenterNodeInfo(node({ labels, taints: [{ key: "karpenter.sh/disruption", effect: "NoSchedule" }] }), later),
    ).toMatchObject({ disrupting: true });
    expect(
      karpenterNodeInfo(node({ labels, annotations: { "karpenter.sh/do-not-disrupt": "true" } }), later),
    ).toMatchObject({ disrupting: false, doNotDisrupt: true });
  });

  it("is null for a node Karpenter does not manage", () => {
    expect(karpenterNodeInfo(node({ labels: { "node.kubernetes.io/instance-type": "m5.large" } }), later)).toBeNull();
  });
});

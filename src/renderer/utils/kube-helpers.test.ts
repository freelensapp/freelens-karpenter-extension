import { describe, expect, it } from "vitest";
import {
  buildPodCountMap,
  detailUrl,
  formatMemory,
  getConditionStatus,
  getInstanceType,
  getNodeClaimName,
  getNodeCpu,
  getNodeMaxPods,
  getNodeMemory,
  getNodeStatus,
  parseCpuCores,
  parseMemGi,
} from "./kube-helpers";

import type { Renderer } from "@freelensapp/extensions";

import type { Node } from "./kube-helpers";

// The helpers read only the fields of the objects, as the host's objects have them.
const node = (fields: {
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
  deletionTimestamp?: string;
  creationTimestamp?: string;
  ownerReferences?: { kind: string; name: string }[];
  taints?: { key: string; effect: string }[];
  ready?: "True" | "False";
  allocatable?: Record<string, string>;
  capacity?: Record<string, string>;
}) =>
  ({
    metadata: {
      name: "n",
      labels: fields.labels,
      annotations: fields.annotations,
      deletionTimestamp: fields.deletionTimestamp,
      creationTimestamp: fields.creationTimestamp ?? "2026-10-16T08:00:00Z",
      ownerReferences: fields.ownerReferences,
    },
    spec: { taints: fields.taints },
    status: {
      conditions: fields.ready ? [{ type: "Ready", status: fields.ready }] : [],
      allocatable: fields.allocatable,
      capacity: fields.capacity,
    },
  }) as unknown as Node;

const created = Date.parse("2026-10-16T08:00:00Z");
const karpenter = { "karpenter.sh/nodepool": "general" };

describe("getConditionStatus", () => {
  it("maps the condition of the type to Ready, NotReady or Unknown", () => {
    expect(getConditionStatus([{ type: "Ready", status: "True" }], "Ready")).toBe("Ready");
    expect(getConditionStatus([{ type: "Ready", status: "False" }], "Ready")).toBe("NotReady");
    expect(getConditionStatus([{ type: "Ready", status: "Unknown" }], "Ready")).toBe("NotReady");
    expect(getConditionStatus([], "Ready")).toBe("Unknown");
    expect(getConditionStatus(undefined, "Ready")).toBe("Unknown");
  });
});

describe("getNodeStatus", () => {
  it("is Terminating with a deletion timestamp, whatever else", () => {
    expect(getNodeStatus(node({ ready: "True", deletionTimestamp: "2026-10-16T09:00:00Z" }))).toBe("Terminating");
  });

  it("is Ready with condition Ready true", () => {
    expect(getNodeStatus(node({ ready: "True", labels: karpenter }))).toBe("Ready");
  });

  it.each(["karpenter.sh/disrupted", "karpenter.sh/disruption"])(
    "is Terminating for a Karpenter node with the disruption taint %s (B13)",
    (key) => {
      const n = node({ ready: "False", labels: karpenter, taints: [{ key, effect: "NoSchedule" }] });
      expect(getNodeStatus(n, created + 60 * 60_000)).toBe("Terminating");
    },
  );

  it("is Provisioning for a Karpenter node without Ready, with a bootstrap taint, or younger than 5 minutes", () => {
    expect(getNodeStatus(node({ labels: karpenter }), created + 60 * 60_000)).toBe("Provisioning");
    const tainted = node({
      ready: "False",
      labels: karpenter,
      taints: [{ key: "node.kubernetes.io/not-ready", effect: "NoSchedule" }],
    });
    expect(getNodeStatus(tainted, created + 60 * 60_000)).toBe("Provisioning");
    expect(getNodeStatus(node({ ready: "False", labels: karpenter }), created + 60_000)).toBe("Provisioning");
  });

  it("is NotReady for an older Karpenter node that is not ready", () => {
    expect(getNodeStatus(node({ ready: "False", labels: karpenter }), created + 60 * 60_000)).toBe("NotReady");
  });

  it("recognizes a Karpenter node by its NodeClaim label or annotation too", () => {
    const byLabel = node({ ready: "False", labels: { "karpenter.sh/nodeclaim": "c" } });
    const byAnnotation = node({ ready: "False", annotations: { "karpenter.sh/nodeclaim": "c" } });
    expect(getNodeStatus(byLabel, created + 60 * 60_000)).toBe("NotReady");
    expect(getNodeStatus(byAnnotation, created + 60 * 60_000)).toBe("NotReady");
  });

  it("is NotReady or Unknown for another node", () => {
    expect(getNodeStatus(node({ ready: "False" }))).toBe("NotReady");
    expect(getNodeStatus(node({}))).toBe("Unknown");
  });
});

describe("node resources", () => {
  it("prefers allocatable to capacity", () => {
    expect(getNodeCpu(node({ allocatable: { cpu: "3920m" }, capacity: { cpu: "4" } }))).toBe("3920m");
    expect(getNodeCpu(node({ capacity: { cpu: "4" } }))).toBe("4");
    expect(getNodeCpu(node({}))).toBe("—");
    expect(getNodeMaxPods(node({ allocatable: { pods: "58" } }))).toBe(58);
    expect(getNodeMaxPods(node({}))).toBe(0);
  });

  it("formats memory in binary units", () => {
    expect(getNodeMemory(node({ allocatable: { memory: "15896604Ki" } }))).toBe("15.2Gi");
    expect(getNodeMemory(node({ allocatable: { memory: "524288Ki" } }))).toBe("512Mi");
    expect(getNodeMemory(node({ allocatable: { memory: "2048Mi" } }))).toBe("2.0Gi");
    expect(getNodeMemory(node({ allocatable: { memory: "16Gi" } }))).toBe("16.0Gi");
    expect(getNodeMemory(node({ allocatable: { memory: "1Ti" } }))).toBe("1024Gi");
    expect(getNodeMemory(node({ allocatable: { memory: "17179869184" } }))).toBe("16.0Gi");
    expect(getNodeMemory(node({}))).toBe("—");
  });

  it("parses CPU cores and memory in GiB", () => {
    expect(parseCpuCores("3920m")).toBeCloseTo(3.92);
    expect(parseCpuCores("4")).toBe(4);
    expect(parseCpuCores(2)).toBe(2);
    expect(parseCpuCores(undefined)).toBe(0);
    expect(parseMemGi("1048576Ki")).toBe(1);
    expect(parseMemGi("512Mi")).toBe(0.5);
    expect(parseMemGi("2Gi")).toBe(2);
    expect(parseMemGi("1Ti")).toBe(1024);
    expect(parseMemGi("2147483648")).toBe(2);
    expect(parseMemGi("")).toBe(0);
  });
});

describe("node metadata", () => {
  it("finds the NodeClaim of a node by label, annotation or owner", () => {
    expect(getNodeClaimName(node({ labels: { "karpenter.sh/nodeclaim": "a" } }))).toBe("a");
    expect(getNodeClaimName(node({ annotations: { "karpenter.sh/nodeclaim": "b" } }))).toBe("b");
    expect(getNodeClaimName(node({ ownerReferences: [{ kind: "NodeClaim", name: "c" }] }))).toBe("c");
    expect(getNodeClaimName(node({}))).toBe("");
    expect(getNodeClaimName(undefined)).toBe("");
  });

  it("reads the instance type label", () => {
    expect(getInstanceType(node({ labels: { "node.kubernetes.io/instance-type": "m5.xlarge" } }))).toBe("m5.xlarge");
    expect(getInstanceType(node({}))).toBe("—");
  });
});

describe("buildPodCountMap", () => {
  it("counts the pods per node, skipping pods without one", () => {
    const pods = [{ spec: { nodeName: "a" } }, { spec: { nodeName: "a" } }, { spec: { nodeName: "b" } }, { spec: {} }];
    expect(buildPodCountMap(pods as unknown as Renderer.K8sApi.Pod[])).toEqual({ a: 2, b: 1 });
  });
});

describe("detailUrl", () => {
  it("opens the details of the object on the list page", () => {
    expect(detailUrl("/nodes", "/api/v1/nodes/a")).toBe(
      "/nodes?kube-details=%2Fapi%2Fv1%2Fnodes%2Fa&kube-selected=%2Fapi%2Fv1%2Fnodes%2Fa",
    );
  });
});

describe("formatMemory", () => {
  it("shows a quantity in Gi, or in Mi below 1Gi (B7)", () => {
    expect(formatMemory("59687568Ki")).toBe("56.9Gi");
    expect(formatMemory("524288Ki")).toBe("512Mi");
    expect(formatMemory("2048Mi")).toBe("2.0Gi");
    expect(formatMemory("512Mi")).toBe("512Mi");
    expect(formatMemory("8Gi")).toBe("8.0Gi");
    expect(formatMemory("1Ti")).toBe("1024Gi");
    expect(formatMemory("8589934592")).toBe("8.0Gi");
  });

  it("shows a dash without a quantity, and an unknown form as it is", () => {
    expect(formatMemory(undefined)).toBe("—");
    expect(formatMemory("")).toBe("—");
    expect(formatMemory("8G")).toBe("8G");
  });
});

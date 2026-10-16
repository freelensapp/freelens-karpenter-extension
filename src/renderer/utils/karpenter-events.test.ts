import { describe, expect, it } from "vitest";
import {
  buildBuckets,
  eventGroup,
  eventNodePool,
  eventTs,
  eventVisual,
  formatAge,
  isKarpenterEvent,
  isNodeDecisionEvent,
  isPodEvent,
  type KarpenterEvent,
  nodeCountTimeline,
  pickBucketMs,
} from "./karpenter-events";

import type { Node } from "./kube-helpers";

const T0 = Date.parse("2026-10-16T08:00:00Z");
const MIN = 60_000;
const at = (ms: number) => new Date(ms).toISOString();

// The functions read only the fields of the events, as the host's KubeEvent has them.
const event = (fields: {
  reason?: string;
  type?: string;
  kind?: string;
  name?: string;
  namespace?: string;
  message?: string;
  source?: string;
  reportingComponent?: string;
  lastTimestamp?: string;
  eventTime?: string;
  created?: string;
}) =>
  ({
    metadata: { uid: `${fields.kind}/${fields.name}/${fields.reason}`, creationTimestamp: fields.created ?? at(T0) },
    involvedObject: { kind: fields.kind ?? "", name: fields.name ?? "", namespace: fields.namespace },
    reason: fields.reason,
    type: fields.type ?? "Normal",
    message: fields.message,
    source: fields.source ? { component: fields.source } : {},
    reportingComponent: fields.reportingComponent,
    lastTimestamp: fields.lastTimestamp,
    eventTime: fields.eventTime,
  }) as unknown as KarpenterEvent;

const node = (name: string, pool: string, claim?: string) =>
  ({
    metadata: {
      name,
      labels: { "karpenter.sh/nodepool": pool, ...(claim ? { "karpenter.sh/nodeclaim": claim } : {}) },
    },
  }) as unknown as Node;

describe("eventVisual and eventGroup", () => {
  it.each([
    // the node lifecycle of v1.15.0, on a NodeClaim or a node
    ["Launched", "NodeClaim", "Normal", "scale-up"],
    ["Registered", "NodeClaim", "Normal", "scale-up"],
    ["Initialized", "Node", "Normal", "scale-up"],
    ["Ready", "NodeClaim", "Normal", "scale-up"],
    // the same reasons on a NodePool are the status of the pool
    ["Ready", "NodePool", "Normal", "other"],
    ["Launched", "NodePool", "Normal", "other"],
    // scale down and disruption
    ["DisruptionLaunching", "Node", "Normal", "scale-down"],
    ["DisruptionWaitingReadiness", "Node", "Normal", "scale-down"],
    ["DisruptionTerminating", "NodeClaim", "Normal", "scale-down"],
    ["Drained", "NodeClaim", "Normal", "scale-down"],
    ["Finalized", "NodeClaim", "Normal", "scale-down"],
    ["Disrupted", "Node", "Normal", "scale-down"],
    ["Evicted", "Pod", "Normal", "scale-down"],
    // earlier versions
    ["Terminated", "NodeClaim", "Normal", "scale-down"],
    ["Consolidated", "Node", "Normal", "scale-down"],
    ["Provisioned", "Machine", "Normal", "scale-up"],
    ["Drifted", "NodeClaim", "Normal", "drift"],
    // errors
    ["InsufficientCapacityError", "NodeClaim", "Warning", "error"],
    ["FailedScheduling", "Pod", "Warning", "error"],
    ["NoCompatibleInstanceTypes", "NodePool", "Normal", "error"],
    ["NodeClassNotReady", "NodePool", "Warning", "error"],
    ["FailedDraining", "Node", "Warning", "error"],
    ["FailedTermination", "NodeClaim", "Warning", "error"],
    ["FailedConsistencyCheck", "NodeClaim", "Warning", "error"],
    ["UnregisteredTaintMissing", "NodeClaim", "Warning", "error"],
    ["RebootFailed", "Node", "Warning", "error"],
    ["NotLaunched", "Machine", "Warning", "error"],
    // a Warning that no reason classifies
    ["SomethingNew", "NodeClaim", "Warning", "error"],
    // other
    ["Nominated", "Pod", "Normal", "other"],
    ["Unconsolidatable", "Node", "Normal", "other"],
    ["DisruptionBlocked", "NodePool", "Normal", "other"],
    ["ConsolidationCandidate", "Node", "Normal", "other"],
    ["NodeRepairBlocked", "NodePool", "Normal", "other"],
    ["DoNotDisruptUntil", "Node", "Normal", "other"],
    ["ValidationSucceeded", "NodePool", "Normal", "other"],
  ])("%s on a %s (%s) is %s", (reason, kind, type, group) => {
    expect(eventGroup(event({ reason, kind, type }))).toBe(group);
  });

  it("draws a finished removal dimmer than one in progress, and a block as a warning", () => {
    expect(eventVisual(event({ reason: "Finalized", kind: "NodeClaim" })).color).not.toBe(
      eventVisual(event({ reason: "Drained", kind: "NodeClaim" })).color,
    );
    expect(eventVisual(event({ reason: "DisruptionBlocked", kind: "NodePool" })).icon).toBe("⊘");
    expect(eventVisual(event({ reason: "Launched", kind: "NodeClaim" })).icon).toBe("▲");
  });
});

describe("isKarpenterEvent", () => {
  it("takes the source or reporting component, the kind, the namespace or the reason", () => {
    expect(isKarpenterEvent(event({ reason: "X", kind: "Pod", source: "karpenter" }))).toBe(true);
    expect(isKarpenterEvent(event({ reason: "X", kind: "Pod", reportingComponent: "Karpenter" }))).toBe(true);
    expect(isKarpenterEvent(event({ reason: "X", kind: "EC2NodeClass" }))).toBe(true);
    expect(isKarpenterEvent(event({ reason: "X", kind: "AKSNodeClass" }))).toBe(true);
    expect(isKarpenterEvent(event({ reason: "X", kind: "Deployment", namespace: "karpenter" }))).toBe(true);
    expect(isKarpenterEvent(event({ reason: "Nominated", kind: "Pod" }))).toBe(true);
    expect(isKarpenterEvent(event({ reason: "Finalized", kind: "Node" }))).toBe(true);
    // FailedScheduling of the scheduler, as 1.0.1 shows it
    expect(isKarpenterEvent(event({ reason: "FailedScheduling", kind: "Pod", source: "default-scheduler" }))).toBe(
      true,
    );
  });

  it("leaves out the events of other components, the kubelet's Evicted and Ready included", () => {
    expect(isKarpenterEvent(event({ reason: "Pulled", kind: "Pod", source: "kubelet" }))).toBe(false);
    expect(isKarpenterEvent(event({ reason: "Evicted", kind: "Pod", source: "kubelet" }))).toBe(false);
    expect(isKarpenterEvent(event({ reason: "Ready", kind: "Pod", source: "kubelet" }))).toBe(false);
    expect(isKarpenterEvent(event({ reason: "Evicted", kind: "Pod", source: "karpenter" }))).toBe(true);
  });

  it("splits pod events from node decisions", () => {
    expect(isPodEvent(event({ kind: "Pod" }))).toBe(true);
    expect(isNodeDecisionEvent(event({ kind: "NodeClaim" }))).toBe(true);
    expect(isNodeDecisionEvent(event({ kind: "Machine" }))).toBe(true);
    expect(isNodeDecisionEvent(event({ kind: "Node" }))).toBe(true);
    expect(isNodeDecisionEvent(event({ kind: "NodePool" }))).toBe(false);
  });
});

describe("eventTs and formatAge", () => {
  it("takes lastTimestamp, then eventTime, then the creation time", () => {
    expect(eventTs(event({ lastTimestamp: at(T0 + MIN), eventTime: at(T0 + 2 * MIN) }))).toBe(T0 + MIN);
    expect(eventTs(event({ eventTime: at(T0 + 2 * MIN) }))).toBe(T0 + 2 * MIN);
    expect(eventTs(event({}))).toBe(T0);
  });

  it.each([
    [undefined, "—"],
    [at(T0 - 30_000), "<1m"],
    [at(T0 - 5 * MIN), "5m"],
    [at(T0 - 3 * 60 * MIN), "3h"],
    [at(T0 - 2 * 24 * 60 * MIN), "2d"],
  ])("formats %s as %s", (ts, text) => {
    expect(formatAge(ts, T0)).toBe(text);
  });
});

describe("eventNodePool", () => {
  const pools = ["ml", "ml-ms", "general"];

  it("is the pool itself, the longest pool prefixing the object, or the pool in the message", () => {
    expect(eventNodePool(event({ kind: "NodePool", name: "general" }), pools)).toBe("general");
    expect(eventNodePool(event({ kind: "NodeClaim", name: "ml-ms-abc12" }), pools)).toBe("ml-ms");
    expect(eventNodePool(event({ kind: "NodeClaim", name: "ml-abc12" }), pools)).toBe("ml");
    expect(
      eventNodePool(event({ kind: "Pod", name: "web", message: "Pod should schedule on: NodePool=gpu" }), pools),
    ).toBe("gpu");
    expect(eventNodePool(event({ kind: "Pod", name: "web", message: "no pool" }), pools)).toBe("");
  });
});

describe("pickBucketMs", () => {
  it("makes about 45 buckets over the range, at least 5m for fewer than 10 events", () => {
    expect(pickBucketMs(60 * MIN, 100)).toBe(MIN);
    expect(pickBucketMs(6 * 60 * MIN, 100)).toBe(5 * MIN);
    expect(pickBucketMs(24 * 60 * MIN, 100)).toBe(30 * MIN);
    expect(pickBucketMs(60 * MIN, 3)).toBe(5 * MIN);
    expect(pickBucketMs(MIN, 100)).toBe(30_000);
    expect(pickBucketMs(1000 * 24 * 60 * MIN, 100)).toBe(24 * 60 * MIN);
  });
});

describe("buildBuckets", () => {
  it("counts the events of each bucket by group, keeps the empty buckets and drops the events out of range", () => {
    const events = [
      event({ reason: "Launched", kind: "NodeClaim", lastTimestamp: at(T0 + 1 * MIN) }),
      event({ reason: "Launched", kind: "NodeClaim", lastTimestamp: at(T0 + 4 * MIN) }),
      event({ reason: "Drifted", kind: "NodeClaim", lastTimestamp: at(T0 + 4 * MIN + 59_000) }),
      event({ reason: "Finalized", kind: "NodeClaim", lastTimestamp: at(T0 + 12 * MIN) }),
      event({ reason: "Launched", kind: "NodeClaim", lastTimestamp: at(T0 - MIN) }),
      event({ reason: "Launched", kind: "NodeClaim", lastTimestamp: at(T0 + 16 * MIN) }),
    ];
    const points = buildBuckets(events, T0, T0 + 15 * MIN, 5 * MIN, eventGroup);
    expect(points).toEqual([
      { t: T0, counts: { "scale-up": 2, drift: 1 } },
      { t: T0 + 5 * MIN, counts: {} },
      { t: T0 + 10 * MIN, counts: { "scale-down": 1 } },
      { t: T0 + 15 * MIN, counts: {} },
    ]);
  });

  it("aligns the buckets to their size", () => {
    const points = buildBuckets([], T0 + 2 * MIN, T0 + 7 * MIN, 5 * MIN, eventGroup);
    expect(points.map((p) => p.t)).toEqual([T0, T0 + 5 * MIN, T0 + 10 * MIN]);
  });
});

describe("nodeCountTimeline", () => {
  const claimEvent = (reason: string, name: string, minute: number) =>
    event({ reason, kind: "NodeClaim", name, lastTimestamp: at(T0 + minute * MIN) });
  const timeline = (nodes: Node[], events: KarpenterEvent[], pools = ["general"]) =>
    nodeCountTimeline({
      pools,
      nodes,
      claimOfNode: (n) => n.metadata.labels?.["karpenter.sh/nodeclaim"] ?? "",
      events,
      poolOfEvent: (e) => eventNodePool(e, pools),
      startMs: T0,
      endMs: T0 + 30 * MIN,
      bucketMs: 5 * MIN,
    });
  const counts = (points: { counts: Record<string, number> }[]) => points.map((p) => p.counts.nodes);

  it("counts the nodes that predate the window throughout", () => {
    const result = timeline([node("a", "general", "general-a"), node("b", "general", "general-b")], []);
    expect(counts(result.general!)).toEqual([2, 2, 2, 2, 2, 2, 2]);
  });

  it("adds a node at its launch and removes it at Finalized (B11), anchored at the live count", () => {
    const result = timeline(
      [node("a", "general", "general-a"), node("c", "general", "general-c")],
      [
        claimEvent("Launched", "general-b", 6),
        claimEvent("Finalized", "general-b", 16),
        claimEvent("Launched", "general-c", 21),
        claimEvent("Registered", "general-c", 22),
      ],
    );
    // a throughout; b from 6 to 16; c from 21
    expect(counts(result.general!)).toEqual([1, 1, 2, 2, 1, 2, 2]);
  });

  it("removes a node at Terminated too, once per NodeClaim, and ignores node events", () => {
    const result = timeline(
      [],
      [
        claimEvent("Launched", "general-b", 1),
        claimEvent("Finalized", "general-b", 11),
        claimEvent("Terminated", "general-b", 12),
        event({ reason: "Launched", kind: "Node", name: "general-b", lastTimestamp: at(T0 + MIN) }),
      ],
    );
    expect(counts(result.general!)).toEqual([0, 1, 1, 0, 0, 0, 0]);
  });

  it("keeps the pools apart and ends at the live count of each", () => {
    const result = timeline(
      [node("x", "gpu", "gpu-x")],
      [claimEvent("Launched", "gpu-x", 3), claimEvent("Launched", "general-y", 3)],
      ["general", "gpu"],
    );
    expect(counts(result.gpu!)).toEqual([0, 1, 1, 1, 1, 1, 1]);
    // general-y has no node: the history is clamped, and the last point is the live count
    expect(result.general!.at(-1)!.counts.nodes).toBe(0);
  });
});

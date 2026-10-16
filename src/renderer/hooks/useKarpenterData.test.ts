import { describe, expect, it } from "vitest";
import { filterPoolEvents, fmtAgo } from "./useKarpenterData";

import type { KarpenterEvent } from "../utils/karpenter-events";

const event = (uid: string, kind: string, name: string, lastTimestamp?: string) =>
  ({
    metadata: { uid, creationTimestamp: "2026-10-16T07:00:00Z" },
    involvedObject: { kind, name },
    lastTimestamp,
  }) as unknown as KarpenterEvent;

describe("filterPoolEvents", () => {
  const events = [
    event("1", "NodePool", "general"),
    event("2", "NodePool", "gpu"),
    event("3", "NodeClaim", "general-abc12"),
    event("4", "NodeClaim", "claim-of-the-set"),
    event("5", "Machine", "general-old"),
    event("6", "Node", "ip-10-0-1-11"),
    event("7", "Node", "ip-10-0-9-99"),
    event("8", "Pod", "web-1"),
    event("3", "NodeClaim", "general-abc12"),
  ];

  it("keeps the events of the pool, its NodeClaims and Machines by name or prefix, and its nodes, once each", () => {
    const kept = filterPoolEvents(events, "general", new Set(["ip-10-0-1-11"]), new Set(["claim-of-the-set"]));
    expect(kept.map((e) => e.metadata.uid)).toEqual(["1", "3", "4", "5", "6"]);
  });
});

describe("fmtAgo", () => {
  const now = Date.parse("2026-10-16T10:00:00Z");

  it.each([
    [now - 30_000, "<1m ago"],
    [now - 5 * 60_000, "5m ago"],
    [now - 3 * 3_600_000, "3h ago"],
    [now - 2 * 86_400_000, "2d ago"],
  ])("formats %i", (ts, text) => {
    expect(fmtAgo(ts, now)).toBe(text);
  });
});

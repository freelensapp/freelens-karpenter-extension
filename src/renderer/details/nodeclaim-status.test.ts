import { describe, expect, it } from "vitest";
import { capacityRows, formatResources, stageNotReached, trueReason } from "./nodeclaim-status";

import type { Condition } from "../api/types";

const condition = (type: string, status: string, reason = "", message = ""): Condition => ({
  type,
  status,
  reason,
  message,
  lastTransitionTime: "2026-10-01T08:00:00Z",
});

describe("stageNotReached", () => {
  it("is the first stage whose condition is not True, with why", () => {
    expect(stageNotReached([condition("Launched", "Unknown", "NotLaunched", "Waiting for an instance")])).toEqual({
      stage: "Launched",
      why: "Unknown, NotLaunched: Waiting for an instance",
    });
    expect(
      stageNotReached([
        condition("Initialized", "Unknown", "NotInitialized", "Node not ready"),
        condition("Launched", "True", "Launched"),
        condition("Registered", "False", "NotRegistered"),
      ]),
    ).toEqual({ stage: "Registered", why: "False, NotRegistered" });
  });

  it("is nothing when every stage with a condition is reached", () => {
    expect(
      stageNotReached([
        condition("Launched", "True"),
        condition("Registered", "True"),
        condition("Initialized", "True"),
        condition("Ready", "False"),
      ]),
    ).toBeUndefined();
    expect(stageNotReached([])).toBeUndefined();
    expect(stageNotReached(undefined)).toBeUndefined();
  });
});

describe("trueReason", () => {
  it("is the reason and the message of a True condition, or True alone", () => {
    expect(trueReason([condition("Drifted", "True", "AMIDrift", "the AMI changed")], "Drifted")).toBe(
      "AMIDrift: the AMI changed",
    );
    expect(trueReason([condition("Drifted", "True")], "Drifted")).toBe("True");
  });

  it("is nothing for a condition that is not True or missing", () => {
    expect(trueReason([condition("Drifted", "False", "NotDrifted")], "Drifted")).toBeUndefined();
    expect(trueReason([], "Drifted")).toBeUndefined();
  });
});

describe("capacityRows", () => {
  it("joins the capacity and the allocatable, the well-known resources first", () => {
    expect(
      capacityRows(
        { "ephemeral-storage": "20Gi", pods: "58", memory: "32118888Ki", cpu: "8" },
        { cpu: "7920m", memory: "28906999Ki", pods: 58 },
      ),
    ).toEqual([
      { name: "cpu", capacity: "8", allocatable: "7920m" },
      { name: "memory", capacity: "30.6GiB", allocatable: "27.6GiB", written: "32118888Ki / 28906999Ki" },
      { name: "pods", capacity: "58", allocatable: "58" },
      { name: "ephemeral-storage", capacity: "20.0GiB", allocatable: undefined, written: "20Gi / -" },
    ]);
    expect(capacityRows(undefined, undefined)).toEqual([]);
  });
});

describe("formatResources", () => {
  it("writes each resource with its quantity, memory in units, the well-known ones first", () => {
    expect(formatResources({ "nvidia.com/gpu": 1, memory: "1Gi", cpu: "500m" })).toEqual([
      "cpu 500m",
      "memory 1.0GiB",
      "nvidia.com/gpu 1",
    ]);
    expect(formatResources(undefined)).toEqual([]);
  });
});

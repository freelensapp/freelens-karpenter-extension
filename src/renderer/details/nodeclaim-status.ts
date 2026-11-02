// What the details of a NodeClaim compute from its spec and its status.

import { notTrueReason, resourceNames, resourceText, withWritten, writtenPair } from "./karpenter-v1";

import type { Condition, ResourceList } from "../api/types";

/** The stages of a NodeClaim before it is Ready, in their order, by the conditions that mark them. */
const lifecycle = ["Launched", "Registered", "Initialized"] as const;

export type LifecycleStage = (typeof lifecycle)[number];

export interface StageNotReached {
  stage: LifecycleStage;
  /** Its status, reason and message, as `notTrueReason` writes them. */
  why: string;
}

/**
 * The first stage a NodeClaim has not reached: the first of Launched, Registered and Initialized whose condition is
 * there and not `True`, with why. A NodeClaim that has no node yet shows here why, also when its launch failed;
 * `undefined` when every stage that has a condition is reached.
 */
export function stageNotReached(conditions: Condition[] | undefined): StageNotReached | undefined {
  for (const stage of lifecycle) {
    const why = notTrueReason(conditions, stage);
    if (why !== undefined) return { stage, why };
  }
  return undefined;
}

/**
 * Why a condition is `True`, its reason and its message, or `True` alone without them; `undefined` when it is not
 * `True` or missing. For the conditions that are news when they are `True`, such as Drifted.
 */
export function trueReason(conditions: Condition[] | undefined, type: string): string | undefined {
  const condition = conditions?.find((c) => c.type === type);
  if (condition?.status !== "True") return undefined;
  return [condition.reason, condition.message].filter(Boolean).join(": ") || "True";
}

export interface CapacityRow {
  name: string;
  /** What the node of the NodeClaim has of the resource, `status.capacity`. */
  capacity: string | undefined;
  /** What of it pods can request, `status.allocatable`. */
  allocatable: string | undefined;
  /** Both as they were written, when the row shows them in units. */
  written?: string;
}

/** The resources of a NodeClaim's node: its capacity and what is allocatable, one row each, the well-known first. */
export function capacityRows(capacity: ResourceList | undefined, allocatable: ResourceList | undefined): CapacityRow[] {
  return resourceNames(capacity, allocatable).map((name) => ({
    name,
    capacity: resourceText(capacity, name),
    allocatable: resourceText(allocatable, name),
    ...withWritten(writtenPair(name, capacity, allocatable)),
  }));
}

/** A resource list as texts, `cpu 500m`, the well-known resources first. */
export function formatResources(resources: ResourceList | undefined): string[] {
  return resourceNames(resources).map((name) => `${name} ${resourceText(resources, name)}`);
}

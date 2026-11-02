// What the details of the kinds of karpenter.sh/v1 show of their fields, as text: the requirements, taints and
// resource lists that NodePools and NodeClaims share, and the budgets of a NodePool.

import { resourceQuantity } from "../utils/quantity";

import type { Budget, NodeSelectorRequirementWithMinValues } from "../api/karpenter/karpenter-v1-types";
import type { Condition, ResourceList, Taint } from "../api/types";

/** A requirement as `kubectl describe` writes a node selector: `key In [a b]`, `key Exists`, `key Gt 5`. */
export function formatRequirement(requirement: NodeSelectorRequirementWithMinValues): string {
  const { key, operator, values = [], minValues } = requirement;
  let text: string;
  switch (operator) {
    case "In":
    case "NotIn":
      text = `${key} ${operator} [${values.join(" ")}]`;
      break;
    case "Exists":
    case "DoesNotExist":
      text = `${key} ${operator}`;
      break;
    default:
      text = `${key} ${operator} ${values[0] ?? ""}`.trimEnd();
  }
  return minValues === undefined ? text : `${text}, minValues ${minValues}`;
}

/** A taint as `kubectl describe node` writes it: `key=value:Effect`, or `key:Effect` without a value. */
export function formatTaint(taint: Taint): string {
  return `${taint.key}${taint.value ? `=${taint.value}` : ""}:${taint.effect}`;
}

/** The well-known resources first, in this order, then the others by name. */
const resourceOrder = ["cpu", "memory", "pods", "nodes", "ephemeral-storage"];

function byResource(a: string, b: string): number {
  const ia = resourceOrder.indexOf(a);
  const ib = resourceOrder.indexOf(b);
  if (ia !== ib) return (ia === -1 ? Infinity : ia) - (ib === -1 ? Infinity : ib);
  return a.localeCompare(b);
}

/** The names of the resources of the lists, each once, the well-known ones first. */
export function resourceNames(...lists: (ResourceList | undefined)[]): string[] {
  return [...new Set(lists.flatMap((list) => Object.keys(list ?? {})))].sort(byResource);
}

/**
 * A quantity of a resource list as text, as the host's Node details show it: memory and ephemeral storage in units
 * (`resourceQuantity`), the others as they were written; `undefined` without one.
 */
export function resourceText(list: ResourceList | undefined, name: string): string | undefined {
  return resourceQuantity(name, list?.[name]);
}

/**
 * The quantities of a resource in two lists as they were written, `first / second`, for the tooltip of a row that shows
 * them in units; `undefined` when it shows them as written. `none` stands for a quantity the second list lacks.
 */
export function writtenPair(
  name: string,
  first: ResourceList | undefined,
  second: ResourceList | undefined,
  none = "-",
): string | undefined {
  const written = (list: ResourceList | undefined) => (list?.[name] === undefined ? undefined : String(list[name]));
  if (resourceText(first, name) === written(first) && resourceText(second, name) === written(second)) return undefined;
  return `${written(first) ?? "-"} / ${written(second) ?? none}`;
}

/** The `written` field of a row, only when it has one. */
export function withWritten(written: string | undefined): { written?: string } {
  return written === undefined ? {} : { written };
}

export interface ResourceRow {
  name: string;
  /** What the NodePool's nodes have of the resource, `status.resources`. */
  inUse: string | undefined;
  /** The NodePool's limit of the resource, `spec.limits`. */
  limit: string | undefined;
  /** Both as they were written, when the row shows them in units. */
  written?: string;
}

/** The resources of a NodePool: those in use and those it limits, one row each, the well-known ones first. */
export function resourceRows(inUse: ResourceList | undefined, limits: ResourceList | undefined): ResourceRow[] {
  return resourceNames(inUse, limits).map((name) => ({
    name,
    inUse: resourceText(inUse, name),
    limit: resourceText(limits, name),
    ...withWritten(writtenPair(name, inUse, limits, "no limit")),
  }));
}

/**
 * Why a condition is not `True`: its reason and its message, or its status alone without them; `undefined` when it
 * is `True` or missing. The host shows the conditions as badges, with the reason in their tooltips only.
 */
export function notTrueReason(conditions: Condition[] | undefined, type: string): string | undefined {
  const condition = conditions?.find((c) => c.type === type);
  if (!condition || condition.status === "True") return undefined;
  const why = [condition.reason, condition.message].filter(Boolean).join(": ");
  return why ? `${condition.status}, ${why}` : condition.status;
}

/**
 * A disruption budget in words: how many nodes, for which reasons (all without any), and when (always without a
 * schedule).
 */
export function formatBudget(budget: Budget): string {
  const parts = [`${budget.nodes} nodes`, budget.reasons?.length ? budget.reasons.join(", ") : "all reasons"];
  if (budget.schedule) parts.push(`schedule ${budget.schedule}${budget.duration ? ` for ${budget.duration}` : ""}`);
  return parts.join("; ");
}

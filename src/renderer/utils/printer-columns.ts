// The values of the `additionalPrinterColumns` of the Karpenter CRDs that the kinds share, as `kubectl get` prints
// them: the value of the column's `jsonPath`, or `undefined` where the object has none.

import type { Condition, Quantity } from "../api/types";

/** `.status.conditions[?(@.type=="<type>")].status`: `True`, `False` or `Unknown`. */
export function conditionStatus(
  conditions: Pick<Condition, "type" | "status">[] | undefined,
  type: string,
): string | undefined {
  return conditions?.find((condition) => condition.type === type)?.status;
}

/** A number or a quantity, which the API server returns as it was written, as text. */
export function columnText(value: Quantity | undefined): string | undefined {
  return value === undefined ? undefined : String(value);
}

/** The order of the statuses of a condition: `True` first, then `False`, `Unknown`, and none last. */
export function conditionStatusOrder(status: string | undefined): number {
  switch (status) {
    case "True":
      return 0;
    case "False":
      return 1;
    case "Unknown":
      return 2;
    default:
      return 3;
  }
}

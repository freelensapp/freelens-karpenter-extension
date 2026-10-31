import { CONDITION_STATUS_COLOR } from "../../config/theme";

/** The `status` of a condition (`True`, `False`, `Unknown`) as it is, in the colour of the status; nothing without one. */
export function ConditionStatus({ status }: { status: string | undefined }) {
  if (status === undefined) return null;
  return <span style={{ color: CONDITION_STATUS_COLOR[status] }}>{status}</span>;
}

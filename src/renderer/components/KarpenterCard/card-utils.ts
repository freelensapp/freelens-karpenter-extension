import type { NodeClaim } from "../../api/nodeclaim/nodeclaim-v1";

/** Best-effort instance type of a NodeClaim that has no node yet: its label, else a single-value requirement. */
export function getNodeClaimInstanceType(claim: NodeClaim): string {
  const labelType = claim.metadata.labels?.["node.kubernetes.io/instance-type"];
  if (labelType) return labelType;
  const req = claim.spec?.requirements?.find((r) => r.key === "node.kubernetes.io/instance-type");
  const values = req?.values ?? [];
  if (values.length === 1) return values[0];
  if (values.length > 1) return `${values.length} types`;
  return "—";
}

/** `used / limit`, with `—` for a NodePool that sets no limit for the resource. */
export function formatUsage(used: number, limit: number | undefined, unitFmt: (v: number) => string): string {
  return `${unitFmt(used)} / ${limit === undefined ? "—" : unitFmt(limit)}`;
}

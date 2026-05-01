/**
 * StatusBadge.tsx — shared status indicator.
 * All visual configuration comes from theme.ts — do not add colors here.
 */

import { STATUS_VISUAL } from "../../config/theme";

import type { CondStatus } from "../../utils/kube-helpers";

interface StatusBadgeProps {
  status: CondStatus;
  /** compact = dot + label inline, no pill border */
  compact?: boolean;
}

export function StatusBadge({ status, compact = false }: StatusBadgeProps) {
  const v = STATUS_VISUAL[status] ?? STATUS_VISUAL["Unknown"];

  if (compact) {
    return (
      <span style={{ color: v.color, fontSize: 12, fontWeight: 500, whiteSpace: "nowrap" }}>
        {v.dot} {v.label}
      </span>
    );
  }

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        color: v.color,
        background: v.bg,
        border: `1px solid ${v.border}`,
        borderRadius: 10,
        padding: "2px 7px",
        fontSize: 11,
        fontWeight: 500,
        whiteSpace: "nowrap",
      }}
    >
      {v.dot} {v.label}
    </span>
  );
}

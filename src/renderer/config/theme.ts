/**
 * theme.ts — Single source of truth for all visual configuration.
 *
 * Colors, icons, labels, and status mappings live here.
 * To restyle the extension, only this file needs to change.
 */

import type { CondStatus } from "../utils/kube-helpers";

// ── Semantic colors ───────────────────────────────────────────────────────────

export const COLOR = {
  /** Karpenter brand / info blue */
  info: "#00a7e1",
  infoSoft: "#6ab0d4",
  infoMuted: "rgba(100, 160, 210, 0.12)",
  infoBorder: "rgba(100, 160, 210, 0.25)",

  /** Success / Ready */
  success: "#48c78e",
  successBg: "rgba(72, 199, 142, 0.15)",
  successBorder: "rgba(72, 199, 142, 0.3)",

  /** Warning / Provisioning */
  warning: "#ffc107",
  warningDim: "#e6ac00",
  warningBg: "rgba(255, 193, 7, 0.15)",
  warningBorder: "rgba(255, 193, 7, 0.3)",

  /** Danger / NotReady */
  danger: "#f14668",
  dangerBg: "rgba(241, 70, 104, 0.15)",
  dangerBorder: "rgba(241, 70, 104, 0.3)",

  /** Destructive / Terminating */
  terminating: "#ff7043",
  terminatingBg: "rgba(255, 112, 67, 0.15)",
  terminatingBorder: "rgba(255, 112, 67, 0.3)",

  /** NodeClaim accent */
  nodeclaim: "#6c63ff",

  /** Claiming (NodeClaim launched but no Node yet) — celeste / light blue */
  claiming: "#5ad1fc",
  claimingDim: "#3fb8e6",
  claimingBg: "rgba(90, 209, 252, 0.15)",
  claimingBorder: "rgba(90, 209, 252, 0.35)",

  /** CPU bar */
  cpu: "#26a822",

  /** Memory bar */
  memory: "#a8228f",

  /** Neutral grays — prefer CSS vars at runtime, these are fallbacks */
  border: "#2d2d2d",
  borderFaint: "#1e1e1e",
  textPrimary: "#e8e8e8",
  textSecondary: "#888",
  textTertiary: "#666",
  bg: "#13161b",
  bgHeader: "#1a1d22",
} as const;

// ── Status config ─────────────────────────────────────────────────────────────

export interface StatusVisual {
  color: string;
  bg: string;
  border: string;
  label: string;
  dot: string;
}

export const STATUS_VISUAL: Record<CondStatus, StatusVisual> = {
  Ready: {
    color: COLOR.success,
    bg: COLOR.successBg,
    border: COLOR.successBorder,
    label: "Ready",
    dot: "●",
  },
  NotReady: {
    color: COLOR.danger,
    bg: COLOR.dangerBg,
    border: COLOR.dangerBorder,
    label: "Not Ready",
    dot: "●",
  },
  Provisioning: {
    color: COLOR.warningDim,
    bg: COLOR.warningBg,
    border: COLOR.warningBorder,
    label: "Provisioning",
    dot: "◌",
  },
  Claiming: {
    color: COLOR.claimingDim,
    bg: COLOR.claimingBg,
    border: COLOR.claimingBorder,
    label: "Claiming",
    dot: "◌",
  },
  Terminating: {
    color: COLOR.terminating,
    bg: COLOR.terminatingBg,
    border: COLOR.terminatingBorder,
    label: "Terminating",
    dot: "◎",
  },
  Unknown: {
    color: COLOR.textSecondary,
    bg: "rgba(150,150,150,0.1)",
    border: "rgba(150,150,150,0.2)",
    label: "Unknown",
    dot: "○",
  },
};

/** Left-border color for a card keyed by status */
export const STATUS_BORDER_COLOR: Record<CondStatus, string> = {
  Ready: COLOR.success,
  NotReady: COLOR.danger,
  Provisioning: COLOR.warning,
  Claiming: COLOR.claiming,
  Terminating: COLOR.terminating,
  Unknown: "#555",
};

// ── Event reasons ─────────────────────────────────────────────────────────────

export interface EventReasonVisual {
  color: string;
  icon: string;
  /** Semantic group for grouping / filtering */
  group: "scale-up" | "scale-down" | "drift" | "error" | "other";
}

export const EVENT_REASON_CONFIG: Record<string, EventReasonVisual> = {
  // scale-up
  Launched: { color: COLOR.success, icon: "▲", group: "scale-up" },
  Provisioned: { color: COLOR.success, icon: "▲", group: "scale-up" },
  Registered: { color: COLOR.success, icon: "▲", group: "scale-up" },
  Initialized: { color: COLOR.success, icon: "▲", group: "scale-up" },
  ScaledUp: { color: COLOR.success, icon: "▲", group: "scale-up" },
  // scale-down / disruption
  Disrupted: { color: COLOR.terminating, icon: "▼", group: "scale-down" },
  Disrupting: { color: COLOR.terminating, icon: "▼", group: "scale-down" },
  Consolidated: { color: COLOR.terminating, icon: "▼", group: "scale-down" },
  Terminating: { color: COLOR.terminating, icon: "▼", group: "scale-down" },
  Terminated: { color: COLOR.textSecondary, icon: "▼", group: "scale-down" },
  ScaledDown: { color: COLOR.terminating, icon: "▼", group: "scale-down" },
  // drift
  Drifted: { color: COLOR.warning, icon: "~", group: "drift" },
  // errors
  NotLaunched: { color: COLOR.danger, icon: "✕", group: "error" },
  NotRegistered: { color: COLOR.danger, icon: "✕", group: "error" },
  NotInitialized: { color: COLOR.danger, icon: "✕", group: "error" },
  InsufficientCapacity: { color: COLOR.danger, icon: "✕", group: "error" },
  DisruptionBlocked: { color: COLOR.warning, icon: "⊘", group: "other" },
};

export const EVENT_REASON_FALLBACK: EventReasonVisual = {
  color: COLOR.textSecondary,
  icon: "•",
  group: "other",
};

// ── Icons (text/emoji — easy to swap to SVG keys later) ──────────────────────

export const ICON = {
  node: "🖥",
  nodeclaim: "🔖",
  nodepool: "🌊",
  nodeclass: "⚙️",
  pod: "🐳",
  cpu: "⚡",
  memory: "🧠",
  arrow: "→",
  external: "↗",
  warning: "⚠️",
  events: "📋",
} as const;

// ── Text labels ───────────────────────────────────────────────────────────────

export const LABEL = {
  eventsBtn: "Events",
  tableBtn: "☰ Table",
  cardsBtn: "⊞ Cards",
  noNodes: "No nodes running",
  loadingNodes: "Loading…",
  expireAfter: "Expire after:",
} as const;

// ── Timing ────────────────────────────────────────────────────────────────────

export const TIMING = {
  /** Event fetch TTL in milliseconds — avoid hammering the API */
  eventFetchTtl: 30_000,
  /** Max events shown per pool timeline */
  maxTimelineEvents: 60,
  /** Max events shown in the debug table */
  maxDebugEvents: 25,
  /** Skeleton animation pulse duration */
  skeletonPulse: "1.4s",
} as const;

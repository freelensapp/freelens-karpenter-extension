/**
 * TreemapView.tsx
 *
 * Squarified treemap of the cluster with a Karpenter-inspired visual language:
 *
 *  - Each NodePool (or other group) is a soft "card" with a subtle accent
 *    stripe in the group color and a header ribbon.
 *  - Each node is rendered as a CPU "chip": dark navy body, optional decorative
 *    pins on the four sides (orange for on-demand, grey for spot), small status
 *    dot in the top-right corner, and inline pod-count micro-dots in the
 *    bottom-right corner.
 *
 * Status is intentionally NOT used as the chip body fill — that produced an
 * overwhelming wall of color. Instead it is a small dot.
 */

import { observer } from "mobx-react";
import React, { useLayoutEffect, useMemo, useRef, useState } from "react";
import { type Node } from "../../k8s/core/node-store";
import {
  getInstanceType,
  getNodeCpu,
  getNodeMaxPods,
  getNodeMemory,
  getNodeStatus,
  openNodeDetail,
} from "../../utils/kube-helpers";
import style from "./topology.module.scss";
import {
  getNodeCapacityType,
  getNodeZone,
  type NodeGroup,
  nodeSize,
  type Rect,
  type SizeBy,
  STATUS_COLOR,
  squarify,
} from "./topology-utils";

// ── Layout constants ─────────────────────────────────────────────────────────

const GROUP_HEADER_H = 26;
const GROUP_PAD = 8;
const GROUP_ACCENT_W = 3;
const GROUP_GAP = 6;

const CHIP_GAP = 6;
const CHIP_RADIUS = 6;

// label visibility thresholds (in chip-content pixels)
const MIN_NAME_W = 64;
const MIN_NAME_H = 26;
const MIN_SUB_H = 44;

// ── Types ────────────────────────────────────────────────────────────────────

interface TreemapViewProps {
  groups: NodeGroup[];
  sizeBy: SizeBy;
  podCountMap: Record<string, number>;
  filterText: string;
  highlightedGroupId?: string;
  width: number;
  height: number;
}

interface TooltipInfo {
  x: number;
  y: number;
  node: Node;
  group: NodeGroup;
}

// ── Component ────────────────────────────────────────────────────────────────

export const TreemapView: React.FC<TreemapViewProps> = observer(
  ({ groups, sizeBy, podCountMap, filterText, highlightedGroupId, width, height }) => {
    const [tooltip, setTooltip] = useState<TooltipInfo | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const visibleGroups = highlightedGroupId ? groups.filter((g) => g.id === highlightedGroupId) : groups;

    const layout = useMemo(() => {
      if (width <= 0 || height <= 0 || visibleGroups.length === 0) return [];

      // Outer treemap: group sizes = sum of node sizes
      const groupItems = visibleGroups.map((g) => ({
        item: g,
        value: Math.max(
          1,
          g.nodes.reduce((s, n) => s + nodeSize(n, sizeBy), 0),
        ),
      }));
      const outerArea: Rect = { x: 0, y: 0, w: width, h: height };
      const groupRects = squarify(groupItems, outerArea);

      return groupRects.map(({ item: group, rect }) => {
        // gap shrink
        const padded: Rect = {
          x: rect.x + GROUP_GAP / 2,
          y: rect.y + GROUP_GAP / 2,
          w: Math.max(0, rect.w - GROUP_GAP),
          h: Math.max(0, rect.h - GROUP_GAP),
        };
        // inside the panel: header at top, content below, padding all around
        const inner: Rect = {
          x: padded.x + GROUP_PAD + GROUP_ACCENT_W,
          y: padded.y + GROUP_HEADER_H,
          w: Math.max(0, padded.w - GROUP_PAD * 2 - GROUP_ACCENT_W),
          h: Math.max(0, padded.h - GROUP_HEADER_H - GROUP_PAD),
        };
        const nodeItems = group.nodes.map((n) => ({ item: n, value: Math.max(0.001, nodeSize(n, sizeBy)) }));
        const nodeRects = squarify(nodeItems, inner);
        return { group, rect: padded, inner, nodeRects };
      });
    }, [visibleGroups, sizeBy, width, height]);

    const onCellEnter = (e: React.MouseEvent, node: Node, group: NodeGroup) => {
      const r = containerRef.current?.getBoundingClientRect();
      setTooltip({
        x: e.clientX - (r?.left ?? 0),
        y: e.clientY - (r?.top ?? 0),
        node,
        group,
      });
    };

    const matchesFilter = (n: Node): boolean => {
      if (!filterText) return true;
      const name = (n.metadata?.name ?? "").toLowerCase();
      const it = getInstanceType(n).toLowerCase();
      const zn = getNodeZone(n).toLowerCase();
      return name.includes(filterText) || it.includes(filterText) || zn.includes(filterText);
    };

    if (layout.length === 0) {
      return <div className={style.empty}>No nodes to show.</div>;
    }

    return (
      <div ref={containerRef} style={{ position: "relative", width: "100%", height: "100%" }}>
        <svg
          className={style.treemapSvg}
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          role="img"
          aria-label="Cluster topology treemap"
        >
          <defs>
            <linearGradient id="chipGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#244069" stopOpacity="0.95" />
              <stop offset="100%" stopColor="#16263d" stopOpacity="1" />
            </linearGradient>
            <linearGradient id="chipGradientHover" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2d4f81" stopOpacity="0.95" />
              <stop offset="100%" stopColor="#1d3552" stopOpacity="1" />
            </linearGradient>
          </defs>

          {layout.map(({ group, rect, nodeRects }) => (
            <g key={group.id}>
              <GroupPanel group={group} rect={rect} />
              {nodeRects.map(({ item: node, rect: nr }) => (
                <Chip
                  key={node.metadata?.name}
                  node={node}
                  group={group}
                  rect={nr}
                  podCount={podCountMap[node.metadata?.name ?? ""] ?? -1}
                  dimmed={!matchesFilter(node)}
                  onEnter={(e) => onCellEnter(e, node, group)}
                  onLeave={() => setTooltip(null)}
                  onClick={(e) => {
                    e.stopPropagation();
                    openNodeDetail(node);
                  }}
                />
              ))}
            </g>
          ))}
        </svg>

        {tooltip && <NodeTooltip info={tooltip} podCountMap={podCountMap} containerWidth={width} />}
      </div>
    );
  },
);

// ── Group panel ──────────────────────────────────────────────────────────────

const GroupPanel: React.FC<{ group: NodeGroup; rect: Rect }> = ({ group, rect }) => {
  const titleMaxChars = Math.max(0, Math.floor((rect.w - 80) / 6.5));
  return (
    <g>
      {/* Card */}
      <rect className={style.groupPanel} x={rect.x} y={rect.y} width={rect.w} height={rect.h} rx={8} ry={8} />
      {/* Accent stripe (group color) on the left edge */}
      <rect
        x={rect.x + 1}
        y={rect.y + 1}
        width={GROUP_ACCENT_W}
        height={rect.h - 2}
        rx={2}
        ry={2}
        fill={group.color}
        opacity={0.85}
      />
      {/* Header text */}
      <text className={style.groupHeaderText} x={rect.x + GROUP_ACCENT_W + 10} y={rect.y + GROUP_HEADER_H - 9}>
        {truncate(group.label, titleMaxChars)}
      </text>
      {/* Header count */}
      <text
        className={style.groupHeaderCount}
        x={rect.x + rect.w - 10}
        y={rect.y + GROUP_HEADER_H - 9}
        textAnchor="end"
      >
        {group.nodes.length}
      </text>
      {/* Header divider */}
      <line
        x1={rect.x + GROUP_ACCENT_W + 6}
        x2={rect.x + rect.w - 6}
        y1={rect.y + GROUP_HEADER_H - 1}
        y2={rect.y + GROUP_HEADER_H - 1}
        stroke="rgba(255,255,255,0.06)"
        strokeWidth={1}
      />
    </g>
  );
};

// ── Chip ─────────────────────────────────────────────────────────────────────

interface ChipProps {
  node: Node;
  group: NodeGroup;
  rect: Rect;
  podCount: number;
  dimmed: boolean;
  onEnter: (e: React.MouseEvent) => void;
  onLeave: () => void;
  onClick: (e: React.MouseEvent | React.KeyboardEvent) => void;
}

const Chip: React.FC<ChipProps> = ({ node, group: _group, rect, podCount, dimmed, onEnter, onLeave, onClick }) => {
  const w = Math.max(0, rect.w - CHIP_GAP);
  const h = Math.max(0, rect.h - CHIP_GAP);
  if (w < 8 || h < 8) return null;

  const x = rect.x + CHIP_GAP / 2;
  const y = rect.y + CHIP_GAP / 2;
  const status = getNodeStatus(node);
  const cap = getNodeCapacityType(node);
  const name = node.metadata?.name ?? "";
  const itype = getInstanceType(node);
  const drawName = w >= MIN_NAME_W && h >= MIN_NAME_H;
  const drawSub = w >= MIN_NAME_W && h >= MIN_SUB_H;
  const maxPods = getNodeMaxPods(node);
  const drawPodBar = h >= 18 && w >= 30 && maxPods > 0;

  return (
    <g
      onMouseEnter={onEnter}
      onMouseMove={onEnter}
      onMouseLeave={onLeave}
      onClick={(e) => {
        e.stopPropagation();
        onClick(e);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          onClick(e);
        }
      }}
      role="button"
      tabIndex={0}
      style={{ cursor: "pointer" }}
      aria-label={`${name}, ${status}, ${itype}, ${cap}`}
      className={dimmed ? style.chipBodyDimmed : undefined}
    >
      {/* Chip body */}
      <rect
        className={style.chipBody}
        x={x}
        y={y}
        width={w}
        height={h}
        rx={CHIP_RADIUS}
        ry={CHIP_RADIUS}
        fill="url(#chipGradient)"
      />

      {/* Inner notch (subtle "socket" look) */}
      {w > 40 && h > 40 && (
        <rect
          x={x + 6}
          y={y + 6}
          width={w - 12}
          height={h - 12}
          rx={CHIP_RADIUS - 2}
          ry={CHIP_RADIUS - 2}
          fill="none"
          stroke="rgba(255,255,255,0.05)"
          strokeWidth={1}
        />
      )}

      {/* Capacity dot (top-left) — always present so its meaning is consistent */}
      {w > 24 && h > 24 && <CapacityDot cx={x + 10} cy={y + 10} cap={cap} />}

      {/* Status dot (top-right) */}
      {w > 24 && h > 24 && <StatusDot cx={x + w - 10} cy={y + 10} color={STATUS_COLOR[status]} />}

      {/* Labels */}
      {drawName && (
        <text className={style.chipLabel} x={x + 10} y={y + 30}>
          {truncate(name, Math.max(0, Math.floor((w - 22) / 6)))}
        </text>
      )}
      {drawSub && (
        <text className={style.chipSubLabel} x={x + 10} y={y + 44}>
          {truncate(itype, Math.max(0, Math.floor((w - 22) / 6)))}
        </text>
      )}

      {/* Pod usage mini-bar along the bottom edge — always present when we have a maxPods */}
      {drawPodBar && (
        <PodBar
          x={x + 6}
          y={y + h - 7}
          width={w - 12}
          running={Math.max(0, podCount)}
          max={maxPods}
          showLabel={w >= 90 && h >= MIN_SUB_H}
        />
      )}
    </g>
  );
};

// ── Capacity dot (top-left of chip) ─────────────────────────────────────────

const CapacityDot: React.FC<{ cx: number; cy: number; cap: "spot" | "on-demand" | "unknown" }> = ({ cx, cy, cap }) => {
  if (cap === "unknown") return null;
  const r = 3.5;
  const className = cap === "spot" ? style.chipCapDotSpot : style.chipCapDotOnDemand;
  return (
    <g pointerEvents="none" aria-hidden="true">
      <rect x={cx - r} y={cy - r} width={r * 2} height={r * 2} rx={1.5} ry={1.5} className={className} />
      {cap === "spot" && (
        <line x1={cx - r} y1={cy + r} x2={cx + r} y2={cy - r} stroke="rgba(255,255,255,0.55)" strokeWidth={1} />
      )}
    </g>
  );
};

// ── Status dot ───────────────────────────────────────────────────────────────

const StatusDot: React.FC<{ cx: number; cy: number; color: string }> = ({ cx, cy, color }) => (
  <g className={style.statusDot}>
    <circle cx={cx} cy={cy} r={5} className={style.statusDotRing} />
    <circle cx={cx} cy={cy} r={3.5} fill={color} />
  </g>
);

// ── Pod usage mini-bar ──────────────────────────────────────────────────────
//
// A 3px-tall progress bar pinned to the bottom edge of every chip. It is
// rendered the same way regardless of chip size, so the indicator is always
// in the same place and means the same thing. An optional `running/max`
// label is shown to the right of the bar when the chip is wide enough.

const PodBar: React.FC<{
  x: number;
  y: number;
  width: number;
  running: number;
  max: number;
  showLabel: boolean;
}> = ({ x, y, width, running, max, showLabel }) => {
  if (width <= 0 || max <= 0) return null;

  const labelText = `${running}/${max}`;
  const labelW = showLabel ? labelText.length * 6 + 6 : 0;
  const trackW = Math.max(0, width - labelW);
  if (trackW < 8) return null;

  const ratio = Math.max(0, Math.min(1, running / max));
  const fillW = Math.max(running > 0 ? 2 : 0, trackW * ratio);

  return (
    <g pointerEvents="none" aria-hidden="true">
      <rect className={style.podBarTrack} x={x} y={y} width={trackW} height={3} rx={1.5} ry={1.5} />
      {fillW > 0 && <rect className={style.podBarFill} x={x} y={y} width={fillW} height={3} rx={1.5} ry={1.5} />}
      {showLabel && (
        <text className={style.podBarText} x={x + width} y={y + 3} textAnchor="end">
          {labelText}
        </text>
      )}
    </g>
  );
};

// ── Tooltip ──────────────────────────────────────────────────────────────────

const NodeTooltip: React.FC<{
  info: TooltipInfo;
  podCountMap: Record<string, number>;
  containerWidth: number;
}> = ({ info, podCountMap, containerWidth }) => {
  const node = info.node;
  const name = node.metadata?.name ?? "—";
  const status = getNodeStatus(node);
  const maxPods = getNodeMaxPods(node);
  const running = podCountMap[name] ?? -1;
  const pods = maxPods > 0 ? (running >= 0 ? `${running}/${maxPods}` : `—/${maxPods}`) : "—";
  const cap = getNodeCapacityType(node);
  const offsetX = info.x + 240 > containerWidth ? -250 : 14;

  return (
    <div className={style.tooltip} style={{ left: info.x + offsetX, top: info.y - 10 }}>
      <div style={{ fontFamily: "monospace", fontSize: 11, color: "#e6edf6", marginBottom: 6 }}>{name}</div>
      <div style={{ marginBottom: 6, display: "flex", gap: 8, alignItems: "center" }}>
        <span
          style={{
            display: "inline-block",
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: STATUS_COLOR[status],
            boxShadow: "0 0 0 2px rgba(0,0,0,0.45)",
          }}
        />
        <span style={{ color: "#e6edf6", fontWeight: 600 }}>{status}</span>
        <span
          style={{
            color: "#8aa0bc",
            marginLeft: "auto",
            textTransform: "uppercase",
            fontSize: 10,
            letterSpacing: "0.06em",
          }}
        >
          {cap}
        </span>
      </div>
      <table style={{ borderCollapse: "collapse", fontSize: 11 }}>
        <tbody>
          {(
            [
              ["Group", info.group.label],
              ["Type", getInstanceType(node)],
              ["Zone", getNodeZone(node)],
              ["CPU", getNodeCpu(node)],
              ["Memory", getNodeMemory(node)],
              ["Pods", pods],
            ] as [string, string][]
          ).map(([k, v]) => (
            <tr key={k}>
              <td style={{ color: "#8aa0bc", paddingRight: 10 }}>{k}</td>
              <td style={{ color: "#e6edf6", fontFamily: "monospace" }}>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ marginTop: 8, color: "#8aa0bc", fontSize: 10 }}>Click for details</div>
    </div>
  );
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function truncate(s: string, maxChars: number): string {
  if (maxChars <= 1) return "";
  if (s.length <= maxChars) return s;
  return s.slice(0, Math.max(1, maxChars - 1)) + "…";
}

// ── Wrapper: measures container and forwards size to TreemapView ────────────

export const ResponsiveTreemap: React.FC<Omit<TreemapViewProps, "width" | "height">> = (props) => {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  useLayoutEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver((entries) => {
      const e = entries[0];
      if (!e) return;
      const cr = e.contentRect;
      setSize({ w: Math.floor(cr.width), h: Math.floor(cr.height) });
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={ref} style={{ width: "100%", height: "100%", minHeight: 520 }}>
      {size.w > 0 && size.h > 0 && <TreemapView {...props} width={size.w} height={size.h} />}
    </div>
  );
};

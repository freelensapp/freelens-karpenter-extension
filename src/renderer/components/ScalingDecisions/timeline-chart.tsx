/**
 * timeline-chart.tsx — pure-SVG, no-deps event-count timeline.
 *
 * Renders a stacked area chart of event counts over time, with optional
 * click-to-select on each time bucket (used to filter the table below).
 *
 *   ┌─────────────────────────────┐
 *   │ ░▒▓ scale-up  ░▒▓ scale-down│   legend
 *   │ ████▒▒░░    ▒▒▓▓░░          │
 *   │_____________________________│
 *     12:00   12:30   13:00
 */

import React, { useMemo, useRef, useState } from "react";
import { COLOR } from "../../config/theme";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TimelinePoint {
  /** Bucket start (ms epoch) */
  t: number;
  /** Per-series counts: { "scale-up": 3, "error": 1, ... } */
  counts: Record<string, number>;
}

export interface TimelineSeries {
  key: string;
  label: string;
  color: string;
}

export interface TimelineChartProps {
  points: TimelinePoint[];
  series: TimelineSeries[];
  /** Bucket size in ms — used for label formatting */
  bucketMs: number;
  /** Currently selected bucket start (ms) — highlighted */
  selectedT?: number | null;
  onSelectBucket?: (t: number | null) => void;
  /** Visual height in px (width is responsive) */
  height?: number;
  /** Show axis labels */
  showAxis?: boolean;
  /** Compact mode (sparkline) — no legend, no axis */
  compact?: boolean;
  /** Optional title shown top-left */
  title?: string;
  /** "bars" (stacked) or "area" (line + fill, one path per series) */
  mode?: "bars" | "area";
  /** Externally-controlled hovered timestamp (e.g. from a table row) */
  externalHoverT?: number | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtBucket(t: number, bucketMs: number): string {
  const d = new Date(t);
  if (bucketMs >= 24 * 3600_000) {
    return d.toLocaleDateString(undefined, { month: "short", day: "2-digit" });
  }
  if (bucketMs >= 3600_000) {
    return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

// ── Component ─────────────────────────────────────────────────────────────────

export const TimelineChart: React.FC<TimelineChartProps> = ({
  points,
  series,
  bucketMs,
  selectedT = null,
  onSelectBucket,
  height = 160,
  showAxis = true,
  compact = false,
  title,
  mode = "bars",
  externalHoverT = null,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  // ResizeObserver for responsive width
  React.useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setWidth(Math.max(200, Math.floor(e.contentRect.width)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── Layout ────────────────────────────────────────────────────────────────
  const padL = compact ? 4  : 36;
  const padR = compact ? 4  : 8;
  const padT = compact ? 4  : (title ? 22 : 6);
  const padB = compact ? 4  : (showAxis ? 22 : 6);
  const innerW = Math.max(10, width - padL - padR);
  const innerH = Math.max(10, height - padT - padB);

  // ── Data prep: stacked totals per bucket ───────────────────────────────────
  const { maxStack, maxSingle, stacked } = useMemo(() => {
    let max = 0;
    let maxS = 0;
    const stk = points.map((p) => {
      let acc = 0;
      const bands = series.map((s) => {
        const v = p.counts[s.key] ?? 0;
        const start = acc;
        acc += v;
        if (v > maxS) maxS = v;
        return { key: s.key, color: s.color, start, end: acc, value: v };
      });
      if (acc > max) max = acc;
      return { t: p.t, total: acc, bands };
    });
    return { maxStack: max, maxSingle: maxS, stacked: stk };
  }, [points, series]);

  if (points.length === 0) {
    return (
      <div
        ref={containerRef}
        style={{
          width: "100%",
          height,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: COLOR.textTertiary,
          fontSize: 12,
          border: `1px dashed ${COLOR.border}`,
          borderRadius: 6,
          background: "rgba(255,255,255,0.01)",
        }}
      >
        No events in the selected range
      </div>
    );
  }

  const n = points.length;
  const colW = innerW / n;
  const barGap = compact ? 0.5 : Math.min(2, colW * 0.15);
  const barW = Math.max(1, colW - barGap);

  // Y axis max depends on mode
  const yMax = mode === "area" ? Math.max(1, maxSingle) : Math.max(1, maxStack);

  // X scale: bucket index → x
  const xOf = (i: number) => padL + i * colW + colW / 2 - barW / 2;
  // Center-of-column x (used by line/area mode)
  const xCenter = (i: number) => padL + i * colW + colW / 2;
  // Y scale: count → y
  const yOf = (v: number) => padT + innerH - (yMax > 0 ? (v / yMax) * innerH : 0);

  // ── Hover/selection ────────────────────────────────────────────────────────
  const idxFromX = (svgX: number): number | null => {
    const x = svgX - padL;
    if (x < 0 || x > innerW) return null;
    const i = Math.floor(x / colW);
    if (i < 0 || i >= n) return null;
    return i;
  };

  const handleMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    const sx = ((e.clientX - rect.left) / rect.width) * width;
    setHoverIdx(idxFromX(sx));
  };

  const handleClick = () => {
    if (hoverIdx == null || !onSelectBucket) return;
    const t = points[hoverIdx]!.t;
    onSelectBucket(selectedT === t ? null : t);
  };

  // External hover (e.g. from a row in the table) → derive an index
  const externalIdx = useMemo(() => {
    if (externalHoverT == null) return null;
    let best = -1;
    let bestDiff = Infinity;
    for (let i = 0; i < points.length; i++) {
      const diff = Math.abs(points[i]!.t - externalHoverT);
      if (diff < bestDiff) { bestDiff = diff; best = i; }
    }
    return best >= 0 ? best : null;
  }, [externalHoverT, points]);

  const activeIdx = hoverIdx ?? externalIdx;

  // ── Y-axis ticks ───────────────────────────────────────────────────────────
  const yTicks = useMemo(() => {
    if (compact || !showAxis || yMax === 0) return [] as number[];
    const tickCount = Math.min(4, Math.max(2, Math.floor(innerH / 30)));
    const step = Math.max(1, Math.ceil(yMax / tickCount));
    const ticks: number[] = [];
    for (let v = 0; v <= yMax; v += step) ticks.push(v);
    if (ticks[ticks.length - 1] !== yMax) ticks.push(yMax);
    return ticks;
  }, [yMax, innerH, compact, showAxis]);

  // ── X-axis labels (show ~5 across) ─────────────────────────────────────────
  const xLabelStep = Math.max(1, Math.ceil(n / 5));

  return (
    <div ref={containerRef} style={{ width: "100%", position: "relative" }}>
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverIdx(null)}
        onClick={handleClick}
        style={{
          display: "block",
          cursor: onSelectBucket ? "pointer" : "default",
          userSelect: "none",
        }}
      >
        {/* Title */}
        {title && !compact && (
          <text
            x={padL}
            y={14}
            fontSize={11}
            fontWeight={600}
            fill="var(--textColorSecondary, #aaa)"
            style={{ textTransform: "uppercase", letterSpacing: "0.05em" }}
          >
            {title}
          </text>
        )}

        {/* Y grid + labels */}
        {yTicks.map((v) => {
          const y = yOf(v);
          return (
            <g key={`y-${v}`}>
              <line
                x1={padL} x2={padL + innerW}
                y1={y} y2={y}
                stroke={COLOR.border}
                strokeDasharray="2 3"
                opacity={0.5}
              />
              <text x={padL - 4} y={y + 3} fontSize={9} textAnchor="end" fill={COLOR.textTertiary}>
                {v}
              </text>
            </g>
          );
        })}

        {/* Selected bucket highlight */}
        {selectedT != null && (() => {
          const idx = points.findIndex((p) => p.t === selectedT);
          if (idx < 0) return null;
          return (
            <rect
              x={padL + idx * colW}
              y={padT}
              width={colW}
              height={innerH}
              fill={COLOR.info}
              opacity={0.12}
            />
          );
        })()}

        {/* Stacked bars (mode = "bars") */}
        {mode === "bars" && stacked.map((p, i) => (
          <g key={`b-${i}`}>
            {p.bands.map((band) => {
              if (band.value === 0) return null;
              const y0 = yOf(band.start);
              const y1 = yOf(band.end);
              return (
                <rect
                  key={band.key}
                  x={xOf(i)}
                  y={y1}
                  width={barW}
                  height={Math.max(1, y0 - y1)}
                  fill={band.color}
                  opacity={activeIdx === i ? 1 : 0.85}
                />
              );
            })}
          </g>
        ))}

        {/* Area + line per series (mode = "area") */}
        {mode === "area" && series.map((s) => {
          if (points.length === 0) return null;
          const pts = points.map((p, i) => ({
            x: xCenter(i),
            y: yOf(p.counts[s.key] ?? 0),
            v: p.counts[s.key] ?? 0,
          }));
          const linePath = pts
            .map((pt, i) => `${i === 0 ? "M" : "L"} ${pt.x} ${pt.y}`)
            .join(" ");
          const baseY = yOf(0);
          const areaPath =
            `M ${pts[0]!.x} ${baseY} ` +
            pts.map((pt) => `L ${pt.x} ${pt.y}`).join(" ") +
            ` L ${pts[pts.length - 1]!.x} ${baseY} Z`;
          return (
            <g key={`area-${s.key}`}>
              <path d={areaPath} fill={s.color} opacity={0.18} />
              <path
                d={linePath}
                fill="none"
                stroke={s.color}
                strokeWidth={1.6}
                opacity={0.95}
              />
              {/* Point dot at active index */}
              {activeIdx != null && pts[activeIdx] && (
                <circle
                  cx={pts[activeIdx]!.x}
                  cy={pts[activeIdx]!.y}
                  r={3.5}
                  fill={s.color}
                  stroke="#0c0e12"
                  strokeWidth={1.2}
                />
              )}
            </g>
          );
        })}

        {/* Hover/external crosshair */}
        {activeIdx != null && (
          <line
            x1={xCenter(activeIdx)}
            x2={xCenter(activeIdx)}
            y1={padT}
            y2={padT + innerH}
            stroke={mode === "area" ? "rgba(255,255,255,0.5)" : COLOR.info}
            strokeWidth={1}
            opacity={0.7}
            strokeDasharray={mode === "area" ? "" : "0"}
            pointerEvents="none"
          />
        )}

        {/* X-axis labels */}
        {!compact && showAxis && points.map((p, i) => {
          if (i % xLabelStep !== 0 && i !== n - 1) return null;
          return (
            <text
              key={`x-${i}`}
              x={padL + i * colW + colW / 2}
              y={height - 6}
              fontSize={9}
              textAnchor="middle"
              fill={COLOR.textTertiary}
            >
              {fmtBucket(p.t, bucketMs)}
            </text>
          );
        })}
      </svg>

      {/* Tooltip */}
      {activeIdx != null && !compact && (() => {
        const p = stacked[activeIdx]!;
        const xPx = xCenter(activeIdx);
        // Choose left/right placement so tooltip stays inside the chart
        const placeRight = xPx < width / 2;
        const left = (xPx / width) * 100;
        const tipDate = new Date(p.t);
        const fmtTime = bucketMs >= 24 * 3600_000
          ? tipDate.toLocaleString(undefined, { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" })
          : tipDate.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
        return (
          <div
            style={{
              position: "absolute",
              left: `${left}%`,
              top: padT + 6,
              transform: placeRight ? "translateX(8px)" : "translateX(calc(-100% - 8px))",
              background: "rgba(20, 23, 28, 0.96)",
              border: `1px solid ${COLOR.border}`,
              borderRadius: 4,
              padding: "6px 10px",
              fontSize: 11,
              pointerEvents: "none",
              whiteSpace: "nowrap",
              boxShadow: "0 2px 12px rgba(0,0,0,0.5)",
              zIndex: 5,
              minWidth: 140,
            }}
          >
            <div style={{ color: COLOR.textSecondary, marginBottom: 4, fontFamily: "monospace" }}>
              Time: <strong style={{ color: COLOR.textPrimary }}>{fmtTime}</strong>
            </div>
            {p.bands
              .filter((b) => b.value > 0)
              .map((b) => {
                const s = series.find((x) => x.key === b.key);
                return (
                  <div key={b.key} style={{ display: "flex", alignItems: "center", gap: 6, color: b.color }}>
                    <span style={{ width: 8, height: 8, background: b.color, borderRadius: 2, display: "inline-block" }} />
                    <span style={{ flex: 1 }}>{s?.label ?? b.key}:</span>
                    <strong style={{ color: COLOR.textPrimary }}>{b.value}</strong>
                  </div>
                );
              })}
            {p.total === 0 && (
              <div style={{ color: COLOR.textTertiary, fontStyle: "italic" }}>(no events)</div>
            )}
          </div>
        );
      })()}
    </div>
  );
};

/**
 * ClusterPieView.tsx
 *
 * SVG Sunburst (no external deps) with 2 rings:
 *   - Inner ring  = NodePool (or "Other nodes")
 *   - Outer ring  = individual Ready nodes inside that pool
 *
 * Only Ready nodes are shown. Empty / all-non-ready pools are hidden.
 */

import React, { useMemo, useState } from "react";
import { observer } from "mobx-react";
import { type Node } from "../../k8s/core/node-store";
import { type NodePool } from "../../k8s/karpenter/store";
import {
  getInstanceType,
  getNodeCpu,
  getNodeMemory,
  getNodeStatus,
  buildPodCountMap,
  getNodeMaxPods,
} from "../../utils/kube-helpers";
import style from "./cluster-pie-view.module.scss";

// ── Palette ───────────────────────────────────────────────────────────────────

const POOL_PALETTE = [
  "#00a7e1", "#48c78e", "#ffc107", "#ff7043", "#ab80ff",
  "#f06292", "#4fc3f7", "#81c784", "#ffb74d", "#ba68c8",
  "#4dd0e1", "#aed581", "#ff8a65", "#7986cb", "#26c6da",
];
const NON_KARPENTER_COLOR = "#607d8b";

function lightenHex(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, ((n >> 16) & 0xff) + Math.round(amount * 255));
  const g = Math.min(255, ((n >> 8)  & 0xff) + Math.round(amount * 255));
  const b = Math.min(255, ( n        & 0xff) + Math.round(amount * 255));
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface PoolSlice {
  id: string;
  label: string;
  color: string;
  nodes: Node[];
}

interface TooltipInfo {
  x: number;
  y: number;
  content: React.ReactNode;
}

// ── SVG math helpers ──────────────────────────────────────────────────────────

const TWO_PI = 2 * Math.PI;

function arc(
  cx: number, cy: number,
  r0: number, r1: number,
  startAngle: number, endAngle: number,
): string {
  // clamp to avoid degenerate arcs
  if (endAngle - startAngle >= TWO_PI) endAngle = startAngle + TWO_PI - 0.0001;
  const cosS = Math.cos(startAngle), sinS = Math.sin(startAngle);
  const cosE = Math.cos(endAngle),   sinE = Math.sin(endAngle);
  const large = endAngle - startAngle > Math.PI ? 1 : 0;
  return [
    `M ${cx + r1 * cosS} ${cy + r1 * sinS}`,
    `A ${r1} ${r1} 0 ${large} 1 ${cx + r1 * cosE} ${cy + r1 * sinE}`,
    `L ${cx + r0 * cosE} ${cy + r0 * sinE}`,
    `A ${r0} ${r0} 0 ${large} 0 ${cx + r0 * cosS} ${cy + r0 * sinS}`,
    "Z",
  ].join(" ");
}

// ── Sunburst sizes ────────────────────────────────────────────────────────────

const SIZE     = 600;
const CX       = SIZE / 2;
const CY       = SIZE / 2;
const R_POOL_IN  = 90;
const R_POOL_OUT = 170;
const R_NODE_OUT = SIZE / 2 - 6;
const PAD       = 0.010; // radians gap between arcs

// ── Sunburst component ────────────────────────────────────────────────────────

interface ArcDatum {
  d: string;
  fill: string;
  midAngle: number;
  midR: number;
  labelText: string;
  showLabel: boolean;
  depth: number;
  node?: Node;
  pool?: PoolSlice;
}

interface SunburstProps {
  slices: PoolSlice[];
  podCountMap: Record<string, number>;
  onTooltip: (t: TooltipInfo | null) => void;
}

function buildArcs(slices: PoolSlice[]): ArcDatum[] {
  const totalNodes = slices.reduce((s, sl) => s + sl.nodes.length, 0);
  const result: ArcDatum[] = [];
  let poolAngle = -Math.PI / 2; // start at top

  for (const sl of slices) {
    const poolSpan = (sl.nodes.length / totalNodes) * TWO_PI;
    const pStart = poolAngle + PAD / 2;
    const pEnd   = poolAngle + poolSpan - PAD / 2;
    const pMid   = (pStart + pEnd) / 2;

    // Pool arc
    result.push({
      d: arc(CX, CY, R_POOL_IN, R_POOL_OUT, pStart, pEnd),
      fill: sl.color,
      midAngle: pMid,
      midR: (R_POOL_IN + R_POOL_OUT) / 2,
      labelText: sl.label,
      showLabel: poolSpan > 0.22,
      depth: 1,
      pool: sl,
    });

    // Node arcs inside this pool span
    const nodeSpan = poolSpan / sl.nodes.length;
    sl.nodes.forEach((node, ni) => {
      const nStart = poolAngle + ni * nodeSpan + PAD / 2;
      const nEnd   = poolAngle + (ni + 1) * nodeSpan - PAD / 2;
      const nMid   = (nStart + nEnd) / 2;
      const name   = node.metadata?.name ?? "";
      result.push({
        d: arc(CX, CY, R_POOL_OUT, R_NODE_OUT, nStart, nEnd),
        fill: lightenHex(sl.color, 0.12),
        midAngle: nMid,
        midR: (R_POOL_OUT + R_NODE_OUT) / 2,
        labelText: name.length > 20 ? name.slice(0, 19) + "…" : name,
        showLabel: nodeSpan > 0.10,
        depth: 2,
        node,
        pool: sl,
      });
    });

    poolAngle += poolSpan;
  }
  return result;
}

const Sunburst: React.FC<SunburstProps & {
  onTooltip: (t: TooltipInfo | null) => void;
}> = ({ slices, podCountMap, onTooltip }) => {
  const arcs = useMemo(() => buildArcs(slices), [slices]); // eslint-disable-line react-hooks/exhaustive-deps
  const totalNodes = slices.reduce((s, sl) => s + sl.nodes.length, 0);

  const buildContent = (datum: ArcDatum, x: number, y: number): TooltipInfo | null => {
    if (datum.depth === 1 && datum.pool) {
      return {
        x, y,
        content: (
          <div>
            <strong style={{ color: datum.pool.color }}>{datum.pool.label}</strong>
            <div style={{ marginTop: 4, color: "#aaa" }}>{datum.pool.nodes.length} ready node{datum.pool.nodes.length !== 1 ? "s" : ""}</div>
          </div>
        ),
      };
    }
    if (datum.node) {
      const node = datum.node;
      const name    = node.metadata?.name ?? "—";
      const maxPods = getNodeMaxPods(node);
      const running = podCountMap[name] ?? -1;
      const pods    = maxPods > 0 ? (running >= 0 ? `${running}/${maxPods}` : `—/${maxPods}`) : "—";
      return {
        x, y,
        content: (
          <div>
            <div style={{ fontFamily: "monospace", fontSize: 11, color: "#ddd", marginBottom: 6 }}>{name}</div>
            <table style={{ borderCollapse: "collapse", fontSize: 11 }}>
              <tbody>
                {([
                  ["Type",   getInstanceType(node)],
                  ["CPU",    getNodeCpu(node)],
                  ["Memory", getNodeMemory(node)],
                  ["Pods",   pods],
                ] as [string, string][]).map(([k, v]) => (
                  <tr key={k}>
                    <td style={{ color: "#888", paddingRight: 10 }}>{k}</td>
                    <td style={{ color: "#eee", fontFamily: "monospace" }}>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ),
      };
    }
    return null;
  };

  const getXY = (e: React.MouseEvent<SVGPathElement>) => {
    const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  return (
    <svg width={SIZE} height={SIZE} className={style.sunburst}>
      {/* Arcs */}
      {arcs.map((datum, i) => (
        <path
          key={i}
          d={datum.d}
          fill={datum.fill}
          stroke="var(--layoutBackground, #15151f)"
          strokeWidth={1.5}
          opacity={0.92}
          onMouseEnter={(e) => { (e.currentTarget as SVGPathElement).style.opacity = "1"; const {x,y} = getXY(e); onTooltip(buildContent(datum, x, y)); }}
          onMouseMove={(e) => { const {x,y} = getXY(e); onTooltip(buildContent(datum, x, y)); }}
          onMouseLeave={(e) => { (e.currentTarget as SVGPathElement).style.opacity = "0.92"; onTooltip(null); }}
        />
      ))}

      {/* Labels */}
      {arcs.map((datum, i) => {
        if (!datum.showLabel) return null;
        const flip = datum.midAngle > Math.PI / 2 && datum.midAngle < (3 * Math.PI) / 2;
        const lx = CX + datum.midR * Math.cos(datum.midAngle);
        const ly = CY + datum.midR * Math.sin(datum.midAngle);
        const deg = (datum.midAngle * 180) / Math.PI + (flip ? 180 : 0);
        return (
          <text
            key={`lbl-${i}`}
            transform={`translate(${lx},${ly}) rotate(${deg})`}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={datum.depth === 1 ? 11 : 9}
            fontWeight={datum.depth === 1 ? 700 : 400}
            fill={datum.depth === 1 ? "#fff" : "rgba(255,255,255,0.7)"}
            pointerEvents="none"
          >
            {datum.labelText}
          </text>
        );
      })}

      {/* Centre */}
      <text x={CX} y={CY - 14} textAnchor="middle" dominantBaseline="middle" fontSize={32} fontWeight={800} fill="var(--textColorPrimary, #fff)">
        {totalNodes}
      </text>
      <text x={CX} y={CY + 18} textAnchor="middle" dominantBaseline="middle" fontSize={12} fill="var(--textColorSecondary, #888)">
        ready nodes
      </text>
    </svg>
  );
};

// ── Legend ────────────────────────────────────────────────────────────────────

const Legend: React.FC<{ slices: PoolSlice[] }> = ({ slices }) => (
  <div className={style.legend}>
    {slices.map((sl) => (
      <div key={sl.id} className={style.legendItem}>
        <span className={style.legendDot} style={{ background: sl.color }} />
        <span className={style.legendLabel}>{sl.label}</span>
        <span className={style.legendCount} style={{ color: sl.color }}>{sl.nodes.length}</span>
      </div>
    ))}
  </div>
);

// ── Tooltip ───────────────────────────────────────────────────────────────────

const Tooltip: React.FC<{ info: TooltipInfo }> = ({ info }) => (
  <div className={style.tooltip} style={{ left: info.x + 14, top: info.y - 10 }}>
    {info.content}
  </div>
);

// ── Main component ────────────────────────────────────────────────────────────

interface ClusterPieViewProps {
  nodePools: NodePool[];
  allNodes: Node[];
}

export const ClusterPieView: React.FC<ClusterPieViewProps> = observer(({ nodePools, allNodes }) => {
  const [tooltip, setTooltip] = useState<TooltipInfo | null>(null);

  const podCountMap = useMemo(() => buildPodCountMap(), [allNodes.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const slices: PoolSlice[] = useMemo(() => {
    const result: PoolSlice[] = [];

    nodePools.forEach((np, i) => {
      const poolName = np.metadata?.name ?? `pool-${i}`;
      const readyNodes = allNodes.filter(
        (n) =>
          n.metadata?.labels?.["karpenter.sh/nodepool"] === poolName &&
          getNodeStatus(n) === "Ready"
      );
      if (readyNodes.length === 0) return;
      result.push({
        id: poolName,
        label: poolName,
        color: POOL_PALETTE[i % POOL_PALETTE.length]!,
        nodes: readyNodes,
      });
    });

    const karpenterNames = new Set(result.flatMap((s) => s.nodes.map((n) => n.metadata?.name ?? "")));
    const others = allNodes.filter(
      (n) =>
        !karpenterNames.has(n.metadata?.name ?? "") &&
        getNodeStatus(n) === "Ready"
    );
    if (others.length > 0) {
      result.push({ id: "__other__", label: "Other", color: NON_KARPENTER_COLOR, nodes: others });
    }

    return result;
  }, [nodePools.length, allNodes.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (slices.length === 0) {
    return <div className={style.empty}>No ready nodes found in the cluster.</div>;
  }

  return (
    <div className={style.root}>
      <div className={style.chartWrap}>
        <Sunburst slices={slices} podCountMap={podCountMap} onTooltip={setTooltip as any} />
        {tooltip && <Tooltip info={tooltip} />}
      </div>
      <Legend slices={slices} />
    </div>
  );
});

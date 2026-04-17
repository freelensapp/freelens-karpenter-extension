import { Renderer } from "@freelensapp/extensions";
import React, { useMemo } from "react";

import style from "./pie-chart.module.scss";
import styleInline from "./pie-chart.module.scss?inline";
import { NodePool } from "../../k8s/karpenter/store";
import { getNodePoolStatus, getNodeStatus } from "../../utils/kube-helpers";
import type { Node } from "../../k8s/core/node-store";


export interface PieChartProps {
  nodes: Node[];
  objects: {
    nodePool: NodePool,
    nodes: Node[];
  }[];
  title: string;
  limits: {
    cpu: string;
    memory: string;
  };
  onPoolClick?: (poolName: string) => void;
  activePool?: string;
  onFilterChange?: (filter: string) => void;
  activeFilter?: string;
}

// ── stat box ──────────────────────────────────────────────────────────────────

function StatBox({
  value,
  label,
  color,
  sub,
}: {
  value: number | string;
  label: string;
  color?: string;
  sub?: string;
}) {
  return (
    <div className={style.statBox}>
      <span className={style.statValue} style={color ? { color } : undefined}>
        {value}
      </span>
      <span className={style.statLabel}>{label}</span>
      {sub && <span className={style.statSub}>{sub}</span>}
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────

export function PieChart(props: PieChartProps): React.ReactElement {
  const { objects, nodes, onPoolClick, activePool, onFilterChange = undefined, activeFilter = "" } = props;

  // ── aggregate stats ──────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const karpenterNodes = nodes.filter(
      (n) => !!(n as any).metadata?.labels?.["karpenter.sh/nodepool"]
    );
    const nonKarpenterNodes = nodes.filter(
      (n) => !(n as any).metadata?.labels?.["karpenter.sh/nodepool"]
    );

    const readyCount = karpenterNodes.filter(
      (n) => getNodeStatus(n) === "Ready"
    ).length;
    const notReadyCount = karpenterNodes.filter(
      (n) => getNodeStatus(n) === "NotReady"
    ).length;
    const provisioningCount = karpenterNodes.filter(
      (n) => getNodeStatus(n) === "Provisioning"
    ).length;
    const terminatingCount = karpenterNodes.filter(
      (n) => getNodeStatus(n) === "Terminating"
    ).length;

    // per-nodepool counts
    const poolCounts: Record<string, number> = {};
    for (const np of objects) {
      poolCounts[np.nodePool.metadata?.name ?? ""] = np.nodes.length;
    }

    // pool-level ready/notready
    const poolsReady = objects.filter(
      (np) => getNodePoolStatus(np.nodePool) === "Ready"
    ).length;
    const poolsNotReady = objects.filter(
      (np) => getNodePoolStatus(np.nodePool) !== "Ready"
    ).length;

    return {
      total: nodes.length,
      karpenter: karpenterNodes.length,
      nonKarpenter: nonKarpenterNodes.length,
      ready: readyCount,
      notReady: notReadyCount,
      provisioning: provisioningCount,
      terminating: terminatingCount,
      poolCount: objects.length,
      poolCounts,
      poolsReady,
      poolsNotReady,
    };
  }, [nodes, objects]);

  // ── pie chart data ────────────────────────────────────────────────────────
  const { chartData, backgroundColor } = useMemo(() => {
    const others = stats.nonKarpenter;
    const goldenAngle = 137.508;

    const bgColors = [
      ...objects.map((_, i) => `hsl(${(i * goldenAngle) % 360}, 70%, 50%)`),
      "#555",
    ];

    const lbls = [
      ...objects.map((np) => `${np.nodePool.metadata?.name ?? "?"}: ${np.nodes.length}`),
      ...(others > 0 ? [`Non-Karpenter: ${others}`] : []),
    ];

    const data = [
      ...objects.map((npC) => npC.nodes.length || 0),
      ...(others > 0 ? [others] : []),
    ];

    const tooltipLabels = [
      ...objects.map((np) => (percent: string) => `${np.nodePool.metadata?.name}: ${percent}`),
      ...(others > 0 ? [(percent: string) => `Non-Karpenter: ${percent}`] : []),
    ];

    const cd: Renderer.Component.PieChartData = {
      datasets: [{ data, backgroundColor: bgColors, tooltipLabels }],
      labels: lbls,
    } as any;

    const maxPerColumn = 6;
    const cols = Math.ceil(lbls.length / maxPerColumn);
    const legCols = Array.from({ length: cols }, (_, ci) =>
      lbls.slice(ci * maxPerColumn, (ci + 1) * maxPerColumn)
    );

    return { chartData: cd, backgroundColor: bgColors, labels: lbls, legendColumns: legCols };
  }, [objects, stats.nonKarpenter]);

  return (
    <>
      <style>{styleInline}</style>
      <div className={style.overviewBanner}>

        {/* ── left column: donut only ── */}
        <div className={style.leftCol}>
          <div className={style.donutWrap}>
            <Renderer.Component.PieChart data={chartData} showLegend={false} />
            <span className={style.donutLabel}>{stats.total} nodes</span>
          </div>
        </div>

        {/* ── divider ── */}
        <div className={style.divider} />

        {/* ── right column: stat boxes + per-pool breakdown ── */}
        <div className={style.rightCol}>
          {/* stat boxes row */}
          <div className={style.statsRow}>
            <StatBox value={stats.total}        label="Total nodes"    color="#ccc" />
            <StatBox value={stats.karpenter}    label="Karpenter"      color="#00a7e1" />
            {stats.nonKarpenter > 0 && (
              <StatBox value={stats.nonKarpenter} label="Non-Karpenter" color="#888" />
            )}
            <div className={style.statDivider} />
            <StatBox value={stats.poolCount}    label="NodePools" color="#ccc"
              sub={`${stats.poolsReady} ready`} />
            {stats.poolsNotReady > 0 && (
              <button
                className={`${style.statBox} ${style.statBoxBtn}${activeFilter === "poolstatus:notready" ? ` ${style.statBoxBtnActive}` : ""}`}
                onClick={() => onFilterChange?.(activeFilter === "poolstatus:notready" ? "" : "poolstatus:notready")}
                title="Show only NodePools that are not Ready"
              >
                <span className={style.statValue} style={{ color: "#f14668" }}>{stats.poolsNotReady}</span>
                <span className={style.statLabel}>Not Ready pools</span>
              </button>
            )}
            <div className={style.statDivider} />
            <StatBox value={stats.ready}        label="Ready nodes"    color="#48c78e" />
            {stats.terminating > 0 && (
              <StatBox value={stats.terminating} label="Terminating"   color="#ff7043" />
            )}
            {stats.notReady > 0 && (
              <StatBox value={stats.notReady}    label="Not Ready"     color="#f14668" />
            )}
            {stats.provisioning > 0 && (
              <StatBox value={stats.provisioning} label="Provisioning" color="#ffc107" />
            )}
          </div>

          {/* per-pool breakdown grid — scrollable if many pools */}
          <div className={style.poolBreakdown}>
            {objects.map((np, i) => {
              const name = np.nodePool.metadata?.name ?? "?";
              const isActive = activePool === name;
              return (
                <div
                  key={name}
                  className={`${style.poolBreakdownItem}${isActive ? ` ${style.active}` : ""}`}
                  onClick={() => onPoolClick?.(isActive ? "" : name)}
                  title={name}
                >
                  <span
                    className={style.poolBreakdownDot}
                    style={{ background: backgroundColor[i] }}
                  />
                  <span className={style.poolBreakdownName}>{name}</span>
                  <span className={style.poolBreakdownCount}>{np.nodes.length}</span>
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </>
  );
}

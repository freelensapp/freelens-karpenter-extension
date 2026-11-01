import { Renderer } from "@freelensapp/extensions";
import React from "react";
import { COLOR } from "../../config/theme";
import { computeOverviewSlices, nodePoolDotColor, overviewChartData } from "./overview-slices";
import { computeOverviewStats } from "./overview-stats";
import style from "./pie-chart.module.scss";

import type { NodePool } from "../../api/nodepool/nodepool-v1";
import type { Node } from "../../utils/kube-helpers";

export interface PieChartProps {
  nodes: Node[];
  /** Every NodePool, for the NodePool figures. */
  nodePools: NodePool[];
  /** The NodePools with nodes, one entry each in the breakdown. */
  objects: {
    nodePool: NodePool;
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
  /** Total number of NodeClaims that don't yet have a Node bound */
  claimingCount?: number;
  /** Per-NodePool count of unbound NodeClaims */
  claimingByPool?: Record<string, number>;
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
  const {
    objects,
    nodes,
    nodePools,
    onPoolClick,
    activePool,
    onFilterChange = undefined,
    activeFilter = "",
    claimingCount = 0,
    claimingByPool = {},
  } = props;

  // ── aggregate stats: every NodePool counts; the slices of the chart are the nodes by status ──
  const stats = computeOverviewStats(nodes, nodePools);
  const chartData = overviewChartData(computeOverviewSlices(stats));

  return (
    <>
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
            <StatBox value={stats.total} label="Total nodes" color={COLOR.textPrimary} />
            <StatBox value={stats.karpenter} label="Karpenter" color={COLOR.info} />
            {stats.nonKarpenter > 0 && (
              <StatBox value={stats.nonKarpenter} label="Non-Karpenter" color={COLOR.textSecondary} />
            )}
            <div className={style.statDivider} />
            <StatBox
              value={stats.poolCount}
              label="NodePools"
              color={COLOR.textPrimary}
              sub={`${stats.poolsReady} ready`}
            />
            {stats.poolsNotReady > 0 && (
              <button
                className={`${style.statBox} ${style.statBoxBtn}${activeFilter === "poolstatus:notready" ? ` ${style.statBoxBtnActive}` : ""}`}
                onClick={() => onFilterChange?.(activeFilter === "poolstatus:notready" ? "" : "poolstatus:notready")}
                title="Show only NodePools that are not Ready"
              >
                <span className={style.statValue} style={{ color: COLOR.danger }}>
                  {stats.poolsNotReady}
                </span>
                <span className={style.statLabel}>Not Ready pools</span>
              </button>
            )}
            <div className={style.statDivider} />
            <StatBox value={stats.ready} label="Ready nodes" color={COLOR.success} />
            {stats.terminating > 0 && (
              <StatBox value={stats.terminating} label="Terminating" color={COLOR.terminating} />
            )}
            {stats.notReady > 0 && <StatBox value={stats.notReady} label="Not Ready" color={COLOR.danger} />}
            {stats.provisioning > 0 && (
              <StatBox value={stats.provisioning} label="Provisioning" color={COLOR.warning} />
            )}
            {claimingCount > 0 && <StatBox value={claimingCount} label="Claiming" color={COLOR.claiming} />}
          </div>

          {/* per-pool breakdown grid — scrollable if many pools */}
          <div className={style.poolBreakdown}>
            {objects.map((np) => {
              const name = np.nodePool.metadata?.name ?? "?";
              const isActive = activePool === name;
              const claiming = claimingByPool[name] ?? 0;
              return (
                <div
                  key={name}
                  className={`${style.poolBreakdownItem}${isActive ? ` ${style.active}` : ""}`}
                  onClick={() => onPoolClick?.(isActive ? "" : name)}
                  title={claiming > 0 ? `${name} — ${claiming} claiming` : name}
                >
                  <span className={style.poolBreakdownDot} style={{ background: nodePoolDotColor(np.nodePool) }} />
                  <span className={style.poolBreakdownName}>{name}</span>
                  <span className={style.poolBreakdownCount}>{np.nodes.length}</span>
                  {claiming > 0 && (
                    <span
                      className={style.poolBreakdownCount}
                      style={{
                        color: COLOR.claiming,
                        background: COLOR.claimingBg,
                        marginLeft: 4,
                      }}
                      title={`${claiming} NodeClaim${claiming !== 1 ? "s" : ""} pending (no Node yet)`}
                    >
                      ◌ {claiming}
                    </span>
                  )}
                </div>
              );
            })}
            {/* Pools that exist only as claims (no ready nodes yet) */}
            {Object.entries(claimingByPool)
              .filter(
                ([poolName]) =>
                  poolName !== "__unknown__" && !objects.some((o) => o.nodePool.metadata?.name === poolName),
              )
              .map(([poolName, count]) => (
                <div
                  key={`claim-only-${poolName}`}
                  className={style.poolBreakdownItem}
                  title={`${poolName} — ${count} claiming, no ready nodes yet`}
                >
                  <span className={style.poolBreakdownDot} style={{ background: COLOR.claiming }} />
                  <span className={style.poolBreakdownName}>{poolName}</span>
                  <span
                    className={style.poolBreakdownCount}
                    style={{ color: COLOR.claiming, background: COLOR.claimingBg }}
                  >
                    ◌ {count}
                  </span>
                </div>
              ))}
            {claimingByPool["__unknown__"] && claimingByPool["__unknown__"]! > 0 && (
              <div
                key="claim-only-unknown"
                className={style.poolBreakdownItem}
                title={`${claimingByPool["__unknown__"]} claiming NodeClaim(s) without a NodePool label`}
              >
                <span className={style.poolBreakdownDot} style={{ background: COLOR.claiming }} />
                <span className={style.poolBreakdownName}>(no pool label)</span>
                <span
                  className={style.poolBreakdownCount}
                  style={{ color: COLOR.claiming, background: COLOR.claimingBg }}
                >
                  ◌ {claimingByPool["__unknown__"]}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

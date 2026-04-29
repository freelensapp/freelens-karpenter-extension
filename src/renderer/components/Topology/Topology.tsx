/**
 * Topology.tsx
 *
 * Container for the cluster topology dashboard. Provides:
 *   - KPI strip (pools, nodes, capacity, spot/on-demand, etc.)
 *   - Toolbar  (Group by / Size by / View)
 *   - Body     (Treemap or Sunburst) + interactive side legend
 *   - Footer   (Status legend)
 */

import { observer } from "mobx-react";
import React, { useMemo, useState } from "react";
import { type Node } from "../../k8s/core/node-store";
import { type NodePool } from "../../k8s/karpenter/store";
import { type CondStatus, buildPodCountMap, getNodeStatus } from "../../utils/kube-helpers";
import { ResponsiveTreemap } from "./TreemapView";
import { type GroupBy, type NodeGroup, STATUS_COLOR, type SizeBy, computeKpi, groupNodes } from "./topology-utils";
import style from "./topology.module.scss";
import styleInline from "./topology.module.scss?inline";

// ── Types ────────────────────────────────────────────────────────────────────

interface TopologyProps {
  nodePools: NodePool[];
  allNodes: Node[];
  /** Filter string shared with the Overview tab (e.g. pool name fragment). */
  filterText?: string;
  /** Notify parent when the user clicks a legend row to set/clear filter. */
  onFilterChange?: (filter: string) => void;
}

// ── Segmented control ────────────────────────────────────────────────────────

function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  return (
    <div className={style.segmented} role="radiogroup" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={o.value === value}
          className={`${style.segmentedButton} ${o.value === value ? style.segmentedButtonActive : ""}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ── KPI strip ────────────────────────────────────────────────────────────────

const Kpi: React.FC<{ label: string; value: string | number; sub?: string; color?: string }> = ({
  label,
  value,
  sub,
  color,
}) => (
  <div className={style.kpi}>
    <span className={style.kpiLabel}>{label}</span>
    <span className={style.kpiValue} style={color ? { color } : undefined}>
      {value}
    </span>
    {sub && <span className={style.kpiSub}>{sub}</span>}
  </div>
);

// ── Side legend (interactive) ────────────────────────────────────────────────

const SideLegend: React.FC<{
  groups: NodeGroup[];
  highlightedGroupId?: string;
  onToggle: (id: string) => void;
  groupBy: GroupBy;
}> = ({ groups, highlightedGroupId, onToggle, groupBy }) => {
  const total = groups.reduce((s, g) => s + g.nodes.length, 0);
  return (
    <aside className={style.legendCard} aria-label="Group legend">
      <div className={style.legendTitle}>
        {groupByTitle(groupBy)} · {groups.length} {groups.length === 1 ? "group" : "groups"} · {total} nodes
      </div>
      {groups.map((g) => {
        const counts = countByStatus(g.nodes);
        const active = highlightedGroupId === g.id;
        return (
          <div
            key={g.id}
            className={`${style.legendRow} ${active ? style.legendRowActive : ""}`}
            onClick={() => onToggle(g.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onToggle(g.id);
              }
            }}
            aria-pressed={active}
            title={active ? "Click to clear isolation" : "Click to isolate this group"}
          >
            <span className={style.legendDot} style={{ background: g.color }} />
            <span className={style.legendName}>{g.label}</span>
            <span className={style.legendCount}>{g.nodes.length}</span>
            <div className={style.legendStatusBar} aria-hidden="true">
              {(["Ready", "Provisioning", "Claiming", "NotReady", "Terminating", "Unknown"] as CondStatus[])
                .filter((s) => counts[s] > 0)
                .map((s) => (
                  <span
                    key={s}
                    className={style.legendStatusSegment}
                    style={{
                      flex: counts[s],
                      background: STATUS_COLOR[s],
                    }}
                    title={`${s}: ${counts[s]}`}
                  />
                ))}
            </div>
          </div>
        );
      })}
    </aside>
  );
};

function countByStatus(nodes: Node[]): Record<CondStatus, number> {
  const acc: Record<CondStatus, number> = {
    Ready: 0,
    Provisioning: 0,
    Claiming: 0,
    NotReady: 0,
    Terminating: 0,
    Unknown: 0,
  };
  for (const n of nodes) acc[getNodeStatus(n)]++;
  return acc;
}

function groupByTitle(g: GroupBy): string {
  switch (g) {
    case "pool":
      return "Node Pools";
    case "zone":
      return "Zones";
    case "instanceType":
      return "Instance Types";
    case "nodeClass":
      return "Node Classes";
  }
}

// ── Status / capacity-type bar (always visible at the top) ──────────────────

const StatusBar: React.FC = () => (
  <div className={style.statusLegend} aria-label="Legend">
    <span className={style.statusLegendGroup}>
      <span className={style.statusLegendGroupLabel}>Status</span>
      {(["Ready", "Provisioning", "Claiming", "NotReady", "Terminating"] as CondStatus[]).map((s) => (
        <span key={s} className={style.statusLegendItem}>
          <span className={style.statusSwatch} style={{ background: STATUS_COLOR[s] }} />
          {s}
        </span>
      ))}
    </span>
    <span className={style.statusLegendDivider} aria-hidden="true" />
    <span className={style.statusLegendGroup}>
      <span className={style.statusLegendGroupLabel}>Capacity</span>
      <span className={style.statusLegendItem} title="On-Demand instance">
        <span className={`${style.capDot} ${style.capDotOnDemand}`} />
        On-Demand
      </span>
      <span className={style.statusLegendItem} title="Spot instance">
        <span className={`${style.capDot} ${style.capDotSpot}`} />
        Spot
      </span>
    </span>
    <span className={style.statusLegendHint}>
      Click a chip for node details · Click a group on the right to isolate it
    </span>
  </div>
);

// ── Main component ───────────────────────────────────────────────────────────

export const Topology: React.FC<TopologyProps> = observer(
  ({ nodePools, allNodes, filterText = "", onFilterChange }) => {
    const [groupBy, setGroupBy] = useState<GroupBy>("pool");
    const [sizeBy, setSizeBy] = useState<SizeBy>("cpu");
    const [highlightedGroupId, setHighlightedGroupId] = useState<string | undefined>(undefined);

    const podCountMap = useMemo(() => buildPodCountMap(), [allNodes.length]); // eslint-disable-line react-hooks/exhaustive-deps

    const groups = useMemo(() => groupNodes(allNodes, nodePools, groupBy), [allNodes, nodePools, groupBy]);

    const kpi = useMemo(() => computeKpi(allNodes, nodePools), [allNodes, nodePools]);

    const onLegendToggle = (id: string) => {
      setHighlightedGroupId((prev) => (prev === id ? undefined : id));
    };

    const empty = allNodes.length === 0;

    return (
      <div className={style.root}>
        <style>{styleInline}</style>
        {/* ── KPI strip ──────────────────────────────────────────────── */}
        <div className={style.kpiStrip}>
          <Kpi label="Node Pools" value={kpi.poolCount} />
          <Kpi label="Nodes" value={kpi.totalNodes} sub={`${kpi.karpenterCoverage}% Karpenter-managed`} />
          <Kpi label="Ready" value={kpi.ready} color={STATUS_COLOR.Ready} />
          <Kpi label="Provisioning" value={kpi.provisioning} color={STATUS_COLOR.Provisioning} />
          <Kpi
            label="Not Ready"
            value={kpi.notReady + kpi.terminating}
            sub={kpi.terminating > 0 ? `${kpi.terminating} terminating` : undefined}
            color={STATUS_COLOR.NotReady}
          />
          <Kpi
            label="Capacity"
            value={`${kpi.totalCpuCores.toFixed(0)} vCPU`}
            sub={`${kpi.totalMemGi.toFixed(0)} GiB`}
          />
          <Kpi label="Spot / On-Demand" value={`${kpi.spotNodes} / ${kpi.onDemandNodes}`} />
        </div>

        {/* ── Status / capacity legend (always visible) ──────────────── */}
        <StatusBar />

        {/* ── Toolbar ────────────────────────────────────────────────── */}
        <div className={style.toolbar}>
          <div className={style.toolGroup}>
            <span className={style.toolLabel}>Group by</span>
            <Segmented<GroupBy>
              ariaLabel="Group nodes by"
              value={groupBy}
              onChange={(v) => {
                setGroupBy(v);
                setHighlightedGroupId(undefined);
              }}
              options={[
                { value: "pool", label: "Pool" },
                { value: "zone", label: "Zone" },
                { value: "instanceType", label: "Type" },
                { value: "nodeClass", label: "NodeClass" },
              ]}
            />
          </div>

          <div className={style.toolGroup}>
            <span className={style.toolLabel}>Size by</span>
            <Segmented<SizeBy>
              ariaLabel="Size cells by"
              value={sizeBy}
              onChange={setSizeBy}
              options={[
                { value: "cpu", label: "CPU" },
                { value: "memory", label: "Memory" },
                { value: "pods", label: "Pods" },
                { value: "equal", label: "Equal" },
              ]}
            />
          </div>
        </div>

        {/* ── Body ─────────────────────────────────────────────────── */}
        {empty ? (
          <div className={style.empty}>No nodes found in the cluster.</div>
        ) : (
          <div className={style.body}>
            <div className={style.chartCard}>
              <div className={style.chartInner}>
                <ResponsiveTreemap
                  groups={groups}
                  sizeBy={sizeBy}
                  podCountMap={podCountMap}
                  filterText={(filterText ?? "").toLowerCase()}
                  highlightedGroupId={highlightedGroupId}
                />
              </div>
            </div>

            <SideLegend
              groups={groups}
              highlightedGroupId={highlightedGroupId}
              onToggle={(id) => {
                onLegendToggle(id);
                onFilterChange?.(highlightedGroupId === id ? "" : id);
              }}
              groupBy={groupBy}
            />
          </div>
        )}
      </div>
    );
  },
);

import { observer } from "mobx-react";
import { useState } from "react";
import { NodeClaim } from "../api/nodeclaim/nodeclaim-v1";
import { KarpenterCard } from "../components/KarpenterCard/KarpenterCard";
import { PieChart } from "../components/PieChart/pie-chart";
import style from "./dashboard.module.scss";
import {
  claimingByPoolName,
  nodePoolMatchesFilter,
  nodesOfPool,
  parseSearchTokens,
  STATUS_QUICK_FILTERS,
} from "./overview-filter";

import type { NodePool } from "../api/nodepool/nodepool-v1";
import type { CondStatus, Node } from "../utils/kube-helpers";

export interface OverviewTabProps {
  nodePools: NodePool[];
  nodes: Node[];
  nodeClaims: NodeClaim[];
  /** The search shared by the tabs: a click on a NodePool sets it. */
  search: string;
  setSearch: (search: string) => void;
}

/** The Overview tab: the limits charts of the NodePools that have nodes, and the list of NodePool cards. */
export const OverviewTab = observer(({ nodePools, nodes, nodeClaims, search, setSearch }: OverviewTabProps) => {
  const nodePoolsWithNodes = nodePools
    .map((nodePool) => ({ nodePool, nodes: nodesOfPool(nodes, nodePool.getName()) }))
    .filter((pool) => pool.nodes.length > 0);

  // NodeClaims that have been launched but not yet bound to a Node, per NodePool
  const claimingClaims = nodeClaims.filter((claim) => NodeClaim.isClaiming(claim));
  const claimingByPool: Record<string, number> = {};
  for (const claim of claimingClaims) {
    const pool = NodeClaim.getNodePoolName(claim) || "__unknown__";
    claimingByPool[pool] = (claimingByPool[pool] ?? 0) + 1;
  }

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <div className="row">
          <PieChart
            title={"Overview"}
            objects={nodePoolsWithNodes}
            nodes={nodes}
            limits={{ cpu: "1000m", memory: "2000m" }}
            activePool={search}
            onPoolClick={setSearch}
            activeFilter={search}
            onFilterChange={setSearch}
            claimingCount={claimingClaims.length}
            claimingByPool={claimingByPool}
          />
        </div>
      </div>
      <NodePoolList nodePools={nodePools} nodes={nodes} nodeClaims={nodeClaims} search={search} setSearch={setSearch} />
    </>
  );
});

const NodePoolList = observer(({ nodePools: allNodePools, nodes, nodeClaims, search, setSearch }: OverviewTabProps) => {
  const [showEmpty, setShowEmpty] = useState(false);
  const [quickStatuses, setQuickStatuses] = useState<CondStatus[]>([]);

  const tokens = parseSearchTokens(search);

  const toggleQuickStatus = (s: CondStatus) =>
    setQuickStatuses((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  const claimsByPool = claimingByPoolName(nodeClaims);
  const isEmpty = (poolName: string) =>
    nodesOfPool(nodes, poolName).length === 0 && (claimsByPool[poolName]?.length ?? 0) === 0;

  const allFiltered = allNodePools.filter((np) => {
    const poolName = np.getName();
    return nodePoolMatchesFilter(np, nodesOfPool(nodes, poolName), tokens, quickStatuses, claimsByPool[poolName] ?? []);
  });

  // Keep pools that have either nodes OR claiming NodeClaims, unless the empty ones are shown too
  const visibleNodePools = showEmpty ? allFiltered : allFiltered.filter((np) => !isEmpty(np.getName()));
  const emptyCount = allNodePools.filter((np) => isEmpty(np.getName())).length;

  const hasActiveFilter = search.trim() !== "" || quickStatuses.length > 0;

  return (
    <div className={style.nodePoolList}>
      {/* Header */}
      <div className={style.nodePoolListHeader}>
        <span>NodePools</span>
        <span className={style.nodePoolCount}>{visibleNodePools.length}</span>

        {/* Search input */}
        <div className={style.nodePoolSearchWrap}>
          <input
            className={style.nodePoolSearch}
            type="text"
            placeholder="Filter… (name, status:ready, type:m5.xlarge)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search.trim() && (
            <button className={style.nodePoolSearchClear} onClick={() => setSearch("")} title="Clear">
              ✕
            </button>
          )}
        </div>

        {/* Status quick-filter chips */}
        <div className={style.quickFilters}>
          {STATUS_QUICK_FILTERS.map(({ status, label, color }) => {
            const active = quickStatuses.includes(status);
            return (
              <button
                key={status}
                className={`${style.quickFilterChip}${active ? ` ${style.quickFilterChipActive}` : ""}`}
                style={active ? { borderColor: color, color, background: `${color}22` } : { color }}
                onClick={() => toggleQuickStatus(status)}
                title={`Show only pools with ${label} nodes`}
              >
                ● {label}
              </button>
            );
          })}
        </div>

        {emptyCount > 0 && (
          <button
            onClick={() => setShowEmpty((v) => !v)}
            className={`${style.nodePoolEmptyBtn}${showEmpty ? ` ${style.nodePoolEmptyBtnActive}` : ""}`}
            title={showEmpty ? "Hide NodePools with no nodes" : "Show NodePools with no nodes"}
          >
            {showEmpty ? "Hide empty" : `+${emptyCount} empty`}
          </button>
        )}
      </div>

      {visibleNodePools.map((nodePool) => {
        const poolName = nodePool.getName();
        return (
          <div key={nodePool.metadata.uid ?? poolName}>
            <KarpenterCard
              nodePool={nodePool}
              nodes={nodesOfPool(nodes, poolName)}
              claims={claimsByPool[poolName] ?? []}
            />
          </div>
        );
      })}

      {visibleNodePools.length === 0 && hasActiveFilter && (
        <div className={style.noResults}>No NodePools match the current filters.</div>
      )}
    </div>
  );
});

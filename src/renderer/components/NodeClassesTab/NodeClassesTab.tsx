import { observer } from "mobx-react";
import React, { useState } from "react";
import { NODE_CLASS_KIND, openNodeClassDetail, servedNodeClassProviders } from "../../data/nodeclass";
import {
  getAKSNodeClassStore,
  getEC2NodeClassStore,
  getGCENodeClassStore,
  getNodePoolStore,
  getNodeStore,
} from "../../data/stores";
import { getNodeClassStatus, getNodePoolStatus, openNodePoolDetail } from "../../utils/kube-helpers";
import { StatusBadge } from "../shared/StatusBadge";
import {
  countNodesByPool,
  type NodeClass,
  nodeClassesEmptyMessage,
  nodeClassMetaItems,
  nodeClassProvider,
  nodePoolRowValues,
  nodePoolsOfNodeClass,
} from "./nodeclass-card";
import style from "./nodeclasses-tab.module.scss";

import type { NodePool } from "../../api/nodepool/nodepool-v1";

// ── NodePool row inside a NodeClass ──────────────────────────────────────────

/** The parent counts the nodes of every NodePool once, and passes each row its count. */
function NodePoolRow({ nodePool, nodeCount }: { nodePool: NodePool; nodeCount: number }) {
  const name = nodePool.metadata?.name ?? "—";
  const status = getNodePoolStatus(nodePool);
  const { cpuUsed, memoryUsed, limitCpu, limitMemory, consolidation, expireAfter } = nodePoolRowValues(nodePool);

  return (
    <tr className={style.poolRow} onClick={() => openNodePoolDetail(nodePool)} title="Click to open NodePool details">
      <td className={style.poolName}>
        <span className={style.poolIcon}>🌊</span>
        {name}
      </td>
      <td>
        <StatusBadge status={status} compact />
      </td>
      <td className={style.mono}>{nodeCount}</td>
      <td className={style.mono}>{cpuUsed}</td>
      <td className={style.mono}>{memoryUsed}</td>
      <td className={style.mono}>
        {limitCpu} / {limitMemory}
      </td>
      <td className={style.mono}>{consolidation}</td>
      <td className={style.mono}>{expireAfter}</td>
      <td className={style.clickHint}>↗</td>
    </tr>
  );
}

// ── NodeClass card ────────────────────────────────────────────────────────────

// An observer: it reads the NodePool and node stores while it renders.
const NodeClassCard = observer(({ nodeClass }: { nodeClass: NodeClass }) => {
  const [expanded, setExpanded] = useState(true);
  const name = nodeClass.metadata?.name ?? "—";
  const status = getNodeClassStatus(nodeClass);
  const provider = nodeClassProvider(nodeClass);
  const kindLabel = NODE_CLASS_KIND[provider];
  const metaItems = nodeClassMetaItems(nodeClass);
  const associatedPools = nodePoolsOfNodeClass(nodeClass, getNodePoolStore()?.items ?? []);
  const nodeCountMap = countNodesByPool(getNodeStore().items);

  return (
    <div className={style.nodeClassCard}>
      {/* Header */}
      <div className={style.nodeClassHeader} onClick={() => setExpanded((e) => !e)}>
        <div className={style.nodeClassTitleRow}>
          <span className={style.nodeClassIcon}>⚙️</span>
          <span className={style.nodeClassKind}>{kindLabel}</span>
          <span
            className={style.nodeClassName}
            onClick={(event) => {
              // Keeps the click from the header around it, which expands and collapses the card.
              event.stopPropagation();
              openNodeClassDetail(name, provider);
            }}
            title={`Open ${kindLabel} details`}
          >
            {name} <span className={style.extLink}>↗</span>
          </span>
          <StatusBadge status={status} compact />
          <span className={style.poolCountBadge}>
            {associatedPools.length} NodePool{associatedPools.length !== 1 ? "s" : ""}
          </span>
          <span className={style.expandChevron}>{expanded ? "▾" : "▸"}</span>
        </div>

        {/* Quick info row — unified for AWS, Azure and GCP */}
        {metaItems.length > 0 && (
          <div className={style.nodeClassMeta}>
            {metaItems.map(({ label, value }) => (
              <span key={label} className={style.metaItem}>
                <span className={style.metaLabel}>{label}</span> {value}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* NodePools table */}
      {expanded && (
        <div className={style.poolsContainer}>
          {associatedPools.length === 0 ? (
            <div className={style.noPools}>No NodePools associated</div>
          ) : (
            <table className={style.poolsTable}>
              <colgroup>
                {/* NodePool */}
                <col style={{ width: "20%" }} />
                {/* Status */}
                <col style={{ width: "10%" }} />
                {/* Nodes */}
                <col style={{ width: "6%" }} />
                {/* CPU Used */}
                <col style={{ width: "10%" }} />
                {/* Memory Used */}
                <col style={{ width: "12%" }} />
                {/* Limits */}
                <col style={{ width: "14%" }} />
                {/* Consolidation */}
                <col style={{ width: "16%" }} />
                {/* Expire After */}
                <col style={{ width: "10%" }} />
                {/* arrow */}
                <col style={{ width: "2%" }} />
              </colgroup>
              <thead>
                <tr>
                  <th>NodePool</th>
                  <th>Status</th>
                  <th>Nodes</th>
                  <th>CPU Used</th>
                  <th>Memory Used</th>
                  <th>Limits CPU/Mem</th>
                  <th>Consolidation</th>
                  <th>Expire After</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {associatedPools.map((np) => (
                  <NodePoolRow
                    key={np.metadata?.uid ?? np.metadata?.name}
                    nodePool={np}
                    nodeCount={nodeCountMap[np.metadata?.name ?? ""] ?? 0}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
});

// ── Main tab component ────────────────────────────────────────────────────────

export const NodeClassesTab: React.FC = observer(() => {
  // Merge items from the AWS, Azure and GCP stores; only the APIs the cluster serves have one.
  const nodeClasses: NodeClass[] = [
    ...(getEC2NodeClassStore()?.items ?? []),
    ...(getAKSNodeClassStore()?.items ?? []),
    ...(getGCENodeClassStore()?.items ?? []),
  ];
  const [search, setSearch] = useState("");

  const filtered = search.trim()
    ? nodeClasses.filter((nc) => (nc.metadata?.name ?? "").toLowerCase().includes(search.trim().toLowerCase()))
    : nodeClasses;

  const emptyMessage = nodeClassesEmptyMessage(servedNodeClassProviders(), nodeClasses.length > 0);

  return (
    <div className={style.tabRoot}>
      {/* Header */}
      <div className={style.tabHeader}>
        <div className={style.tabHeaderLeft}>
          <h2 className={style.tabTitle}>Node Classes</h2>
          <span className={style.countBadge}>{filtered.length}</span>
        </div>
        <input
          className={style.searchInput}
          type="text"
          placeholder="Filter by name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Cards */}
      {filtered.length === 0 ? (
        <div className={style.empty}>{emptyMessage}</div>
      ) : (
        <div className={style.cardList}>
          {filtered.map((nc) => (
            <NodeClassCard key={nc.metadata?.uid ?? nc.metadata?.name} nodeClass={nc} />
          ))}
        </div>
      )}
    </div>
  );
});

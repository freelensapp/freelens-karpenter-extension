import { observer } from "mobx-react";
import React, { useMemo, useState } from "react";
import { getEC2NodeClassStore } from "../../k8s/karpenter/ec2nodeclass-store";
import { getAKSNodeClassStore } from "../../k8s/karpenter/aksNodeclass-store";
import { getNodePoolStore } from "../../k8s/karpenter/store";
import { getNodeStore } from "../../k8s/core/node-store";
import {
  openNodeClassDetail,
  NODE_CLASS_KIND,
  type NodeClassProvider,
} from "../../k8s/karpenter/nodeclass-utils";
import {
  openCrdDetail,
  getNodePoolStatus,
  getNodeClassStatus,
} from "../../utils/kube-helpers";
import { StatusBadge } from "../shared/StatusBadge";
import style from "./nodeclasses-tab.module.scss";
import styleInline from "./nodeclasses-tab.module.scss?inline";

// ── NodePool row inside a NodeClass ──────────────────────────────────────────

/**
 * NodePoolRow receives pre-filtered `nodeCount` from the parent
 * to avoid running nodeStore.items.filter() inside every row.
 */
function NodePoolRow({
  nodePool,
  nodeCount,
}: {
  nodePool: any;
  nodeCount: number;
}) {
  const name: string = nodePool.metadata?.name ?? "—";
  const status = getNodePoolStatus(nodePool);

  const totalCpu = (nodePool as any).status?.resources?.cpu ?? "—";
  const totalMemory = (nodePool as any).status?.resources?.memory ?? "—";

  // Disruption policy
  const consolidation =
    (nodePool as any).spec?.disruption?.consolidationPolicy ?? "—";
  const expireAfter =
    (nodePool as any).spec?.disruption?.expireAfter ?? "—";

  // Limits
  const limitCpu = (nodePool as any).spec?.limits?.cpu ?? "—";
  const limitMemory = (nodePool as any).spec?.limits?.memory ?? "—";

  return (
    <tr
      className={style.poolRow}
      onClick={() =>
        openCrdDetail(`/apis/karpenter.sh/v1/nodepools/${name}`)
      }
      title="Click to open NodePool details"
    >
      <td className={style.poolName}>
        <span className={style.poolIcon}>🌊</span>
        {name}
      </td>
      <td>
        <StatusBadge status={status} compact />
      </td>
      <td className={style.mono}>{nodeCount}</td>
      <td className={style.mono}>{totalCpu}</td>
      <td className={style.mono}>{totalMemory}</td>
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

function NodeClassCard({ nodeClass }: { nodeClass: any }) {
  const [expanded, setExpanded] = useState(true);
  const nodePoolStore = getNodePoolStore();
  const nodeStore = getNodeStore();
  const name: string = nodeClass.metadata?.name ?? "—";
  const status = getNodeClassStatus(nodeClass);

  // Detect provider from apiVersion
  const apiVersion: string = nodeClass.apiVersion ?? "";
  const provider: NodeClassProvider = apiVersion.includes("azure") ? "azure" : "aws";
  const kindLabel = NODE_CLASS_KIND[provider];
  const spec = (nodeClass as any).spec ?? {};

  // Build a unified list of meta items — same structure for AWS and Azure
  const metaItems: { label: string; value: string | number }[] = [];

  if (provider === "aws") {
    if (spec.amiFamily)        metaItems.push({ label: "Image Family",     value: spec.amiFamily });
    if (spec.instanceProfile ?? spec.role)
                               metaItems.push({ label: "Instance Profile", value: spec.instanceProfile ?? spec.role });
    const amiCount = (spec.amiSelectorTerms ?? []).length;
    if (amiCount > 0)          metaItems.push({ label: "AMI Selectors",    value: amiCount });
    const subnetCount = (spec.subnetSelectorTerms ?? []).length;
    if (subnetCount > 0)       metaItems.push({ label: "Subnets",          value: subnetCount });
    const sgCount = (spec.securityGroupSelectorTerms ?? []).length;
    if (sgCount > 0)           metaItems.push({ label: "Security Groups",  value: sgCount });
  } else {
    if (spec.imageFamily)      metaItems.push({ label: "Image Family",     value: spec.imageFamily });
    if (spec.osDiskSizeGB != null)
                               metaItems.push({ label: "OS Disk",          value: `${spec.osDiskSizeGB} GB` });
    if (spec.kubeletConfig)    metaItems.push({ label: "Kubelet Config",   value: "✓" });
    const subnetCount = (spec.subnetSelectorTerms ?? []).length;
    if (subnetCount > 0)       metaItems.push({ label: "Subnets",          value: subnetCount });
  }

  // Associated NodePools — memoized to avoid filtering on every render
  const associatedPools = useMemo(
    () =>
      nodePoolStore.items.filter(
        (np: any) => np.spec?.template?.spec?.nodeClassRef?.name === name
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nodePoolStore.items.length, name]
  );

  // Node counts per NodePool — computed once, passed down as props
  const nodeCountMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const node of nodeStore.items as any[]) {
      const pool: string = node.metadata?.labels?.["karpenter.sh/nodepool"] ?? "";
      if (pool) map[pool] = (map[pool] ?? 0) + 1;
    }
    return map;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeStore.items.length]);

  return (
    <div className={style.nodeClassCard}>
      <style>{styleInline}</style>

      {/* Header */}
      <div
        className={style.nodeClassHeader}
        onClick={() => setExpanded(e => !e)}
      >
        <div className={style.nodeClassTitleRow}>
          <span className={style.nodeClassIcon}>⚙️</span>
          <span className={style.nodeClassKind}>{kindLabel}</span>
          <span
            className={style.nodeClassName}
            onClick={e => {
              e.stopPropagation();
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

        {/* Quick info row — unified for both AWS and Azure */}
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
                <col style={{ width: "20%" }} />  {/* NodePool */}
                <col style={{ width: "10%" }} />  {/* Status */}
                <col style={{ width: "6%" }} />   {/* Nodes */}
                <col style={{ width: "10%" }} />  {/* CPU Used */}
                <col style={{ width: "12%" }} />  {/* Memory Used */}
                <col style={{ width: "14%" }} />  {/* Limits */}
                <col style={{ width: "16%" }} />  {/* Consolidation */}
                <col style={{ width: "10%" }} />  {/* Expire After */}
                <col style={{ width: "2%" }} />   {/* arrow */}
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
                {associatedPools.map((np: any) => (
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
}

// ── Main tab component ────────────────────────────────────────────────────────

export const NodeClassesTab: React.FC = observer(() => {
  const ec2NodeClassStore = getEC2NodeClassStore();
  const aksNodeClassStore = getAKSNodeClassStore();
  // Merge items from both AWS and Azure stores
  const nodeClasses = [
    ...(ec2NodeClassStore?.items ?? []),
    ...(aksNodeClassStore?.items ?? []),
  ];
  const [search, setSearch] = useState("");

  const filtered = search.trim()
    ? nodeClasses.filter((nc: any) =>
        (nc.metadata?.name ?? "").toLowerCase().includes(search.trim().toLowerCase())
      )
    : nodeClasses;

  const emptyMessage = (ec2NodeClassStore?.items.length ?? 0) === 0 && (aksNodeClassStore?.items.length ?? 0) === 0
    ? "No NodeClasses found (checked EC2NodeClass and AKSNodeClass)"
    : "No results for this filter";

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
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Cards */}
      {filtered.length === 0 ? (
        <div className={style.empty}>{emptyMessage}</div>
      ) : (
        <div className={style.cardList}>
          {filtered.map((nc: any) => (
            <NodeClassCard key={nc.metadata?.uid ?? nc.metadata?.name} nodeClass={nc} />
          ))}
        </div>
      )}
    </div>
  );
});

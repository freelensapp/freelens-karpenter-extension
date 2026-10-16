import { Renderer } from "@freelensapp/extensions";
import { observer } from "mobx-react";
import React, { useMemo, useState } from "react";
import svgIconNode from "../../../../assets/node1.svg?raw"; // must be `?raw` as we need SVG element
import { NodeClaim } from "../../api/nodeclaim/nodeclaim-v1";
import { NodeOverlay } from "../../api/nodeoverlay/nodeoverlay-v1alpha1";
import { NodePool } from "../../api/nodepool/nodepool-v1";
import { COLOR, ICON, LABEL, STATUS_BORDER_COLOR } from "../../config/theme";
import { detectProvider, openNodeClassDetail } from "../../data/nodeclass";
import { getNodeOverlayStore } from "../../data/stores";
import { fmtAgo, useKarpenterCardData, usePoolEvents } from "../../hooks/useKarpenterData";
import { eventTs, eventVisual, type KarpenterEvent } from "../../utils/karpenter-events";
import {
  getInstanceType,
  getNodeClaimName,
  getNodeCpu,
  getNodeMaxPods,
  getNodeMemory,
  getNodePoolStatus,
  getNodeStatus,
  openNodeClaimDetail,
  openNodeDetail,
  openNodeOverlayDetail,
  openNodePoolDetail,
  parseCpuCores,
  parseMemGi,
} from "../../utils/kube-helpers";
import { CardLoadingSkeleton, Spinner } from "../shared/LoadingSkeleton";
import { StatusBadge } from "../shared/StatusBadge";
import { formatUsage, getNodeClaimInstanceType } from "./card-utils";
import style from "./karpentercard.module.scss";

import type { ResourceList } from "../../api/types";

const {
  Component: { Icon },
} = Renderer;

type Node = Renderer.K8sApi.Node;

// ── Pool event timeline ────────────────────────────────────────────────────────

const PoolEventTimeline = observer(function PoolEventTimeline({
  poolName,
  nodeNames,
  claimNames,
}: {
  poolName: string;
  nodeNames: string[];
  claimNames: string[];
}) {
  const nodeNameSet = useMemo(() => new Set(nodeNames), [nodeNames.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  const claimNameSet = useMemo(() => new Set(claimNames), [claimNames.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  const { allMatchedEvents, isLoading, refresh } = usePoolEvents(poolName, nodeNameSet, claimNameSet);

  if (isLoading) {
    return (
      <div className={style.historyEmpty} style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Spinner size={12} /> Loading events…
      </div>
    );
  }

  if (allMatchedEvents.length === 0) {
    return (
      <div className={style.historyEmpty}>
        No events found for <strong>{poolName}</strong>.{" "}
        <button type="button" onClick={refresh} className={style.historyRefresh}>
          &#x21BB; Refresh
        </button>
      </div>
    );
  }

  return (
    <div className={style.historyChart}>
      <table className={style.eventTable}>
        <colgroup>
          <col style={{ width: "5%" }} />
          <col style={{ width: "14%" }} />
          <col style={{ width: "16%" }} />
          <col style={{ width: "30%" }} />
          <col style={{ width: "35%" }} />
        </colgroup>
        <thead>
          <tr>
            <th></th>
            <th>Age</th>
            <th>Reason</th>
            <th>Object</th>
            <th>Message</th>
          </tr>
        </thead>
        <tbody>
          {allMatchedEvents.map((e, i) => (
            <EventRow key={e.metadata?.uid ?? i} event={e} />
          ))}
        </tbody>
      </table>
    </div>
  );
});

// ── EventRow ──────────────────────────────────────────────────────────────────

function EventRow({ event: e }: { event: KarpenterEvent }) {
  const reason = e.reason ?? "";
  const cfg = eventVisual(e);
  const ts = eventTs(e);

  return (
    <tr className={style.eventRow}>
      <td style={{ color: cfg.color, textAlign: "center", fontWeight: 700 }}>{cfg.icon}</td>
      <td className={style.eventAge} title={ts ? new Date(ts).toLocaleString() : ""}>
        {fmtAgo(ts)}
      </td>
      <td style={{ color: cfg.color }} className={style.eventReason}>
        {reason}
      </td>
      <td className={style.eventObject}>
        <span className={style.eventKind}>{e.involvedObject?.kind ?? ""}</span>
        <span className={style.eventName}>{e.involvedObject?.name ?? "—"}</span>
      </td>
      <td className={style.eventMessage}>{e.message}</td>
    </tr>
  );
}

// ── View toggle ───────────────────────────────────────────────────────────────

type ViewMode = "table" | "cards";

function ViewToggle({ mode, onChange }: { mode: ViewMode; onChange: (m: ViewMode) => void }) {
  return (
    <div className={style.viewToggle}>
      <ToggleButton active={mode === "table"} onClick={() => onChange("table")} title="Table view">
        {LABEL.tableBtn}
      </ToggleButton>
      <ToggleButton active={mode === "cards"} onClick={() => onChange("cards")} title="Card view">
        {LABEL.cardsBtn}
      </ToggleButton>
    </div>
  );
}

function ToggleButton({
  active,
  onClick,
  title,
  children,
  style: extraStyle,
}: {
  active: boolean;
  onClick: () => void;
  title?: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <button
      className={`${style.toggleBtn} ${active ? style.toggleActive : ""}`}
      onClick={onClick}
      title={title}
      style={extraStyle}
    >
      {children}
    </button>
  );
}

// ── Table view ────────────────────────────────────────────────────────────────

export const NodesList = ({
  nodes,
  claims = [],
  podCountMap,
}: {
  nodes: Node[];
  claims?: NodeClaim[];
  podCountMap: Record<string, number>;
}) => (
  <table className={style.nodesTable}>
    <colgroup>
      <col style={{ width: "34%" }} />
      <col style={{ width: "22%" }} />
      <col style={{ width: "10%" }} />
      <col style={{ width: "10%" }} />
      <col style={{ width: "7%" }} />
      <col style={{ width: "7%" }} />
      <col style={{ width: "7%" }} />
      <col style={{ width: "3%" }} />
    </colgroup>
    <thead>
      <tr>
        <th>Node</th>
        <th>NodeClaim</th>
        <th>Type</th>
        <th>Status</th>
        <th>CPU</th>
        <th>Memory</th>
        <th>Pods</th>
        <th></th>
      </tr>
    </thead>
    <tbody>
      {nodes.map((node, idx) => {
        if (!node?.metadata) return null;
        const nodeName = node.metadata?.name ?? "";
        const maxPods = getNodeMaxPods(node);
        const runningPods = podCountMap[nodeName] ?? -1;
        const podLabel = maxPods > 0 ? (runningPods >= 0 ? `${runningPods}/${maxPods}` : `—/${maxPods}`) : "—";
        return (
          <tr
            key={node.metadata?.uid ?? nodeName ?? idx}
            onClick={(event) => {
              event.stopPropagation();
              openNodeDetail(node);
            }}
            title="Click to open node details"
          >
            <td>
              <span className={style.nodeNameCell}>
                <span className={style.nodeIcon}>{ICON.node}</span>
                <span className={style.nodeName}>{nodeName}</span>
              </span>
            </td>
            <td>
              <span className={style.monoSmall}>{getNodeClaimName(node) || "—"}</span>
            </td>
            <td>
              <span className={style.monoSmall}>{getInstanceType(node)}</span>
            </td>
            <td>
              <StatusBadge status={getNodeStatus(node)} />
            </td>
            <td className={style.monoSmall}>{getNodeCpu(node)}</td>
            <td className={style.monoSmall}>{getNodeMemory(node)}</td>
            <td className={style.monoSmall}>{podLabel}</td>
            <td className={style.clickHint}>{ICON.external}</td>
          </tr>
        );
      })}
      {claims.map((claim, idx) => {
        const claimName = claim.metadata?.name ?? "";
        return (
          <tr
            key={`claim-${claim.metadata?.uid ?? claimName ?? idx}`}
            onClick={(event) => {
              // As every link to details here: an open drawer would take the click for one outside itself and close
              // the details just opened (B14).
              event.stopPropagation();
              openNodeClaimDetail(claimName);
            }}
            title="Click to open NodeClaim details"
          >
            <td>
              <span className={style.nodeNameCell}>
                <span className={style.nodeIcon}>{ICON.nodeclaim}</span>
                <span className={style.nodeName} style={{ color: COLOR.textSecondary, fontStyle: "italic" }}>
                  (pending)
                </span>
              </span>
            </td>
            <td>
              <span className={style.monoSmall}>{claimName || "—"}</span>
            </td>
            <td>
              <span className={style.monoSmall}>{getNodeClaimInstanceType(claim)}</span>
            </td>
            <td>
              <StatusBadge status="Claiming" />
            </td>
            <td className={style.monoSmall}>—</td>
            <td className={style.monoSmall}>—</td>
            <td className={style.monoSmall}>—</td>
            <td className={style.clickHint}>{ICON.external}</td>
          </tr>
        );
      })}
    </tbody>
  </table>
);

// ── Tree (cards) view ─────────────────────────────────────────────────────────

function TreeLeaf({
  icon,
  kind,
  name,
  extra,
  color,
  onClick,
}: {
  icon: string;
  kind: string;
  name: string;
  extra?: React.ReactNode;
  color?: string;
  onClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      className={`${style.treeLeaf}${onClick ? ` ${style.treeClickable}` : ""}`}
      style={{ borderLeft: `3px solid ${color ?? COLOR.border}` }}
      onClick={onClick}
      title={onClick ? "Click to open details" : undefined}
    >
      <div className={style.treeLeafHeader}>
        <span className={style.treeLeafIcon}>{icon}</span>
        <span className={style.treeLeafKind}>{kind}</span>
        <span className={style.treeLeafName}>{name}</span>
      </div>
      {extra && <div className={style.treeLeafExtra}>{extra}</div>}
    </div>
  );
}

function NodePairRow({ node, podCountMap }: { node: Node; podCountMap: Record<string, number> }) {
  const status = getNodeStatus(node);
  const claimName = getNodeClaimName(node);
  const nodeName = node.metadata?.name ?? "";
  const maxPods = getNodeMaxPods(node);
  const running = podCountMap[nodeName] ?? -1;
  const podLabel = maxPods > 0 ? `${ICON.pod} ${running >= 0 ? running : "—"}/${maxPods} pods` : "";
  const color = STATUS_BORDER_COLOR[status] ?? "#888";

  return (
    <div className={style.treePairRow}>
      <div className={style.treeConnector} />
      <div className={style.treePairLeaves}>
        <TreeLeaf
          icon={ICON.nodeclaim}
          kind="NodeClaim"
          name={claimName || "—"}
          color={COLOR.nodeclaim}
          onClick={
            claimName
              ? (event) => {
                  event.stopPropagation();
                  openNodeClaimDetail(claimName);
                }
              : undefined
          }
        />
        <div className={style.treePairArrow}>{ICON.arrow}</div>
        <TreeLeaf
          icon={ICON.node}
          kind="Node"
          name={nodeName}
          color={color}
          onClick={(event) => {
            event.stopPropagation();
            openNodeDetail(node);
          }}
          extra={
            <div className={style.treeLeafStats}>
              <StatusBadge status={status} />
              <span className={style.nodeCardStat}>
                {ICON.cpu} {getNodeCpu(node)}
              </span>
              <span className={style.nodeCardStat}>
                {ICON.memory} {getNodeMemory(node)}
              </span>
              {podLabel && <span className={style.nodeCardStat}>{podLabel}</span>}
            </div>
          }
        />
      </div>
    </div>
  );
}

function NodesTree({ nodes, podCountMap }: { nodes: Node[]; podCountMap: Record<string, number> }) {
  return (
    <div className={style.tree}>
      <div className={style.treeChildren} style={{ paddingLeft: 0, borderLeft: "none", marginLeft: 0 }}>
        {nodes.map((node, idx) => {
          if (!node?.metadata) return null;
          return (
            <NodePairRow key={node.metadata?.uid ?? node.metadata?.name ?? idx} node={node} podCountMap={podCountMap} />
          );
        })}
      </div>
    </div>
  );
}

// ── Resource overview bars ────────────────────────────────────────────────────

function OverviewBar({
  label,
  used,
  total,
  color,
  unitFmt,
}: {
  label: string;
  used: number;
  /** The limit of the NodePool, or `undefined` when it sets none. */
  total: number | undefined;
  color: string;
  unitFmt: (v: number) => string;
}) {
  const pct = total !== undefined && total > 0 ? Math.min(100, (used / total) * 100) : 0;
  return (
    <div className={style.overviewBar}>
      <div className={style.overviewBarHeader}>
        <span className={style.overviewBarLabel}>{label}</span>
        <span className={style.overviewBarValue}>{formatUsage(used, total, unitFmt)}</span>
      </div>
      <div className={style.overviewBarTrack}>
        <div className={style.overviewBarFill} style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

function InlineOverview({ resources, limits }: { resources?: ResourceList; limits?: ResourceList }) {
  return (
    <div className={style.inlineOverview}>
      <OverviewBar
        label="CPU"
        used={parseCpuCores(resources?.cpu ?? "0")}
        total={limits?.cpu === undefined ? undefined : parseCpuCores(limits.cpu)}
        color={COLOR.cpu}
        unitFmt={(v) => v.toFixed(1)}
      />
      <OverviewBar
        label="Memory"
        used={parseMemGi(resources?.memory ?? "0")}
        total={limits?.memory === undefined ? undefined : parseMemGi(limits.memory)}
        color={COLOR.memory}
        unitFmt={(v) => (v >= 1 ? `${v.toFixed(1)}Gi` : `${(v * 1024).toFixed(0)}Mi`)}
      />
    </div>
  );
}

// ── Info bar (NodeClass + NodePool pills + instance type chips) ───────────────

function CardInfoBar({
  nodePool,
  instanceTypeCounts,
}: {
  nodePool: NodePool;
  instanceTypeCounts: Record<string, number>;
}) {
  const nodeClassRef = NodePool.getTemplateSpec(nodePool)?.nodeClassRef;
  const nodeClassName = nodeClassRef?.name ?? "—";
  const nodeClassKind = nodeClassRef?.kind ?? "EC2NodeClass";
  const provider = detectProvider(nodeClassRef);
  const poolName = nodePool.metadata?.name ?? "";
  const poolStatus = getNodePoolStatus(nodePool);
  const expireAfter = NodePool.getTemplateSpec(nodePool)?.expireAfter ?? null;

  return (
    <div className={style.cardInfoBar}>
      <InfoPill
        kind={`${ICON.nodeclass} ${nodeClassKind}`}
        name={nodeClassName}
        onClick={(event) => {
          event.stopPropagation();
          openNodeClassDetail(nodeClassName, provider);
        }}
        title={`Open ${nodeClassKind} ${nodeClassName}`}
      />

      <span className={style.infoSep}>{ICON.arrow}</span>

      <InfoPill
        kind={`${ICON.nodepool} NodePool`}
        name={poolName}
        onClick={(event) => {
          event.stopPropagation();
          openNodePoolDetail(nodePool);
        }}
        title={`Open NodePool ${poolName}`}
        badge={<StatusBadge status={poolStatus} />}
      />

      {Object.keys(instanceTypeCounts).length > 0 && (
        <div className={style.infoMeta}>
          {Object.entries(instanceTypeCounts).map(([type, count]) => (
            <span key={type} className={style.infoTypeChip}>
              {ICON.node} {type}
              {count > 1 && <span className={style.infoTypeCount}> x{count}</span>}
            </span>
          ))}
        </div>
      )}

      {expireAfter && (
        <div className={style.infoMeta}>
          <span className={style.infoMetaItem}>
            <span className={style.infoMetaLabel}>Expire after:</span> {expireAfter}
          </span>
        </div>
      )}

      <NodeOverlayMeta nodePool={nodePool} />
    </div>
  );
}

/** The NodeOverlays that can apply to the NodePool's nodes, the one that takes precedence first (C5). */
const NodeOverlayMeta = observer(function NodeOverlayMeta({ nodePool }: { nodePool: NodePool }) {
  const overlays = NodeOverlay.forNodePool(getNodeOverlayStore()?.items ?? [], nodePool);
  if (overlays.length === 0) return null;

  return (
    <div className={style.infoMeta}>
      <span className={style.infoMetaItem}>
        <span className={style.infoMetaLabel}>{overlays.length === 1 ? "Overlay:" : "Overlays:"}</span>
        {overlays.map((overlay) => {
          const changes = NodeOverlay.describe(overlay).join(", ");
          return (
            <span key={overlay.getName()} className={style.overlayItem}>
              <a
                onClick={(event) => {
                  event.stopPropagation();
                  openNodeOverlayDetail(overlay.getName());
                }}
                title={`Open NodeOverlay ${overlay.getName()} (weight ${NodeOverlay.getWeight(overlay)})`}
              >
                {overlay.getName()}
              </a>
              {changes && ` (${changes})`}
            </span>
          );
        })}
      </span>
    </div>
  );
});

function InfoPill({
  kind,
  name,
  onClick,
  title,
  badge,
}: {
  kind: string;
  name: string;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  title: string;
  badge?: React.ReactNode;
}) {
  return (
    <button className={style.infoPill} onClick={onClick} title={title}>
      <span className={style.infoPillKind}>{kind}</span>
      <span className={style.infoPillName}>{name}</span>
      {badge}
      <span className={style.infoPillArrow}>{ICON.external}</span>
    </button>
  );
}

// ── KarpenterCard ─────────────────────────────────────────────────────────────

export const KarpenterCard = observer(function KarpenterCard({
  nodePool,
  nodes,
  claims = [],
}: {
  nodePool: NodePool;
  nodes: Node[];
  claims?: NodeClaim[];
}) {
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [showHistory, setShowHistory] = useState(false);

  const { podCountMap, instanceTypeCounts, isLoading } = useKarpenterCardData(nodes);

  if (!nodePool?.metadata) {
    return <div style={{ color: COLOR.danger }}>No NodePool provided</div>;
  }

  if (isLoading) {
    return <CardLoadingSkeleton />;
  }

  const poolName = nodePool.metadata?.name ?? "";
  const poolStatus = getNodePoolStatus(nodePool);
  const limits = nodePool.spec?.limits;
  const resources = nodePool.status?.resources;

  return (
    <>
      <div
        className={style.cardRoot}
        data-status={poolStatus}
        style={{ borderLeftColor: STATUS_BORDER_COLOR[poolStatus] }}
      >
        {/* Top row */}
        <div className={style.cardTopRow}>
          <div className={style.cardTopLeft}>
            <div className={style.cardTitle}>
              {poolName}
              <span className={style.cardNodeCount}>
                {nodes.length} node{nodes.length !== 1 ? "s" : ""}
                {claims.length > 0 && (
                  <span style={{ marginLeft: 8, color: COLOR.claiming, fontWeight: 600 }}>
                    +{claims.length} claiming
                  </span>
                )}
              </span>
            </div>
            <CardInfoBar nodePool={nodePool} instanceTypeCounts={instanceTypeCounts} />
          </div>
          <div className={style.cardCharts}>
            <InlineOverview resources={resources} limits={limits} />
          </div>
        </div>

        {/* Body */}
        <div className={style.cardBody}>
          {nodes.length === 0 && claims.length === 0 ? (
            <div className={style.emptyNodes}>{LABEL.noNodes}</div>
          ) : (
            <>
              <div className={style.cardBodyHeader}>
                <ViewToggle mode={viewMode} onChange={setViewMode} />
                <ToggleButton
                  active={showHistory}
                  onClick={() => setShowHistory((v) => !v)}
                  title="Toggle scaling event history"
                  style={{ marginLeft: 8 }}
                >
                  {ICON.events} {LABEL.eventsBtn}
                </ToggleButton>
              </div>

              {showHistory && (
                <PoolEventTimeline
                  poolName={poolName}
                  nodeNames={nodes.map((n) => n.metadata?.name ?? "").filter(Boolean)}
                  claimNames={[
                    ...nodes.map((n) => getNodeClaimName(n)).filter(Boolean),
                    ...claims.map((c) => c.metadata?.name ?? "").filter(Boolean),
                  ]}
                />
              )}

              {viewMode === "table" ? (
                <NodesList nodes={nodes} claims={claims} podCountMap={podCountMap} />
              ) : (
                <NodesTree nodes={nodes} podCountMap={podCountMap} />
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
});

// ── Exported icon components ──────────────────────────────────────────────────

export function NodeIcon(props: Renderer.Component.IconProps) {
  return <Icon {...props} svg={svgIconNode} />;
}

export function NodeIcon1(props: Renderer.Component.IconProps & { colorstatus?: string }) {
  const svg = props.colorstatus
    ? svgIconNode.replace(/fill="pass-as-props"/g, `fill="${props.colorstatus}"`)
    : svgIconNode;
  return <Icon {...props} svg={svg} />;
}

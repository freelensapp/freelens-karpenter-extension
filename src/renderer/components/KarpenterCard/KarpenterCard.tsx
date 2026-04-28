import svgIconNode from "../../../../assets/node1.svg?raw"; // must be `?raw` as we need SVG element
import styleInline from "./karpentercard.module.scss?inline";
import style from "./karpentercard.module.scss";
import { Renderer } from "@freelensapp/extensions";
import { type NodePool } from "../../k8s/karpenter/store";
import { type Node } from "../../k8s/core/node-store";
import React, { useMemo, useState } from "react";
import { detectProvider, openNodeClassDetail } from "../../k8s/karpenter/nodeclass-utils";
import { StatusBadge } from "../shared/StatusBadge";
import { CardLoadingSkeleton, Spinner } from "../shared/LoadingSkeleton";
import { getKubeEventStore, type RawKubeEvent } from "../../k8s/core/karpenter-events-store";
import { observer } from "mobx-react";
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
  openNodePoolDetail,
  parseCpuCores,
  parseMemGi,
} from "../../utils/kube-helpers";
import {
  COLOR,
  EVENT_REASON_CONFIG,
  EVENT_REASON_FALLBACK,
  ICON,
  LABEL,
  STATUS_BORDER_COLOR,
  TIMING,
} from "../../config/theme";
import {
  useKarpenterCardData,
  usePoolEvents,
  eventTs,
  fmtAgo,
} from "../../hooks/useKarpenterData";

const {
  Component: { Icon },
} = Renderer;

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
  const [showDebug, setShowDebug] = useState(false);
  const kubeEventStore = getKubeEventStore();

  const nodeNameSet  = useMemo(() => new Set(nodeNames),  [nodeNames.join(",")]);  // eslint-disable-line react-hooks/exhaustive-deps
  const claimNameSet = useMemo(() => new Set(claimNames), [claimNames.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  const { allMatchedEvents, fetchedCount, storeCount, isLoading, refresh } = usePoolEvents(
    poolName,
    nodeNameSet,
    claimNameSet,
    kubeEventStore.items.length,
  );

  if (isLoading) {
    return (
      <div className={style.historyEmpty} style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Spinner size={12} /> Loading events…
      </div>
    );
  }

  if (allMatchedEvents.length === 0) {
    return (
      <EventsEmptyState
        poolName={poolName}
        nodeNames={nodeNames}
        claimNames={claimNames}
        fetchedCount={fetchedCount}
        storeCount={storeCount}
        showDebug={showDebug}
        onToggleDebug={() => setShowDebug((v) => !v)}
        onRefresh={refresh}
        fetchedEvents={allMatchedEvents}
      />
    );
  }

  return (
    <div className={style.historyChart}>
      <table className={style.eventTable}>
        <colgroup>
          <col style={{ width: "5%"  }} />
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
          {allMatchedEvents.map((e, i) => <EventRow key={(e as any).metadata?.uid ?? i} event={e} />)}
        </tbody>
      </table>
    </div>
  );
});

// ── EventRow ──────────────────────────────────────────────────────────────────

function EventRow({ event: e }: { event: RawKubeEvent }) {
  const reason = e.reason ?? "";
  const cfg    = EVENT_REASON_CONFIG[reason] ?? EVENT_REASON_FALLBACK;
  const ts     = eventTs(e);

  return (
    <tr className={style.eventRow}>
      <td style={{ color: cfg.color, textAlign: "center", fontWeight: 700 }}>{cfg.icon}</td>
      <td className={style.eventAge} title={ts ? new Date(ts).toLocaleString() : ""}>{fmtAgo(ts)}</td>
      <td style={{ color: cfg.color }} className={style.eventReason}>{reason}</td>
      <td className={style.eventObject}>
        <span className={style.eventKind}>{e.involvedObject?.kind ?? ""}</span>
        <span className={style.eventName}>{e.involvedObject?.name ?? "—"}</span>
      </td>
      <td className={style.eventMessage}>{e.message}</td>
    </tr>
  );
}

// ── Events empty / debug state ────────────────────────────────────────────────

function EventsEmptyState({
  poolName, nodeNames, claimNames,
  fetchedCount, storeCount,
  showDebug, onToggleDebug, onRefresh, fetchedEvents,
}: {
  poolName: string;
  nodeNames: string[];
  claimNames: string[];
  fetchedCount: number;
  storeCount: number;
  showDebug: boolean;
  onToggleDebug: () => void;
  onRefresh: () => void;
  fetchedEvents: RawKubeEvent[];
}) {
  return (
    <div className={style.historyEmpty}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span>
          No events found for <strong>{poolName}</strong>.{" "}
          <span style={{ color: COLOR.textTertiary }}>
            {fetchedCount} fetched, {storeCount} in store.
          </span>
        </span>
        <button onClick={onRefresh} style={debugBtnStyle}>&#x21BB; Refresh</button>
        <button onClick={onToggleDebug} style={debugBtnStyle}>
          {showDebug ? "Hide debug" : "Show debug"}
        </button>
      </div>
      {showDebug && (
        <div style={{ marginTop: 8, fontSize: 10 }}>
          <div style={{ marginBottom: 4, color: COLOR.textSecondary }}>
            nodes=[{nodeNames.slice(0, 3).join(", ")}{nodeNames.length > 3 ? "..." : ""}] |
            claims=[{claimNames.slice(0, 3).join(", ")}{claimNames.length > 3 ? "..." : ""}]
          </div>
          <DebugEventTable events={fetchedEvents} />
        </div>
      )}
    </div>
  );
}

const debugBtnStyle: React.CSSProperties = {
  background: "none", border: "none",
  color: `var(--colorInfo, ${COLOR.infoSoft})`,
  cursor: "pointer", fontSize: 11,
  textDecoration: "underline", padding: 0,
};

function DebugEventTable({ events }: { events: RawKubeEvent[] }) {
  return (
    <table style={{ borderCollapse: "collapse", width: "100%", fontFamily: "monospace" }}>
      <thead>
        <tr style={{ color: COLOR.textTertiary }}>
          {["ns", "kind", "name", "reason"].map((h) => (
            <td key={h} style={{ padding: "2px 8px" }}>{h}</td>
          ))}
        </tr>
      </thead>
      <tbody>
        {events.slice(0, TIMING.maxDebugEvents).map((r, i) => (
          <tr key={i} style={{ borderTop: `1px solid var(--borderColor, ${COLOR.border})` }}>
            <td style={{ padding: "2px 8px", color: COLOR.textTertiary }}>{r.metadata?.namespace ?? "—"}</td>
            <td style={{ padding: "2px 8px", color: COLOR.textSecondary }}>{r.involvedObject?.kind ?? "?"}</td>
            <td style={{ padding: "2px 8px", color: COLOR.infoSoft }}>{r.involvedObject?.name ?? "?"}</td>
            <td style={{ padding: "2px 8px" }}>{r.reason ?? "?"}</td>
          </tr>
        ))}
      </tbody>
    </table>
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
  active, onClick, title, children, style: extraStyle,
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
  podCountMap,
}: {
  nodes: Node[];
  podCountMap: Record<string, number>;
}) => (
  <table className={style.nodesTable}>
    <colgroup>
      <col style={{ width: "34%" }} />
      <col style={{ width: "22%" }} />
      <col style={{ width: "10%" }} />
      <col style={{ width: "10%" }} />
      <col style={{ width: "7%"  }} />
      <col style={{ width: "7%"  }} />
      <col style={{ width: "7%"  }} />
      <col style={{ width: "3%"  }} />
    </colgroup>
    <thead>
      <tr>
        <th>Node</th><th>NodeClaim</th><th>Type</th><th>Status</th>
        <th>CPU</th><th>Memory</th><th>Pods</th><th></th>
      </tr>
    </thead>
    <tbody>
      {nodes.map((node, idx) => {
        if (!node?.metadata) return null;
        const nodeName    = node.metadata?.name ?? "";
        const maxPods     = getNodeMaxPods(node);
        const runningPods = podCountMap[nodeName] ?? -1;
        const podLabel    = maxPods > 0
          ? runningPods >= 0 ? `${runningPods}/${maxPods}` : `—/${maxPods}`
          : "—";
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
            <td><span className={style.monoSmall}>{getNodeClaimName(node) || "—"}</span></td>
            <td><span className={style.monoSmall}>{getInstanceType(node)}</span></td>
            <td><StatusBadge status={getNodeStatus(node)} /></td>
            <td className={style.monoSmall}>{getNodeCpu(node)}</td>
            <td className={style.monoSmall}>{getNodeMemory(node)}</td>
            <td className={style.monoSmall}>{podLabel}</td>
            <td className={style.clickHint}>{ICON.external}</td>
          </tr>
        );
      })}
    </tbody>
  </table>
);

// ── Tree (cards) view ─────────────────────────────────────────────────────────

function TreeLeaf({
  icon, kind, name, extra, color, onClick,
}: {
  icon: string; kind: string; name: string;
  extra?: React.ReactNode; color?: string;
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
  const status    = getNodeStatus(node);
  const claimName = getNodeClaimName(node);
  const nodeName  = node.metadata?.name ?? "";
  const maxPods   = getNodeMaxPods(node);
  const running   = podCountMap[nodeName] ?? -1;
  const podLabel  = maxPods > 0
    ? `${ICON.pod} ${running >= 0 ? running : "—"}/${maxPods} pods`
    : "";
  const color = STATUS_BORDER_COLOR[status] ?? "#888";

  return (
    <div className={style.treePairRow}>
      <div className={style.treeConnector} />
      <div className={style.treePairLeaves}>
        <TreeLeaf
          icon={ICON.nodeclaim} kind="NodeClaim" name={claimName || "—"}
          color={COLOR.nodeclaim}
          onClick={claimName ? (event) => {
            event.stopPropagation();
            openNodeClaimDetail(claimName);
          } : undefined}
        />
        <div className={style.treePairArrow}>{ICON.arrow}</div>
        <TreeLeaf
          icon={ICON.node} kind="Node" name={nodeName}
          color={color}
          onClick={(event) => {
            event.stopPropagation();
            openNodeDetail(node);
          }}
          extra={
            <div className={style.treeLeafStats}>
              <StatusBadge status={status} />
              <span className={style.nodeCardStat}>{ICON.cpu} {getNodeCpu(node)}</span>
              <span className={style.nodeCardStat}>{ICON.memory} {getNodeMemory(node)}</span>
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
            <NodePairRow
              key={node.metadata?.uid ?? node.metadata?.name ?? idx}
              node={node}
              podCountMap={podCountMap}
            />
          );
        })}
      </div>
    </div>
  );
}

// ── Resource overview bars ────────────────────────────────────────────────────

function OverviewBar({
  label, used, total, color, unitFmt,
}: {
  label: string; used: number; total: number;
  color: string; unitFmt: (v: number) => string;
}) {
  const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0;
  return (
    <div className={style.overviewBar}>
      <div className={style.overviewBarHeader}>
        <span className={style.overviewBarLabel}>{label}</span>
        <span className={style.overviewBarValue}>{unitFmt(used)} / {unitFmt(total)}</span>
      </div>
      <div className={style.overviewBarTrack}>
        <div className={style.overviewBarFill} style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

function InlineOverview({ resources, limits }: { resources: any; limits: any }) {
  return (
    <div className={style.inlineOverview}>
      <OverviewBar
        label="CPU"
        used={parseCpuCores(resources?.cpu ?? "0")}
        total={parseCpuCores(limits?.cpu ?? "0")}
        color={COLOR.cpu}
        unitFmt={(v) => v.toFixed(1)}
      />
      <OverviewBar
        label="Memory"
        used={parseMemGi(resources?.memory ?? "0")}
        total={parseMemGi(limits?.memory ?? "0")}
        color={COLOR.memory}
        unitFmt={(v) => v >= 1 ? `${v.toFixed(1)}Gi` : `${(v * 1024).toFixed(0)}Mi`}
      />
    </div>
  );
}

// ── Info bar (NodeClass + NodePool pills + instance type chips) ───────────────

function CardInfoBar({ nodePool, instanceTypeCounts }: { nodePool: NodePool; instanceTypeCounts: Record<string, number> }) {
  const nodeClassRef  = (nodePool.spec as any)?.template?.spec?.nodeClassRef;
  const nodeClassName = nodeClassRef?.name ?? "—";
  const nodeClassKind = nodeClassRef?.kind ?? "EC2NodeClass";
  const provider      = detectProvider(nodeClassRef);
  const poolName      = nodePool.metadata?.name ?? "";
  const poolStatus    = getNodePoolStatus(nodePool);
  const expireAfter   = (nodePool.spec as any)?.disruption?.expireAfter ?? null;

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
    </div>
  );
}

function InfoPill({
  kind, name, onClick, title, badge,
}: {
  kind: string; name: string;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void; title: string;
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
}: {
  nodePool: NodePool;
  nodes: Node[];
  nodeStore?: any;
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

  const poolName   = nodePool.metadata?.name ?? "";
  const poolStatus = getNodePoolStatus(nodePool);
  const { limits }    = (nodePool as any).spec  ?? {};
  const { resources } = (nodePool as any).status ?? {};

  return (
    <>
      <style>{styleInline}</style>
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
          {nodes.length === 0 ? (
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
                  claimNames={nodes.map((n) => getNodeClaimName(n)).filter(Boolean)}
                />
              )}

              {viewMode === "table"
                ? <NodesList nodes={nodes} podCountMap={podCountMap} />
                : <NodesTree nodes={nodes} podCountMap={podCountMap} />
              }
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

export function NodeIcon1(
  props: Renderer.Component.IconProps & { colorstatus?: string }
) {
  const svg = props.colorstatus
    ? svgIconNode.replace(/fill="pass-as-props"/g, `fill="${props.colorstatus}"`)
    : svgIconNode;
  return <Icon {...props} svg={svg} />;
}

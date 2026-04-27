import React, { useState } from "react";
import { observer } from "mobx-react";
import { getKubeEventStore, KubeEvent } from "../../k8s/core/karpenter-events-store";
import { getNodePoolStore, NodePool } from "../../k8s/karpenter/store";

import styles from "./scaling-decisions.module.scss";

function getAge(timestamp: string | undefined): string {
  if (!timestamp) return "—";
  const diff = Date.now() - new Date(timestamp).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "<1m";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

// ── Event classification ──────────────────────────────────────────────────────

/** Karpenter object kinds — events on these are always relevant */
const KARPENTER_KINDS = new Set([
  "NodePool", "NodeClaim", "Machine",
  "EC2NodeClass", "AKSNodeClass", "NodeClass",
]);

/** Karpenter namespaces where the controller typically runs */
const KARPENTER_NAMESPACES = new Set(["karpenter", "karpenter-system"]);

/**
 * Broad match: an event is "karpenter" if ANY of these is true:
 *  1. source.component or reportingComponent contains "karpenter"
 *  2. involvedObject.kind is a known Karpenter CRD kind
 *  3. involvedObject.namespace is a known karpenter namespace
 *  4. The event reason is a well-known Karpenter reason
 */
const KARPENTER_REASONS = new Set([
  "Provisioned", "Launched", "Registered", "Initialized",
  "NotLaunched", "NotRegistered", "NotInitialized",
  "Disrupted", "Disrupting", "Consolidated", "Drifted",
  "NominatedNode", "Nominated",
  "ScaledUp", "ScaledDown",
  "InsufficientCapacity", "Launched", "Terminating", "Terminated",
]);

function isKarpenterEvent(event: KubeEvent): boolean {
  const src = (event.source?.component ?? "").toLowerCase();
  const rc = (event.reportingComponent ?? "").toLowerCase();
  const kind = event.involvedObject?.kind ?? "";
  const ns = event.involvedObject?.namespace ?? "";
  const reason = event.reason ?? "";

  return (
    src.includes("karpenter") ||
    rc.includes("karpenter") ||
    KARPENTER_KINDS.has(kind) ||
    KARPENTER_NAMESPACES.has(ns) ||
    KARPENTER_REASONS.has(reason)
  );
}

/** Pod placement: scheduler events on Pods that mention a node */
function isNominatedPodEvent(event: KubeEvent): boolean {
  return event.involvedObject?.kind === "Pod";
}

/** Node/NodeClaim decisions */
function isNodeDecisionEvent(event: KubeEvent): boolean {
  const kind = event.involvedObject?.kind;
  return kind === "NodeClaim" || kind === "Node" || kind === "Machine";
}

/** NodePool filter */
function matchesNodePool(event: KubeEvent, _nodePools: NodePool[], selectedPool: string): boolean {
  if (!selectedPool) return true;
  const objName: string = event.involvedObject?.name ?? "";
  if (objName.startsWith(selectedPool + "-")) return true;
  const labels = (event as any).involvedObject?.labels ?? {};
  return labels?.["karpenter.sh/nodepool"] === selectedPool;
}

// ── Tables ────────────────────────────────────────────────────────────────────

interface DecisionTableProps {
  title: string;
  events: KubeEvent[];
  isPod: boolean;
}

const DecisionTable: React.FC<DecisionTableProps> = ({ title, events, isPod }) => (
  <div className={styles.tableWrapper}>
    <div className={styles.tableTitle}>{title}</div>
    <table className={styles.table}>
      <thead>
        <tr>
          <th>Type</th>
          <th>Reason</th>
          <th>From</th>
          <th>{isPod ? "Pod" : "Node / NodeClaim"}</th>
          <th>Message</th>
          <th>Age ↓</th>
        </tr>
      </thead>
      <tbody>
        {events.length === 0 && (
          <tr>
            <td colSpan={6} className={styles.empty}>
              No events found
            </td>
          </tr>
        )}
        {events.map((event, idx) => (
          <tr key={event.metadata?.uid ?? idx}>
            <td>
              <span className={event.type === "Warning" ? styles.typeWarning : styles.typeNormal}>
                {event.type}
              </span>
            </td>
            <td className={styles.reasonCell}>{event.reason}</td>
            <td className={styles.sourceCell}>
              {event.source?.component || event.reportingComponent || "—"}
            </td>
            <td className={styles.nameCell}>
              {event.involvedObject?.namespace
                ? `${event.involvedObject.namespace}/${event.involvedObject.name}`
                : event.involvedObject?.name}
            </td>
            <td className={styles.messageCell}>{event.message}</td>
            <td className={styles.ageCell}>
              {getAge(event.lastTimestamp || event.eventTime || event.metadata?.creationTimestamp)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

// ── Debug panel ───────────────────────────────────────────────────────────────

const DebugPanel: React.FC<{ allEvents: KubeEvent[] }> = ({ allEvents }) => {
  const [open, setOpen] = useState(false);

  // Group by kind to help the user see what's in the cluster
  const byKind: Record<string, number> = {};
  const byComponent: Record<string, number> = {};
  const byNamespace: Record<string, number> = {};

  for (const e of allEvents) {
    const k = e.involvedObject?.kind ?? "(unknown)";
    const c = e.source?.component || e.reportingComponent || "(none)";
    const ns = e.involvedObject?.namespace || "(cluster)";
    byKind[k] = (byKind[k] ?? 0) + 1;
    byComponent[c] = (byComponent[c] ?? 0) + 1;
    byNamespace[ns] = (byNamespace[ns] ?? 0) + 1;
  }

  const sorted = (rec: Record<string, number>) =>
    Object.entries(rec).sort((a, b) => b[1] - a[1]);

  return (
    <div className={styles.debugPanel}>
      <button
        className={styles.debugToggle}
        onClick={() => setOpen(v => !v)}
      >
        🔍 Debug — {allEvents.length} events in store {open ? "▾" : "▸"}
      </button>

      {open && (
        <div className={styles.debugBody}>
          <p className={styles.debugHint}>
            The store loaded <strong>{allEvents.length}</strong> events. Karpenter events are matched
            by <code>source.component</code>, <code>reportingComponent</code>, <code>involvedObject.kind</code>,
            namespace (<code>karpenter</code> / <code>karpenter-system</code>), or known reasons.
            If you see 0 karpenter events but there are events below, check that Karpenter is
            actually emitting events in your cluster (<code>kubectl get events -A | grep -i karpenter</code>).
          </p>

          <div className={styles.debugCols}>
            <div>
              <div className={styles.debugColTitle}>By involvedObject.kind</div>
              {sorted(byKind).map(([k, n]) => (
                <div key={k} className={styles.debugRow}>
                  <span className={KARPENTER_KINDS.has(k) ? styles.debugMatch : ""}>{k}</span>
                  <span className={styles.debugCount}>{n}</span>
                </div>
              ))}
            </div>
            <div>
              <div className={styles.debugColTitle}>By source.component</div>
              {sorted(byComponent).map(([c, n]) => (
                <div key={c} className={styles.debugRow}>
                  <span className={c.toLowerCase().includes("karpenter") ? styles.debugMatch : ""}>{c}</span>
                  <span className={styles.debugCount}>{n}</span>
                </div>
              ))}
            </div>
            <div>
              <div className={styles.debugColTitle}>By namespace</div>
              {sorted(byNamespace).map(([ns, n]) => (
                <div key={ns} className={styles.debugRow}>
                  <span className={KARPENTER_NAMESPACES.has(ns) ? styles.debugMatch : ""}>{ns}</span>
                  <span className={styles.debugCount}>{n}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Main component ────────────────────────────────────────────────────────────

export const ScalingDecisions: React.FC = observer(() => {
  const [selectedPool, setSelectedPool] = useState<string>("");
  const nodePoolStore = getNodePoolStore();
  const kubeEventStore = getKubeEventStore();

  const nodePools: NodePool[] = nodePoolStore.items;
  const allEvents: KubeEvent[] = kubeEventStore.items;

  const karpenterEvents = allEvents.filter(isKarpenterEvent);

  const sortByAge = (a: KubeEvent, b: KubeEvent) => {
    const tA = new Date(a.lastTimestamp || a.eventTime || a.metadata?.creationTimestamp || 0).getTime();
    const tB = new Date(b.lastTimestamp || b.eventTime || b.metadata?.creationTimestamp || 0).getTime();
    return tB - tA;
  };

  const podEvents = karpenterEvents
    .filter(isNominatedPodEvent)
    .filter((e) => matchesNodePool(e, nodePools, selectedPool))
    .sort(sortByAge);

  const nodeEvents = karpenterEvents
    .filter(isNodeDecisionEvent)
    .filter((e) => matchesNodePool(e, nodePools, selectedPool))
    .sort(sortByAge);

  return (
    <div className={styles.container}>
      <h2 className={styles.title}>Scaling decisions</h2>
      <p className={styles.subtitle}>
        Shows which instances are being provisioned for your workloads and understand the reason behind
        why Karpenter made those choices. Helpful while debugging.
      </p>

      <div className={styles.filterRow}>
        <label className={styles.filterLabel}>Filter by NodePool:</label>
        <select
          className={styles.filterSelect}
          value={selectedPool}
          onChange={(e) => setSelectedPool(e.target.value)}
        >
          <option value="">All NodePools</option>
          {nodePools.map((np) => (
            <option key={np.metadata?.name} value={np.metadata?.name ?? ""}>
              {np.metadata?.name}
            </option>
          ))}
        </select>

        <span className={styles.eventCount}>
          {karpenterEvents.length} karpenter event{karpenterEvents.length !== 1 ? "s" : ""} found
          {allEvents.length > 0 && karpenterEvents.length === 0 && (
            <span className={styles.eventCountWarn}> ({allEvents.length} total in store — see debug ↓)</span>
          )}
        </span>
      </div>

      <DecisionTable title="Pod Placement Decisions" events={podEvents} isPod={true} />
      <DecisionTable title="Node Decisions" events={nodeEvents} isPod={false} />

      {/* Always show debug panel so user can inspect what the store contains */}
      <DebugPanel allEvents={allEvents} />
    </div>
  );
});

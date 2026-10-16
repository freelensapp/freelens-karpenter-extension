/**
 * useKarpenterData.ts — data hooks of the KarpenterCard.
 *
 * The components that call them are `observer`s: they read the host's pod store and the extension's event store
 * while they render, so they follow both without a cache of their own.
 */

import { Renderer } from "@freelensapp/extensions";
import { useCallback, useMemo } from "react";
import { getKarpenterEventStore, karpenterEventNamespaces } from "../data/stores";
import { buildPodCountMap, getInstanceType } from "../utils/kube-helpers";

type Node = Renderer.K8sApi.Node;
export type KarpenterEvent = Renderer.K8sApi.KubeEvent;

/** Loads the Karpenter events again; the store is subscribed, so this is only needed after a failure. */
function reloadEvents() {
  getKarpenterEventStore()
    .loadAll({ namespaces: karpenterEventNamespaces, onLoadFailure: () => undefined })
    .catch(() => undefined);
}

// ── Main hook ─────────────────────────────────────────────────────────────────

export interface KarpenterCardData {
  /** Shared pod-count map {nodeName → count} */
  podCountMap: Record<string, number>;
  /** Instance type → count for nodes in this pool */
  instanceTypeCounts: Record<string, number>;
  /** True while the first data load is in progress */
  isLoading: boolean;
  /** Trigger a manual refresh of events */
  refreshEvents: () => void;
}

/**
 * Hook that wires up all data dependencies for a single KarpenterCard.
 * @param nodes - the list of nodes in this pool (from the store, reactive)
 */
export function useKarpenterCardData(nodes: Node[]): KarpenterCardData {
  const podCountMap = buildPodCountMap();

  const instanceTypeKey = nodes.map((n) => `${n.getName()}=${getInstanceType(n)}`).join(",");
  const instanceTypeCounts = useMemo(
    () =>
      nodes.reduce<Record<string, number>>((acc, n) => {
        const t = getInstanceType(n);
        acc[t] = (acc[t] ?? 0) + 1;
        return acc;
      }, {}),
    // The nodes are recomputed on every render; the key changes only when the pool's instance types do.
    [instanceTypeKey],
  );

  const refreshEvents = useCallback(reloadEvents, []);

  return { podCountMap, instanceTypeCounts, isLoading: false, refreshEvents };
}

// ── Event timeline hook ───────────────────────────────────────────────────────

export interface PoolEventsData {
  allMatchedEvents: KarpenterEvent[];
  fetchedCount: number;
  storeCount: number;
  isLoading: boolean;
  refresh: () => void;
}

/**
 * The events of a single NodePool, its NodeClaims and its nodes, newest first, at most 60.
 */
export function usePoolEvents(poolName: string, nodeNameSet: Set<string>, claimNameSet: Set<string>): PoolEventsData {
  const store = getKarpenterEventStore();
  const allMatchedEvents = filterPoolEvents(store.items, poolName, nodeNameSet, claimNameSet)
    .sort((a, b) => eventTs(b) - eventTs(a))
    .slice(0, 60);
  const refresh = useCallback(reloadEvents, []);

  return {
    allMatchedEvents,
    fetchedCount: store.items.length,
    storeCount: store.items.length,
    isLoading: !store.isLoaded && allMatchedEvents.length === 0,
    refresh,
  };
}

// ── Pure helpers (used by hook + card) ────────────────────────────────────────

export function eventTs(e: KarpenterEvent): number {
  return new Date(e.lastTimestamp || e.eventTime || e.metadata?.creationTimestamp || 0).getTime();
}

/** `now` is the time to measure from, in milliseconds. */
export function fmtAgo(ts: number, now = Date.now()): string {
  const diff = now - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "<1m ago";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function filterPoolEvents(
  events: KarpenterEvent[],
  poolName: string,
  nodeNameSet: Set<string>,
  claimNameSet: Set<string>,
): KarpenterEvent[] {
  const seen = new Set<string>();
  return events.filter((e) => {
    const uid = e.metadata?.uid;
    if (uid) {
      if (seen.has(uid)) return false;
      seen.add(uid);
    }
    const name = e.involvedObject?.name ?? "";
    const kind = e.involvedObject?.kind ?? "";
    if (kind === "NodePool" && name === poolName) return true;
    if ((kind === "NodeClaim" || kind === "Machine") && (claimNameSet.has(name) || name.startsWith(poolName + "-")))
      return true;
    if (kind === "Node" && nodeNameSet.has(name)) return true;
    return false;
  });
}

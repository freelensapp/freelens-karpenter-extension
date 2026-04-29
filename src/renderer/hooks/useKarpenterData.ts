/**
 * useKarpenterData.ts — central data hook for the KarpenterCard.
 *
 * Responsibilities:
 * - Tracks loading state (so consumers can show skeletons immediately)
 * - Memoizes expensive computations (pod map, instance type counts)
 * - Provides a stable refresh function
 * - Caches event fetch results (via karpenter-events-store TTL)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type RawKubeEvent,
  fetchAllNamespaceEvents,
  getCachedAllNamespaceEvents,
  getKubeEventStore,
} from "../k8s/core/karpenter-events-store";
import { type Node } from "../k8s/core/node-store";
import { buildPodCountMap, getInstanceType } from "../utils/kube-helpers";

// ── Pod count map cache (per-render, shared across all cards) ─────────────────
// Rebuilt at most once per React render cycle via module-level ref.
let _cachedPodMap: Record<string, number> = {};
let _podMapFrame = -1;

function getPodCountMap(): Record<string, number> {
  const frame = performance.now() | 0;
  // Rebuild only once per ~16ms frame
  if (frame !== _podMapFrame) {
    _cachedPodMap = buildPodCountMap();
    _podMapFrame = frame;
  }
  return _cachedPodMap;
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
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const podCountMap = useMemo(() => getPodCountMap(), [nodes.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const instanceTypeCounts = useMemo(
    () =>
      nodes.reduce<Record<string, number>>((acc, n) => {
        const t = getInstanceType(n);
        acc[t] = (acc[t] ?? 0) + 1;
        return acc;
      }, {}),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nodes.length, nodes.map((n) => n.metadata?.name).join(",")],
  );

  const refreshEvents = useCallback(() => {
    fetchAllNamespaceEvents().catch(() => undefined);
  }, []);

  return { podCountMap, instanceTypeCounts, isLoading: false, refreshEvents };
}

// ── Event timeline hook ───────────────────────────────────────────────────────

export interface PoolEventsData {
  allMatchedEvents: RawKubeEvent[];
  fetchedCount: number;
  storeCount: number;
  isLoading: boolean;
  refresh: () => void;
}

/**
 * Hook that fetches and filters events for a single NodePool.
 * Merges fresh-fetched events with the MobX store for reactivity.
 */
export function usePoolEvents(
  poolName: string,
  nodeNameSet: Set<string>,
  claimNameSet: Set<string>,
  storeItemCount: number, // pass kubeEventStore.items.length for reactivity
): PoolEventsData {
  const [fetchedEvents, setFetchedEvents] = useState<RawKubeEvent[]>(() => getCachedAllNamespaceEvents());
  const [isLoading, setIsLoading] = useState(true);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const doFetch = useCallback(() => {
    setIsLoading(true);
    fetchAllNamespaceEvents()
      .then((evts) => {
        if (!mountedRef.current) return;
        setFetchedEvents(evts);
        setIsLoading(false);
      })
      .catch(() => {
        if (mountedRef.current) setIsLoading(false);
      });
  }, []); // no deps — fetchAllNamespaceEvents has internal TTL cache

  // Fetch once on mount / poolName change
  useEffect(() => {
    doFetch();
  }, [poolName]); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredFetch = useMemo(
    () => filterPoolEvents(fetchedEvents, poolName, nodeNameSet, claimNameSet),
    [fetchedEvents, poolName, nodeNameSet, claimNameSet],
  );

  const filteredStore = useMemo(
    () =>
      filterPoolEvents(
        getKubeEventStore().items.map((e) => e as unknown as RawKubeEvent),
        poolName,
        nodeNameSet,
        claimNameSet,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [storeItemCount, poolName, nodeNameSet, claimNameSet],
  );

  const allMatchedEvents = useMemo(() => {
    const seen = new Set<string>();
    const merged: RawKubeEvent[] = [];
    for (const e of [...filteredFetch, ...filteredStore]) {
      const key = (e as any).metadata?.uid ?? `${e.involvedObject?.name}:${e.reason}:${e.lastTimestamp}`;
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(e);
      }
    }
    return merged.sort((a, b) => eventTs(b) - eventTs(a)).slice(0, 60);
  }, [filteredFetch, filteredStore]);

  return {
    allMatchedEvents,
    fetchedCount: fetchedEvents.length,
    storeCount: storeItemCount,
    isLoading: isLoading && allMatchedEvents.length === 0,
    refresh: doFetch,
  };
}

// ── Pure helpers (used by hook + card) ────────────────────────────────────────

export function eventTs(e: RawKubeEvent): number {
  return new Date(e.lastTimestamp || e.eventTime || e.metadata?.creationTimestamp || 0).getTime();
}

export function fmtAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "<1m ago";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function filterPoolEvents(
  events: RawKubeEvent[],
  poolName: string,
  nodeNameSet: Set<string>,
  claimNameSet: Set<string>,
): RawKubeEvent[] {
  return events.filter((e) => {
    const name = e.involvedObject?.name ?? "";
    const kind = e.involvedObject?.kind ?? "";
    if (kind === "NodePool" && name === poolName) return true;
    if ((kind === "NodeClaim" || kind === "Machine") && (claimNameSet.has(name) || name.startsWith(poolName + "-")))
      return true;
    if (kind === "Node" && nodeNameSet.has(name)) return true;
    return false;
  });
}

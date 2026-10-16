import { useEffect, useState } from "react";
import { type KarpenterData, loadKarpenterData } from "./load";
import {
  getAKSNodeClassStore,
  getEC2NodeClassStore,
  getNodeClaimStore,
  getNodeOverlayStore,
  getNodePoolStore,
} from "./stores";

export type DashboardData = { status: "loading" } | { status: "not-installed" } | { status: "ready"; version: string };

/**
 * The state of the dashboard's data, for an `observer` page.
 *
 * The page reads the served stores while it renders, so it renders again when the host registers or drops the
 * APIs of the Karpenter CRDs, which happens after the cluster frame has loaded them, often after a page restored
 * at start has rendered. The data is loaded again whenever that set of stores changes, and its subscriptions are
 * stopped when it changes again or the page is left.
 */
export function useKarpenterDashboardData(): DashboardData {
  const storesKey = [
    getNodePoolStore(),
    getNodeClaimStore(),
    getNodeOverlayStore(),
    getEC2NodeClassStore(),
    getAKSNodeClassStore(),
  ]
    .map((store) => store?.api.apiBase ?? "")
    .join(",");
  const [loaded, setLoaded] = useState<{ storesKey: string; version: string | null }>();

  useEffect(() => {
    const controller = new AbortController();
    let data: KarpenterData | null = null;

    loadKarpenterData(controller.signal)
      .then((result) => {
        data = result;
        if (!controller.signal.aborted) setLoaded({ storesKey, version: result?.version ?? null });
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoaded({ storesKey, version: null });
      });

    return () => {
      controller.abort();
      data?.dispose();
    };
  }, [storesKey]);

  if (!loaded || loaded.storesKey !== storesKey) return { status: "loading" };
  if (loaded.version === null) return { status: "not-installed" };
  return { status: "ready", version: loaded.version };
}

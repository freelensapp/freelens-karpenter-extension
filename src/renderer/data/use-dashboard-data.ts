import { useEffect, useState } from "react";
import { type KarpenterData, loadKarpenterData } from "./load";
import {
  getAKSNodeClassStore,
  getEC2NodeClassStore,
  getGCECustomMachineTypeStore,
  getGCENodeClassStore,
  getNodeClaimStore,
  getNodeOverlayStore,
  getNodePoolStore,
} from "./stores";

export type DashboardData =
  | { status: "loading" }
  | { status: "not-installed" }
  /** `version` is empty while the controller version is still loading. */
  | { status: "ready"; version: string };

interface Loaded {
  /** The API bases of the stores the load had. */
  storesKey: string;
  /** The controller version, or `null` when Karpenter is not installed. */
  version: string | null;
}

// What the last load of this cluster frame found. The host's stores keep their objects while the page is not shown,
// so a page shown again renders them at once, and loads again in the background.
let lastLoaded: Loaded | undefined;

/**
 * The state of the dashboard's data, for an `observer` page.
 *
 * The page reads the served stores while it renders, so it renders again when the host registers or drops the
 * APIs of the Karpenter CRDs, which happens after the cluster frame has loaded them, often after a page restored
 * at start has rendered. The data is loaded again whenever that set of stores changes, and its subscriptions are
 * stopped when it changes again or the page is left.
 *
 * The page is loading only until the first load of a set of stores ends: shown again, it starts from what the last
 * load found while it loads again.
 */
export function useKarpenterDashboardData(): DashboardData {
  const storesKey = [
    getNodePoolStore(),
    getNodeClaimStore(),
    getNodeOverlayStore(),
    getEC2NodeClassStore(),
    getAKSNodeClassStore(),
    getGCENodeClassStore(),
    getGCECustomMachineTypeStore(),
  ]
    .map((store) => store?.api.apiBase ?? "")
    .join(",");
  const [loaded, setLoaded] = useState<Loaded | undefined>(lastLoaded);

  useEffect(() => {
    const controller = new AbortController();
    let data: KarpenterData | null = null;

    const done = (version: string | null) => {
      if (controller.signal.aborted) return;
      lastLoaded = { storesKey, version };
      setLoaded(lastLoaded);
    };

    // Ready once the stores are loaded; shown again, the version the last load found stays until the new one.
    loadKarpenterData(controller.signal, () => {
      if (lastLoaded?.storesKey !== storesKey || !lastLoaded.version) done("");
    })
      .then((result) => {
        data = result;
        done(result?.version ?? null);
      })
      .catch(() => done(null));

    return () => {
      controller.abort();
      data?.dispose();
    };
  }, [storesKey]);

  const current = [loaded, lastLoaded].find((candidate) => candidate?.storesKey === storesKey);
  if (!current) return { status: "loading" };
  if (current.version === null) return { status: "not-installed" };
  return { status: "ready", version: current.version };
}

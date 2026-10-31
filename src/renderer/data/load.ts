import { Renderer } from "@freelensapp/extensions";
import { fetchControllerVersion, parseVersionFromCrd } from "./controller-version";
import {
  getAKSNodeClassStore,
  getEC2NodeClassStore,
  getGCENodeClassStore,
  getKarpenterEventStore,
  getNodeClaimStore,
  getNodeOverlayStore,
  getNodePoolStore,
  getNodeStore,
  getPodStore,
  karpenterEventNamespaces,
} from "./stores";

// Loading of the dashboard's data: what the page starts when it is shown, and stops when it is left.

/** The CRD whose presence tells that Karpenter is installed. */
export const nodePoolCrdName = "nodepools.karpenter.sh";

interface LoadableStore {
  loadAll(params?: {
    namespaces?: string[];
    onLoadFailure?: (error: unknown) => void;
    reqInit?: { signal?: AbortSignal };
  }): Promise<unknown>;
  subscribe(): () => void;
}

/** Waits for `ms`, or less when the signal is aborted meanwhile. */
function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

export interface RetryOptions {
  /** How many times the load is tried. */
  attempts?: number;
  /** The wait before the second try, doubled before each further one. */
  delayMs?: number;
}

/**
 * Loads a store and subscribes to it, unless the signal was aborted meanwhile. Returns the disposer of the
 * subscription, or `undefined` when there is none.
 *
 * The host's `loadAll` reports a failure through `onLoadFailure` and resolves. A failed load is tried again, with
 * a growing wait: the API server answers 429 or 503 for a while after a CRD is created, which is when the page
 * loads the stores of the Karpenter kinds that have just appeared. After the last try the store is subscribed to
 * anyway, so that later changes still reach it.
 */
export async function loadAndSubscribe(
  store: LoadableStore | undefined,
  signal: AbortSignal,
  namespaces?: string[],
  { attempts = 5, delayMs = 2000 }: RetryOptions = {},
): Promise<(() => void) | undefined> {
  if (!store) return undefined;
  for (let attempt = 1; ; attempt++) {
    let failed = false;
    try {
      await store.loadAll({ namespaces, onLoadFailure: () => (failed = true), reqInit: { signal } });
    } catch {
      failed = true;
    }
    if (signal.aborted) return undefined;
    if (!failed || attempt >= attempts) return store.subscribe();
    await wait(delayMs * 2 ** (attempt - 1), signal);
    if (signal.aborted) return undefined;
  }
}

export interface KarpenterData {
  /** The controller version, or "installed" when it is not found. */
  version: string;
  /** Stops every subscription the load started. */
  dispose(): void;
}

/**
 * Loads what the dashboard shows: the Karpenter kinds the cluster serves, nodes, the pods of every namespace and
 * the Karpenter events, each subscribed to; then the controller version. Resolves to `null` when the cluster has
 * no NodePool CRD, that is, Karpenter is not installed.
 */
export async function loadKarpenterData(signal: AbortSignal): Promise<KarpenterData | null> {
  const crdStore = Renderer.K8sApi.crdStore;
  await crdStore.loadAll({ onLoadFailure: () => undefined });
  const crd = crdStore.items.find((item) => item.getName() === nodePoolCrdName);
  if (!crd) return null;

  const disposers: (() => void)[] = [];
  const keep = (disposer: (() => void) | undefined) => disposer && disposers.push(disposer);
  const dispose = () => disposers.splice(0).forEach((disposer) => disposer());

  const stores = [
    getNodePoolStore(),
    getNodeStore(),
    getNodeClaimStore(),
    getNodeOverlayStore(),
    getEC2NodeClassStore(),
    getAKSNodeClassStore(),
    getGCENodeClassStore(),
  ];
  (await Promise.all(stores.map((store) => loadAndSubscribe(store, signal)))).forEach(keep);

  // Pods are namespaced, and the host loads a namespaced store for all namespaces only when it is given every one
  // of them, so the namespaces come first.
  const namespaceStore = Renderer.K8sApi.namespaceStore;
  await namespaceStore.loadAll({ namespaces: [], onLoadFailure: () => undefined });
  const namespaces = namespaceStore.items.map((namespace) => namespace.getName());
  keep(await loadAndSubscribe(getPodStore(), signal, namespaces));

  keep(await loadAndSubscribe(getKarpenterEventStore(), signal, karpenterEventNamespaces));

  const version = (await fetchControllerVersion()) ?? parseVersionFromCrd(crd) ?? "installed";

  if (signal.aborted) {
    dispose();
  }

  return { version, dispose };
}

import { Renderer } from "@freelensapp/extensions";
import { fetchControllerVersion, parseVersionFromCrd } from "./controller-version";
import {
  getAKSNodeClassStore,
  getEC2NodeClassStore,
  getKarpenterEventStore,
  getNodeClaimStore,
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

/**
 * Loads a store and subscribes to it, unless the signal was aborted meanwhile. Returns the disposer of the
 * subscription, or `undefined` when there is none. A failure to load leaves the store empty.
 */
export async function loadAndSubscribe(
  store: LoadableStore | undefined,
  signal: AbortSignal,
  namespaces?: string[],
): Promise<(() => void) | undefined> {
  if (!store) return undefined;
  try {
    await store.loadAll({ namespaces, onLoadFailure: () => undefined, reqInit: { signal } });
  } catch {
    return undefined;
  }
  return signal.aborted ? undefined : store.subscribe();
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
    getEC2NodeClassStore(),
    getAKSNodeClassStore(),
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

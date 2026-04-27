import { Renderer } from "@freelensapp/extensions";

const KubeObjectStore = Renderer.K8sApi.KubeObjectStore;

type KubeEvent = Renderer.K8sApi.KubeEvent;
const KubeEvent = Renderer.K8sApi.KubeEvent;
export { KubeEvent };

export class KubeEventApi extends Renderer.K8sApi.KubeApi<KubeEvent, any> {}

export class KubeEventStore extends KubeObjectStore<KubeEvent, KubeEventApi, any> {
  constructor(api: KubeEventApi) {
    super(api);
  }
}

let kubeEventStore: KubeEventStore | undefined;

export function getKubeEventStore(): KubeEventStore {
  if (!kubeEventStore) {
    kubeEventStore = new KubeEventStore(new KubeEventApi({ objectConstructor: KubeEvent }));
    Renderer.K8sApi.apiManager.registerStore(kubeEventStore);
  }

  return kubeEventStore;
}

// ── Direct fetch of events from all namespaces ────────────────────────────────
// KubeObjectStore.loadAll() may only load the currently selected namespace.
// For Karpenter events we need all namespaces — fetch directly and merge.

export interface RawKubeEvent {
  metadata: { uid?: string; namespace?: string; creationTimestamp?: string };
  involvedObject: { kind: string; name: string; namespace?: string };
  reason?: string;
  message?: string;
  type?: string;
  source?: { component?: string };
  reportingComponent?: string;
  lastTimestamp?: string;
  eventTime?: string;
}

let _allNamespaceEvents: RawKubeEvent[] = [];
let _lastFetch = 0;
const FETCH_TTL_MS = 30_000; // re-fetch at most every 30s

// Namespaces where Karpenter events commonly live.
// Events are namespace-scoped; Karpenter writes them to the same namespace
// as the NodeClaim/NodePool — usually "default", but can vary.
const KARPENTER_EVENT_NAMESPACES = ["default", "karpenter", "karpenter-system"];

export async function fetchAllNamespaceEvents(): Promise<RawKubeEvent[]> {
  const now = Date.now();
  if (now - _lastFetch < FETCH_TTL_MS && _allNamespaceEvents.length > 0) {
    return _allNamespaceEvents;
  }

  const eventStore = getKubeEventStore();

  // Use KubeObjectStore.loadAll({ namespaces }) — this is the proven path that
  // goes through the Freelens cluster proxy. It also populates kubeEventStore.items
  // so the store-based fallback path works too.
  try {
    await eventStore.loadAll({
      namespaces: KARPENTER_EVENT_NAMESPACES,
      onLoadFailure: () => undefined, // don't throw on 404
    });
  } catch {
    // ignore — we'll still return whatever is in the store
  }

  const seen = new Set<string>();
  const merged: RawKubeEvent[] = [];
  for (const e of eventStore.items) {
    const uid = (e as any).metadata?.uid ?? "";
    if (uid && seen.has(uid)) continue;
    if (uid) seen.add(uid);
    merged.push(e as unknown as RawKubeEvent);
  }

  _allNamespaceEvents = merged;
  _lastFetch = now;
  return _allNamespaceEvents;
}

export function getCachedAllNamespaceEvents(): RawKubeEvent[] {
  return _allNamespaceEvents;
}

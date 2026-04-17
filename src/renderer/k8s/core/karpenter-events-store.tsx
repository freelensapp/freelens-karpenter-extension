import { Renderer } from "@freelensapp/extensions";

const KubeObject = Renderer.K8sApi.KubeObject;
const KubeObjectStore = Renderer.K8sApi.KubeObjectStore;

export class KubeEvent extends KubeObject<any, any, any> {
  static readonly kind = "Event";
  static readonly namespaced = true;
  static readonly apiBase = "/api/v1/events";

  get involvedObject(): { kind: string; name: string; namespace?: string } {
    return (this as any).involvedObject;
  }

  get reason(): string {
    return (this as any).reason;
  }

  get message(): string {
    return (this as any).message;
  }

  get type(): string {
    return (this as any).type;
  }

  get source(): { component?: string } | undefined {
    return (this as any).source;
  }

  get reportingComponent(): string | undefined {
    return (this as any).reportingComponent;
  }

  get lastTimestamp(): string | undefined {
    return (this as any).lastTimestamp;
  }

  get eventTime(): string | undefined {
    return (this as any).eventTime;
  }
}

export class KubeEventApi extends Renderer.K8sApi.KubeApi<KubeEvent> {}
export const kubeEventApi = new KubeEventApi({ objectConstructor: KubeEvent });

export class KubeEventStore extends KubeObjectStore<KubeEvent> {
  api: Renderer.K8sApi.KubeApi<KubeEvent> = kubeEventApi;
}
export const kubeEventStore = new KubeEventStore();

Renderer.K8sApi.apiManager.registerStore(kubeEventStore);

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

  // Use KubeObjectStore.loadAll({ namespaces }) — this is the proven path that
  // goes through the Freelens cluster proxy. It also populates kubeEventStore.items
  // so the store-based fallback path works too.
  try {
    await kubeEventStore.loadAll({
      namespaces: KARPENTER_EVENT_NAMESPACES,
      onLoadFailure: () => undefined, // don't throw on 404
    });
  } catch {
    // ignore — we'll still return whatever is in the store
  }

  const seen = new Set<string>();
  const merged: RawKubeEvent[] = [];
  for (const e of kubeEventStore.items) {
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

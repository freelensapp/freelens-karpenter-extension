/**
 * nodeclass-utils.ts
 *
 * Provider-agnostic helpers for Karpenter NodeClass resources.
 * Supports:
 *  - AWS: EC2NodeClass  (karpenter.k8s.aws/v1)
 *  - Azure: AKSNodeClass (karpenter.azure.com/v1alpha2)
 */

import { Renderer } from "@freelensapp/extensions";
import { getEC2NodeClassStore } from "./ec2nodeclass-store";
import { getAKSNodeClassStore } from "./aksNodeclass-store";

export type NodeClassProvider = "aws" | "azure" | "unknown";

/** API base paths per provider */
export const NODE_CLASS_API: Record<NodeClassProvider, string> = {
  aws:     "/apis/karpenter.k8s.aws/v1/ec2nodeclasses",
  azure:   "/apis/karpenter.azure.com/v1alpha2/aksnodeclasses",
  unknown: "",
};

/** The kind string as it appears in nodeClassRef.kind */
export const NODE_CLASS_KIND: Record<NodeClassProvider, string> = {
  aws:     "EC2NodeClass",
  azure:   "AKSNodeClass",
  unknown: "NodeClass",
};

/**
 * Detect provider from a nodeClassRef object (from NodePool spec).
 * Falls back to looking at which store has items.
 */
export function detectProvider(nodeClassRef?: {
  kind?: string;
  group?: string;
  name?: string;
}): NodeClassProvider {
  if (!nodeClassRef) return guessFromStores();

  const kind = nodeClassRef.kind ?? "";
  const group = nodeClassRef.group ?? "";

  if (kind === "AKSNodeClass" || group.includes("azure")) return "azure";
  if (kind === "EC2NodeClass" || group.includes("aws")) return "aws";

  return guessFromStores();
}

/** Heuristic: whichever store has loaded items wins */
function guessFromStores(): NodeClassProvider {
  if ((getAKSNodeClassStore()?.items.length ?? 0) > 0) return "azure";
  if ((getEC2NodeClassStore()?.items.length ?? 0) > 0) return "aws";
  return "unknown";
}

/**
 * Freelens custom-resources list path per provider.
 * The route is /crd/:group/:name (plural resource name).
 */
const NODE_CLASS_LIST_PATH: Record<NodeClassProvider, string> = {
  aws:     "/crd/karpenter.k8s.aws/ec2nodeclasses",
  azure:   "/crd/karpenter.azure.com/aksnodeclasses",
  unknown: "/crd/definitions",
};

/** Return the self-link used for Freelens navigation */
export function nodeClassSelfLink(name: string, provider: NodeClassProvider): string {
  if (provider === "unknown") return "";
  return `${NODE_CLASS_API[provider]}/${name}`;
}

/** Navigate to the NodeClass detail panel in Freelens */
export function openNodeClassDetail(name: string, provider: NodeClassProvider): void {
  const selfLink = nodeClassSelfLink(name, provider);
  if (!selfLink) return;
  const listPath = NODE_CLASS_LIST_PATH[provider];
  const enc = encodeURIComponent(selfLink);
  (Renderer.Navigation as any).navigate(
    `${listPath}?kube-details=${enc}&kube-selected=${enc}`
  );
}

/** Return items from the correct store */
export function getNodeClassItems(provider: NodeClassProvider): any[] {
  const ec2NodeClassStore = getEC2NodeClassStore();
  const aksNodeClassStore = getAKSNodeClassStore();
  if (provider === "azure") return (aksNodeClassStore?.items ?? []) as any[];
  if (provider === "aws")   return (ec2NodeClassStore?.items ?? []) as any[];
  // Unknown: try both
  const items = [
    ...(ec2NodeClassStore?.items ?? []),
    ...(aksNodeClassStore?.items ?? []),
  ] as any[];
  return items;
}

/** Load all node class stores */
export function loadAllNodeClassStores(): Promise<void[]> {
  const stores = [getEC2NodeClassStore(), getAKSNodeClassStore()].filter(
    (store): store is NonNullable<typeof store> => Boolean(store),
  );
  return Promise.all([
    ...stores.map((store) => store.loadAll().catch(() => undefined)),
  ]) as Promise<void[]>;
}

/** Subscribe to all node class stores */
export function subscribeAllNodeClassStores(): (() => void)[] {
  const unsubs: (() => void)[] = [];
  const ec2NodeClassStore = getEC2NodeClassStore();
  const aksNodeClassStore = getAKSNodeClassStore();
  try { if (ec2NodeClassStore) unsubs.push(ec2NodeClassStore.subscribe()); } catch { /* not available */ }
  try { if (aksNodeClassStore) unsubs.push(aksNodeClassStore.subscribe()); } catch { /* not available */ }
  return unsubs;
}

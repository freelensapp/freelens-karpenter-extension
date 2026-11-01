/**
 * Provider-agnostic helpers for the Karpenter node classes:
 *  - AWS: EC2NodeClass (karpenter.k8s.aws/v1)
 *  - Azure: AKSNodeClass (karpenter.azure.com/v1beta1, or v1alpha2 on an older provider)
 *  - GCP: GCENodeClass (karpenter.k8s.gcp/v1alpha1)
 */

import { pageId, pageUrl } from "../pages/routes";
import { navigateToDetail } from "../utils/kube-helpers";
import { getAKSNodeClassStore, getEC2NodeClassStore, getGCENodeClassStore } from "./stores";

import type { NodeClassReference } from "../api/karpenter/karpenter-v1-types";

export type NodeClassProvider = "aws" | "azure" | "gcp" | "unknown";

/** The kind string as it appears in nodeClassRef.kind */
export const NODE_CLASS_KIND: Record<NodeClassProvider, string> = {
  aws: "EC2NodeClass",
  azure: "AKSNodeClass",
  gcp: "GCENodeClass",
  unknown: "NodeClass",
};

/**
 * Detect provider from a nodeClassRef object (from NodePool spec).
 * Falls back to looking at which store has items.
 */
export function detectProvider(nodeClassRef?: Partial<NodeClassReference>): NodeClassProvider {
  if (!nodeClassRef) return guessFromStores();

  const kind = nodeClassRef.kind ?? "";
  const group = nodeClassRef.group ?? "";

  if (kind === "AKSNodeClass" || group.includes("azure")) return "azure";
  if (kind === "EC2NodeClass" || group.includes("aws")) return "aws";
  if (kind === "GCENodeClass" || group.includes("gcp")) return "gcp";

  return guessFromStores();
}

type KnownProvider = Exclude<NodeClassProvider, "unknown">;

const NODE_CLASS_STORE: Record<KnownProvider, () => { items: unknown[] } | undefined> = {
  aws: () => getEC2NodeClassStore(),
  azure: () => getAKSNodeClassStore(),
  gcp: () => getGCENodeClassStore(),
};

/**
 * The providers whose node class the cluster serves, which is usually one: a cluster runs the Karpenter of one
 * cloud. It reads the host's API registry, so an `observer` that calls it follows the CRDs as they come and go.
 */
export function servedNodeClassProviders(): KnownProvider[] {
  return (Object.keys(NODE_CLASS_STORE) as KnownProvider[]).filter((provider) => !!NODE_CLASS_STORE[provider]());
}

/** Heuristic: whichever store has loaded items wins, else the only node class the cluster serves. */
function guessFromStores(): NodeClassProvider {
  const served = servedNodeClassProviders();
  const withItems = served.find((provider) => (NODE_CLASS_STORE[provider]()?.items.length ?? 0) > 0);
  if (withItems) return withItems;
  return served.length === 1 ? served[0] : "unknown";
}

/**
 * The list page of the extension for the node class of a provider, such as the EC2 Node Classes page for AWS, or
 * `undefined` for a node class the extension does not model.
 */
export function nodeClassPage(provider: NodeClassProvider): string | undefined {
  switch (provider) {
    case "aws":
      return pageUrl(pageId.ec2NodeClasses);
    case "azure":
      return pageUrl(pageId.aksNodeClasses);
    case "gcp":
      return pageUrl(pageId.gceNodeClasses);
    default:
      return undefined;
  }
}

/** The API base of the node classes per provider, in the version the cluster serves. */
function nodeClassApiBase(provider: NodeClassProvider): string {
  switch (provider) {
    case "aws":
      return getEC2NodeClassStore()?.api.apiBase ?? "/apis/karpenter.k8s.aws/v1/ec2nodeclasses";
    case "azure":
      return getAKSNodeClassStore()?.api.apiBase ?? "/apis/karpenter.azure.com/v1beta1/aksnodeclasses";
    case "gcp":
      return getGCENodeClassStore()?.api.apiBase ?? "/apis/karpenter.k8s.gcp/v1alpha1/gcenodeclasses";
    default:
      return "";
  }
}

/** Return the self-link used for Freelens navigation */
export function nodeClassSelfLink(name: string, provider: NodeClassProvider): string {
  if (provider === "unknown") return "";
  return `${nodeClassApiBase(provider)}/${name}`;
}

/**
 * Opens the details of a node class on the extension's page of its kind; nothing for a node class the extension does
 * not model, which has no self-link either.
 */
export function openNodeClassDetail(name: string, provider: NodeClassProvider): void {
  const page = nodeClassPage(provider);
  if (page) navigateToDetail(page, nodeClassSelfLink(name, provider));
}

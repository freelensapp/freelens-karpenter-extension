/**
 * Provider-agnostic helpers for the Karpenter node classes:
 *  - AWS: EC2NodeClass (karpenter.k8s.aws/v1)
 *  - Azure: AKSNodeClass (karpenter.azure.com/v1beta1, or v1alpha2 on an older provider)
 *  - GCP: GCENodeClass (karpenter.k8s.gcp/v1alpha1)
 */

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

/** Heuristic: whichever store has loaded items wins */
function guessFromStores(): NodeClassProvider {
  if ((getAKSNodeClassStore()?.items.length ?? 0) > 0) return "azure";
  if ((getEC2NodeClassStore()?.items.length ?? 0) > 0) return "aws";
  if ((getGCENodeClassStore()?.items.length ?? 0) > 0) return "gcp";
  return "unknown";
}

/**
 * Freelens custom-resources list path per provider.
 * The route is /crd/:group/:name (plural resource name).
 */
const NODE_CLASS_LIST_PATH: Record<NodeClassProvider, string> = {
  aws: "/crd/karpenter.k8s.aws/ec2nodeclasses",
  azure: "/crd/karpenter.azure.com/aksnodeclasses",
  gcp: "/crd/karpenter.k8s.gcp/gcenodeclasses",
  unknown: "/crd/definitions",
};

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

/** Navigate to the NodeClass detail panel in Freelens */
export function openNodeClassDetail(name: string, provider: NodeClassProvider): void {
  navigateToDetail(NODE_CLASS_LIST_PATH[provider], nodeClassSelfLink(name, provider));
}

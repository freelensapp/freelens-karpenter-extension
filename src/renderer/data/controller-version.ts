import { Renderer } from "@freelensapp/extensions";

// The version of the Karpenter controller, for the badge of the dashboard: the image tag of its Deployment, found
// by its label in any namespace (C6) or by its name in the usual namespaces, else the version in the metadata of
// the NodePool CRD, else "installed".

type Deployment = Renderer.K8sApi.Deployment;
type CustomResourceDefinition = Renderer.K8sApi.CustomResourceDefinition;

/** The label the Karpenter Helm chart sets on the controller Deployment, looked for in every namespace (C6). */
export const controllerLabelSelector = "app.kubernetes.io/name=karpenter";

/** The namespaces where a Deployment whose name contains `karpenter` is looked for, when the label finds none. */
export const controllerNamespaces = ["karpenter", "karpenter-system"];

/**
 * The version in an image reference, such as `1.15.0` in `public.ecr.aws/karpenter/controller:1.15.0` or
 * `0.37.1` in `ghcr.io/aws/karpenter/controller:v0.37.1`, or `null`.
 */
export function parseVersionFromImage(image: string): string | null {
  const match = image.match(/:v?(\d+\.\d+(?:\.\d+)?(?:[-+][^\s]*)?)/);
  return match ? match[1] : null;
}

/** The version of the first image of the Deployment's containers, then init containers, that has one. */
export function parseVersionFromDeployment(deployment: Deployment): string | null {
  const podSpec = deployment.spec?.template?.spec;
  const containers = [...(podSpec?.containers ?? []), ...(podSpec?.initContainers ?? [])];
  for (const container of containers) {
    const version = parseVersionFromImage(container.image ?? "");
    if (version) return version;
  }
  return null;
}

/** The version in the annotations or labels of a CRD, without a leading `v`, or `null`. */
export function parseVersionFromCrd(crd: CustomResourceDefinition): string | null {
  const annotations = crd.metadata.annotations ?? {};
  const labels = crd.metadata.labels ?? {};
  const raw =
    annotations["karpenter.sh/version"] ||
    annotations["app.kubernetes.io/version"] ||
    labels["app.kubernetes.io/version"] ||
    labels["karpenter.sh/version"] ||
    "";
  return raw ? raw.replace(/^v/, "") : null;
}

/**
 * The version of the first Deployment whose image has a version; with `byName`, of the first one whose name also
 * contains `karpenter`.
 */
export function findVersionInDeployments(deployments: Deployment[], byName = true): string | null {
  for (const deployment of deployments) {
    if (byName && !deployment.metadata.name.includes("karpenter")) continue;
    const version = parseVersionFromDeployment(deployment);
    if (version) return version;
  }
  return null;
}

/** Lists Deployments, in a namespace or in all of them, optionally by label. */
export type ListDeployments = (namespace?: string, labelSelector?: string) => Promise<Deployment[] | null>;

// Through the host's API, without loading the host's store of Deployments.
const listWithHost: ListDeployments = (namespace, labelSelector) =>
  Renderer.K8sApi.deploymentApi.list({ namespace }, labelSelector ? { labelSelector } : undefined);

/**
 * The version of the controller: the Deployments labelled as Karpenter's in any namespace (C6), then those whose
 * name contains `karpenter` in the usual namespaces, for a user who may not list Deployments in every namespace.
 * `null` when none is found or every list fails.
 */
export async function fetchControllerVersion(list: ListDeployments = listWithHost): Promise<string | null> {
  try {
    const version = findVersionInDeployments((await list(undefined, controllerLabelSelector)) ?? [], false);
    if (version) return version;
  } catch {
    // not readable in every namespace: look in the usual ones
  }
  for (const namespace of controllerNamespaces) {
    try {
      const version = findVersionInDeployments((await list(namespace)) ?? []);
      if (version) return version;
    } catch {
      // not readable in this namespace, try the next one
    }
  }
  return null;
}

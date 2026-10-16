import { Renderer } from "@freelensapp/extensions";

// The version of the Karpenter controller, for the badge of the dashboard: the image tag of its Deployment, else
// the version in the metadata of the NodePool CRD, else "installed".

type Deployment = Renderer.K8sApi.Deployment;
type CustomResourceDefinition = Renderer.K8sApi.CustomResourceDefinition;

/** The namespaces where the controller Deployment is looked for. */
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

/** The version of the first Deployment whose name contains `karpenter` and whose image has a version. */
export function findVersionInDeployments(deployments: Deployment[]): string | null {
  for (const deployment of deployments) {
    if (!deployment.metadata.name.includes("karpenter")) continue;
    const version = parseVersionFromDeployment(deployment);
    if (version) return version;
  }
  return null;
}

/**
 * Lists the Deployments of the controller namespaces through the host's API, without loading the host's store of
 * Deployments, and returns the version of the controller, or `null` when none is found or the list fails.
 */
export async function fetchControllerVersion(): Promise<string | null> {
  for (const namespace of controllerNamespaces) {
    try {
      const deployments = await Renderer.K8sApi.deploymentApi.list({ namespace });
      const version = findVersionInDeployments(deployments ?? []);
      if (version) return version;
    } catch {
      // not readable in this namespace, try the next one
    }
  }
  return null;
}

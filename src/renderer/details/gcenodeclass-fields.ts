// What the details of a GCENodeClass of karpenter.k8s.gcp/v1alpha1 show of its fields, as text: the images its
// selector terms resolved to, its disks and its additional network interfaces, after the Go types of
// cloudpilot-ai/karpenter-provider-gcp v0.6.1.

import { formatRequirement } from "./karpenter-v1";

import type { AdditionalNetworkInterface, Disk, Image } from "../api/gcenodeclass/gcenodeclass-v1alpha1-types";

/** An image the GCENodeClass resolved: its source image, then the instances it is for. */
export function formatImage(image: Image): string {
  const requirements = (image.requirements ?? []).map(formatRequirement).join(", ");
  return requirements ? `${image.sourceImage}: ${requirements}` : image.sourceImage;
}

/**
 * A disk of the instances: the boot disk said so, then its size, its category, the IOPS and throughput provisioned
 * for it, its KMS key and the service account that reaches the key, and its secondary boot image with its mode, in
 * the order of the struct.
 */
export function formatDisk(disk: Disk): string {
  const secondaryBoot = disk.secondaryBootImage
    ? `secondary boot image ${disk.secondaryBootImage}${disk.secondaryBootMode ? ` (${disk.secondaryBootMode})` : ""}`
    : undefined;
  const parts = [
    disk.sizeGiB ? `${disk.sizeGiB} GiB` : undefined,
    disk.category,
    disk.provisionedIOPS === undefined ? undefined : `${disk.provisionedIOPS} IOPS`,
    disk.provisionedThroughput === undefined ? undefined : `${disk.provisionedThroughput} MiB/s`,
    disk.kmsKeyName ? `KMS key ${disk.kmsKeyName}` : undefined,
    disk.kmsKeyServiceAccount ? `KMS key service account ${disk.kmsKeyServiceAccount}` : undefined,
    secondaryBoot,
  ].filter(Boolean);
  const name = disk.boot ? "boot disk" : "disk";
  return parts.length ? `${name}: ${parts.join(", ")}` : name;
}

/** A secondary network interface: its subnetwork, then its network when it names one. */
export function formatAdditionalNetworkInterface(networkInterface: AdditionalNetworkInterface): string {
  return networkInterface.network
    ? `${networkInterface.subnetwork} (network ${networkInterface.network})`
    : networkInterface.subnetwork;
}

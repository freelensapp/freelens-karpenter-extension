// What the details of an AKSNodeClass of karpenter.azure.com, v1beta1 or v1alpha2, show of its fields, as text: the
// images and the versions it resolved, its capacity reservation group, its node public IP and its local DNS overrides.
// The types are those of v1beta1; v1alpha2 has the same structs, without `gpu.nvidia`.

import { formatRequirement } from "./karpenter-v1";

import type {
  CapacityReservation,
  CapacityReservationGroup,
  IPTag,
  LocalDNSZoneOverride,
  NodeImage,
  RecentlyUsedVersion,
} from "../api/aksnodeclass/aksnodeclass-v1beta1-types";

/** An image the AKSNodeClass resolved: its id, then the instances it is for. */
export function formatNodeImage(image: NodeImage): string {
  const requirements = (image.requirements ?? []).map(formatRequirement).join(", ");
  return requirements ? `${image.id}: ${requirements}` : image.id;
}

/** A pair of versions that nodes of the AKSNodeClass used before, and when they last did. */
export function formatRecentlyUsedVersion(version: RecentlyUsedVersion): string {
  const used = version.timeUsed ? `, used ${version.timeUsed}` : "";
  return `Kubernetes ${version.kubernetesVersion}, image ${version.nodeImageVersion}${used}`;
}

/** Zones as text, or `regional` without any. */
function zonesText(zones: string[] | undefined): string {
  return zones?.length ? `zones ${zones.join(", ")}` : "regional";
}

/** The capacity reservation group the AKSNodeClass resolved: its id, its region, and its zones. */
export function formatCapacityReservationGroup(group: CapacityReservationGroup): string {
  return `${group.id} (${group.location}, ${zonesText(group.zones)})`;
}

/**
 * A reservation of the group: its name and VM size, then its zones, the number of instances it reserves, and its
 * provisioning state; only one that `Succeeded` backs offerings.
 */
export function formatAKSCapacityReservation(reservation: CapacityReservation): string {
  const details = [
    zonesText(reservation.zones),
    reservation.quantity === undefined ? undefined : `quantity ${reservation.quantity}`,
    reservation.provisioningState,
  ].filter((part) => part !== undefined);
  return `${reservation.name} ${reservation.vmSize} (${details.join(", ")})`;
}

/** An IP tag of the node public IP: `type=tag`. */
export function formatIPTag(tag: IPTag): string {
  return `${tag.ipTagType}=${tag.tag}`;
}

/**
 * A zone override of local DNS: the zone, where it forwards and how, the cache and serve-stale durations, and its
 * query logging, in the order of the struct.
 */
export function formatLocalDNSOverride(override: LocalDNSZoneOverride): string {
  const details = [
    `forward to ${override.forwardDestination}`,
    override.forwardPolicy,
    override.protocol,
    `max ${override.maxConcurrent} concurrent`,
    `cache ${override.cacheDuration}`,
    `serve stale ${override.serveStale} for ${override.serveStaleDuration}`,
    `log ${override.queryLogging}`,
  ];
  return `${override.zone}: ${details.join(", ")}`;
}

/** The size of the OS disk, in GB as the field names it. */
export function formatOSDiskSize(sizeGB: number | undefined): string | undefined {
  return sizeGB === undefined ? undefined : `${sizeGB} GB`;
}

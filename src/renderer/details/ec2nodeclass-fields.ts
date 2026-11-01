// What the details of an EC2NodeClass of karpenter.k8s.aws/v1 show of its fields, as text: the selector terms of the
// spec, what they resolved to in the status, the block devices, the network interfaces and the option structs.

import { formatRequirement } from "./karpenter-v1";

import type {
  AMI,
  BlockDeviceMapping,
  CapacityReservation,
  NetworkInterface,
  SecurityGroup,
  Subnet,
} from "../api/ec2nodeclass/ec2nodeclass-v1-types";

/** A value of a field as text: a list joined by commas, a map as `key=value` pairs, anything else as it is. */
export function formatValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(formatValue).join(", ");
  if (value !== null && typeof value === "object") {
    return Object.entries(value)
      .map(([key, inner]) => `${key}=${formatValue(inner)}`)
      .join(", ");
  }
  return String(value);
}

/**
 * The fields of a struct or a map that are set, one text each, `field: value`, in the order of the object: the
 * metadata options, the connection tracking, the CPU options, the kubelet settings.
 */
export function fieldTexts(fields: object | undefined): string[] {
  return Object.entries(fields ?? {})
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${key}: ${formatValue(value)}`);
}

/**
 * A selector term, its fields that are set in the order of the term, `field: value`, separated by semicolons: all of
 * them select together. The tags are `key=value` pairs, `*` for any value.
 */
export function formatSelectorTerm(term: object): string {
  return fieldTexts(term).join("; ");
}

/** A subnet a selector resolved to: its id, then its zone and zone id. */
export function formatSubnet(subnet: Subnet): string {
  return `${subnet.id} (${[subnet.zone, subnet.zoneID].filter(Boolean).join(", ")})`;
}

/** A security group a selector resolved to: its id, then its name. */
export function formatSecurityGroup(group: SecurityGroup): string {
  return group.name ? `${group.id} (${group.name})` : group.id;
}

/** An AMI a selector resolved to: its id, its name, whether it is deprecated, and the instances it is for. */
export function formatAMI(ami: AMI): string {
  const name = [ami.name, ami.deprecated ? "deprecated" : undefined].filter(Boolean).join(", ");
  const requirements = ami.requirements.map(formatRequirement).join(", ");
  return `${ami.id}${name ? ` (${name})` : ""}${requirements ? `: ${requirements}` : ""}`;
}

/**
 * A capacity reservation a selector resolved to: its id, its instance type and zone, then its type, its state and
 * when it ends (a capacity block, or one that is expiring), which instances it takes, its owner, and whether it can
 * be interrupted.
 */
export function formatCapacityReservation(reservation: CapacityReservation): string {
  const details = [
    reservation.reservationType,
    reservation.state,
    reservation.endTime ? `ends ${reservation.endTime}` : undefined,
    `${reservation.instanceMatchCriteria} match`,
    `owner ${reservation.ownerID}`,
    reservation.interruptible ? "interruptible" : undefined,
  ].filter(Boolean);
  return `${reservation.id} ${reservation.instanceType} in ${reservation.availabilityZone} (${details.join(", ")})`;
}

/**
 * A block device mapping: its device, then its EBS volume, size, type, IOPS, throughput and the rest, as
 * `kubectl describe` would group them; the root volume said so.
 */
export function formatBlockDeviceMapping(mapping: BlockDeviceMapping): string {
  const ebs = mapping.ebs;
  const parts = [
    ebs?.volumeSize,
    ebs?.volumeType,
    ebs?.iops === undefined ? undefined : `${ebs.iops} IOPS`,
    ebs?.throughput === undefined ? undefined : `${ebs.throughput} MiB/s`,
    ebs?.volumeInitializationRate === undefined ? undefined : `initialized at ${ebs.volumeInitializationRate} MiB/s`,
    ebs?.encrypted === undefined ? undefined : ebs.encrypted ? "encrypted" : "not encrypted",
    ebs?.kmsKeyID ? `KMS key ${ebs.kmsKeyID}` : undefined,
    ebs?.snapshotID ? `snapshot ${ebs.snapshotID}` : undefined,
    ebs?.deleteOnTermination === undefined
      ? undefined
      : ebs.deleteOnTermination
        ? "deleted on termination"
        : "kept on termination",
    mapping.rootVolume ? "root volume" : undefined,
  ].filter(Boolean);
  return `${mapping.deviceName ?? "(no device name)"}${parts.length ? `: ${parts.join(", ")}` : ""}`;
}

/** A network interface: its card and device index, and its type. */
export function formatNetworkInterface(networkInterface: NetworkInterface): string {
  return `card ${networkInterface.networkCardIndex}, device ${networkInterface.deviceIndex}: ${networkInterface.interfaceType}`;
}

/** What the collapsed user data says before it is opened: the number of its lines. */
export function linesSummary(text: string): string {
  const lines = text.replace(/\n$/, "").split("\n").length;
  return lines === 1 ? "1 line" : `${lines} lines`;
}

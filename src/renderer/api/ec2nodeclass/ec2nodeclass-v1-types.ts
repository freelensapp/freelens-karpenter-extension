// The spec and status types of karpenter.k8s.aws/v1 (EC2NodeClass), after the Go types of
// aws/karpenter-provider-aws v1.15.0 (pkg/apis/v1) and the optional fields of its generated CRD.

import type { Condition, NodeSelectorRequirement } from "../types";

export interface SubnetSelectorTerm {
  tags?: Record<string, string>;
  id?: string;
}

export interface SecurityGroupSelectorTerm {
  tags?: Record<string, string>;
  id?: string;
  name?: string;
}

export type InstanceMatchCriteria = "open" | "targeted";

export interface CapacityReservationSelectorTerm {
  tags?: Record<string, string>;
  id?: string;
  ownerID?: string;
  instanceMatchCriteria?: InstanceMatchCriteria;
}

export interface PlacementGroupSelector {
  name?: string;
  id?: string;
}

export interface AMISelectorTerm {
  alias?: string;
  tags?: Record<string, string>;
  id?: string;
  name?: string;
  owner?: string;
  ssmParameter?: string;
}

export type AmiFamily = "AL2" | "AL2023" | "Bottlerocket" | "Custom" | "Windows2019" | "Windows2022" | "Windows2025";

export type VolumeType = "standard" | "io1" | "io2" | "gp2" | "sc1" | "st1" | "gp3";

export interface BlockDevice {
  deleteOnTermination?: boolean;
  encrypted?: boolean;
  iops?: number;
  kmsKeyID?: string;
  snapshotID?: string;
  throughput?: number;
  volumeInitializationRate?: number;
  volumeSize?: string;
  volumeType?: VolumeType;
}

export interface BlockDeviceMapping {
  deviceName?: string;
  ebs?: BlockDevice;
  rootVolume?: boolean;
}

export type InstanceStorePolicy = "RAID0";

export type InterfaceType = "interface" | "efa-only";

export interface NetworkInterface {
  networkCardIndex: number;
  deviceIndex: number;
  interfaceType: InterfaceType;
}

export type HttpEndpoint = "enabled" | "disabled";

export type HttpProtocolIPv6 = "enabled" | "disabled";

export type HttpTokens = "required" | "optional";

export interface MetadataOptions {
  httpEndpoint?: HttpEndpoint;
  httpProtocolIPv6?: HttpProtocolIPv6;
  httpPutResponseHopLimit?: number;
  httpTokens?: HttpTokens;
}

export interface EnclaveOptions {
  enabled: boolean;
}

export interface ConnectionTracking {
  tcpEstablishedTimeout?: number;
  udpStreamTimeout?: number;
  udpTimeout?: number;
}

export type NestedVirtualization = "enabled" | "disabled";

export interface CPUOptions {
  nestedVirtualization?: NestedVirtualization;
}

export interface EC2NodeClassSpec {
  subnetSelectorTerms: SubnetSelectorTerm[];
  securityGroupSelectorTerms: SecurityGroupSelectorTerm[];
  capacityReservationSelectorTerms?: CapacityReservationSelectorTerm[];
  placementGroupSelector?: PlacementGroupSelector;
  associatePublicIPAddress?: boolean;
  ipPrefixCount?: number;
  amiSelectorTerms: AMISelectorTerm[];
  amiFamily?: AmiFamily;
  userData?: string;
  role?: string;
  instanceProfile?: string;
  tags?: Record<string, string>;
  kubelet?: Record<string, unknown>;
  blockDeviceMappings?: BlockDeviceMapping[];
  instanceStorePolicy?: InstanceStorePolicy;
  networkInterfaces?: NetworkInterface[];
  detailedMonitoring?: boolean;
  metadataOptions?: MetadataOptions;
  enclaveOptions?: EnclaveOptions;
  connectionTracking?: ConnectionTracking;
  context?: string;
  cpuOptions?: CPUOptions;
}

export interface Subnet {
  id: string;
  zone: string;
  zoneID?: string;
}

export interface SecurityGroup {
  id: string;
  name?: string;
}

export type CapacityReservationType = "default" | "capacity-block";

export type CapacityReservationState = "active" | "expiring";

export interface CapacityReservation {
  availabilityZone: string;
  endTime?: string;
  id: string;
  instanceMatchCriteria: InstanceMatchCriteria;
  instanceType: string;
  ownerID: string;
  reservationType?: CapacityReservationType;
  interruptible?: boolean;
  state?: CapacityReservationState;
}

export interface AMI {
  id: string;
  deprecated?: boolean;
  name?: string;
  requirements: NodeSelectorRequirement[];
}

export interface EC2NodeClassStatus {
  subnets?: Subnet[];
  securityGroups?: SecurityGroup[];
  capacityReservations?: CapacityReservation[];
  amis?: AMI[];
  instanceProfile?: string;
  conditions?: Condition[];
}

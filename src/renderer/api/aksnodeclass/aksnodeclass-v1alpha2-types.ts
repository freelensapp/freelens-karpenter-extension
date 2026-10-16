// The spec and status types of karpenter.azure.com/v1alpha2 (AKSNodeClass), after the Go types of
// Azure/karpenter-provider-azure v1.14.5 (pkg/apis/v1alpha2) and the optional fields of its generated CRD.

import type { Condition, NillableDuration, NodeSelectorRequirement } from "../types";

export interface CapacityReservationConfiguration {
  groupID: string;
}

export interface IPTag {
  ipTagType: string;
  tag: string;
}

export interface NodePublicIP {
  enabled?: boolean;
  prefixIDs?: string[];
  ipTags?: IPTag[];
}

export type OSDiskType = "Managed";

export type ImageFamily =
  | "Ubuntu"
  | "Ubuntu2204"
  | "Ubuntu2404"
  | "AzureLinux"
  | "Windows2022"
  | "Windows2025"
  | "AzureContainerLinux";

export interface Versions {
  kubernetesVersion?: string;
  nodeImageVersion?: string;
}

export type FIPSMode = "FIPS" | "Disabled";

export type WorkloadRuntime = "OCIContainer" | "KataVmIsolation";

export type CpuManagerPolicy = "none" | "static";

export type TopologyManagerPolicy = "restricted" | "best-effort" | "none" | "single-numa-node";

export interface KubeReserved {
  cpuMillicores?: number;
  memoryMB?: number;
}

export interface EvictionThreshold {
  memoryAvailable?: string;
  nodeFsAvailable?: string;
  nodeFsInodesFree?: string;
}

export interface EvictionSoftGracePeriod {
  memoryAvailable?: NillableDuration;
  nodeFsAvailable?: NillableDuration;
  nodeFsInodesFree?: NillableDuration;
}

export interface KubeletConfiguration {
  cpuManagerPolicy?: CpuManagerPolicy;
  cpuCFSQuota?: boolean;
  cpuCFSQuotaPeriod?: string;
  imageGCHighThresholdPercent?: number;
  imageGCLowThresholdPercent?: number;
  topologyManagerPolicy?: TopologyManagerPolicy;
  allowedUnsafeSysctls?: string[];
  containerLogMaxSize?: string;
  containerLogMaxFiles?: number;
  podPidsLimit?: number;
  failSwapOn?: boolean;
  kubeReserved?: KubeReserved;
  evictionHard?: EvictionThreshold;
  evictionSoft?: EvictionThreshold;
  evictionSoftGracePeriod?: EvictionSoftGracePeriod;
  evictionMaxPodGracePeriod?: number;
}

export interface TrustedLaunch {
  vtpm?: boolean;
  secureBoot?: boolean;
}

export interface Security {
  encryptionAtHost?: boolean;
  trustedLaunch?: TrustedLaunch;
}

export type LocalDNSMode = "Preferred" | "Required" | "Disabled";

export type LocalDNSQueryLogging = "Error" | "Log";

export type LocalDNSProtocol = "PreferUDP" | "ForceTCP";

export type LocalDNSForwardDestination = "ClusterCoreDNS" | "VnetDNS";

export type LocalDNSForwardPolicy = "Sequential" | "RoundRobin" | "Random";

export type LocalDNSServeStale = "Verify" | "Immediate" | "Disable";

export interface LocalDNSZoneOverride {
  zone: string;
  queryLogging: LocalDNSQueryLogging;
  protocol: LocalDNSProtocol;
  forwardDestination: LocalDNSForwardDestination;
  forwardPolicy: LocalDNSForwardPolicy;
  maxConcurrent: number;
  cacheDuration: NillableDuration;
  serveStaleDuration: NillableDuration;
  serveStale: LocalDNSServeStale;
}

export interface LocalDNS {
  mode: LocalDNSMode;
  vnetDNSOverrides: LocalDNSZoneOverride[];
  kubeDNSOverrides: LocalDNSZoneOverride[];
}

export type GPUMode = "Driver" | "None";

export interface GPU {
  mode?: GPUMode;
}

export interface ArtifactStreaming {
  enabled?: boolean;
}

export interface SysctlConfiguration {
  fsAioMaxNr?: number;
  fsFileMax?: number;
  fsInotifyMaxUserWatches?: number;
  fsNrOpen?: number;
  kernelThreadsMax?: number;
  netCoreNetdevMaxBacklog?: number;
  netCoreOptmemMax?: number;
  netCoreRmemDefault?: number;
  netCoreRmemMax?: number;
  netCoreSomaxconn?: number;
  netCoreWmemDefault?: number;
  netCoreWmemMax?: number;
  netIPv4IPLocalPortRange?: string;
  netIPv4NeighDefaultGcThresh1?: number;
  netIPv4NeighDefaultGcThresh2?: number;
  netIPv4NeighDefaultGcThresh3?: number;
  netIPv4TCPFinTimeout?: number;
  netIPv4TCPKeepaliveProbes?: number;
  netIPv4TCPKeepaliveTime?: number;
  netIPv4TCPMaxSynBacklog?: number;
  netIPv4TCPMaxTwBuckets?: number;
  netIPv4TCPTwReuse?: boolean;
  netIPv4TCPKeepaliveIntvl?: number;
  netNetfilterNfConntrackBuckets?: number;
  netNetfilterNfConntrackMax?: number;
  vmMaxMapCount?: number;
  vmSwappiness?: number;
  vmVfsCachePressure?: number;
}

export type TransparentHugePageDefrag = "always" | "defer" | "defer+madvise" | "madvise" | "never";

export type TransparentHugePageEnabled = "always" | "madvise" | "never";

export interface LinuxOSConfiguration {
  swapFileSize?: string;
  sysctls?: SysctlConfiguration;
  transparentHugePageDefrag?: TransparentHugePageDefrag;
  transparentHugePageEnabled?: TransparentHugePageEnabled;
}

export interface AKSNodeClassSpec {
  vnetSubnetID?: string;
  capacityReservation?: CapacityReservationConfiguration;
  nodePublicIP?: NodePublicIP;
  osDiskType?: OSDiskType;
  osDiskSizeGB?: number;
  imageFamily?: ImageFamily;
  versions?: Versions;
  fipsMode?: FIPSMode;
  workloadRuntime?: WorkloadRuntime;
  tags?: Record<string, string>;
  kubelet?: KubeletConfiguration;
  maxPods?: number;
  security?: Security;
  localDNS?: LocalDNS;
  gpu?: GPU;
  artifactStreaming?: ArtifactStreaming;
  linuxOSConfig?: LinuxOSConfiguration;
}

export interface NodeImage {
  id: string;
  requirements: NodeSelectorRequirement[];
}

export interface RecentlyUsedVersion {
  timeUsed?: string;
  nodeImageVersion: string;
  kubernetesVersion: string;
}

export interface ObservedVersions {
  currentControlPlaneKubernetesVersion?: string;
  latestImageVersion?: string;
  recentlyUsedVersions?: RecentlyUsedVersion[];
}

export type LocalDNSState = "Enabled" | "Disabled";

export interface CapacityReservation {
  id: string;
  name: string;
  vmSize: string;
  zones?: string[];
  quantity?: number;
  provisioningState?: string;
}

export interface CapacityReservationGroup {
  id: string;
  location: string;
  zones?: string[];
  capacityReservations?: CapacityReservation[];
}

export interface AKSNodeClassStatus {
  images?: NodeImage[];
  observedVersions?: ObservedVersions;
  kubernetesVersion?: string;
  conditions?: Condition[];
  localDNSState?: LocalDNSState;
  capacityReservationGroup?: CapacityReservationGroup;
}

// The spec and status types of karpenter.k8s.gcp/v1alpha1 (GCENodeClass), after the Go types of
// cloudpilot-ai/karpenter-provider-gcp v0.7.0 (pkg/apis/v1alpha1) and the optional fields of its generated CRD.

import type { Condition, NodeSelectorRequirement } from "../types";

export type ImageFamily = "Ubuntu" | "ContainerOptimizedOS";

export type ConfidentialInstanceType = "SEV" | "SEV_SNP" | "TDX";

export type GPUDriverVersion = "default" | "latest" | "disabled";

export type LocalSSDMode = "RawBlock" | "Ephemeral";

export interface GCENodeClassSpec {
  serviceAccount?: string;
  disks?: Disk[];
  imageSelectorTerms: ImageSelectorTerm[];
  imageFamily?: ImageFamily;
  /** Deprecated by the provider in favour of `subnetRangeNames` with one name; the two are mutually exclusive. */
  subnetRangeName?: string;
  subnetRangeNames?: string[];
  kubeletConfiguration?: KubeletConfiguration;
  linuxNodeConfig?: LinuxNodeConfig;
  labels?: Record<string, string>;
  metadata?: Record<string, string>;
  networkTags?: NetworkTag[];
  shieldedInstanceConfig?: ShieldedInstanceConfig;
  advancedMachineFeatures?: AdvancedMachineFeatures;
  confidentialInstanceType?: ConfidentialInstanceType;
  networkConfig?: NetworkConfig;
  autoGPUTaint?: boolean;
  gpuDriverVersion?: GPUDriverVersion;
  localSsdMode?: LocalSSDMode;
  /** A `metav1.Duration` of at most two minutes, such as `120s`. */
  preemptionNoticeDuration?: string;
}

export interface NetworkConfig {
  enablePrivateNodes?: boolean;
  subnetwork?: string;
  additionalNetworkInterfaces?: AdditionalNetworkInterface[];
}

export interface AdditionalNetworkInterface {
  network?: string;
  subnetwork: string;
}

export type ImageSelectorFamily = "ContainerOptimizedOS" | "Ubuntu2404" | "Ubuntu2204";

export type ImageChannel = "rapid" | "regular" | "stable" | "extended" | "cluster";

export interface ImageSelectorTerm {
  /** Deprecated by the provider in favour of `family` with `channel` or `version`. */
  alias?: string;
  id?: string;
  family?: ImageSelectorFamily;
  channel?: ImageChannel;
  version?: string;
}

/** A kubelet resource quantity or percentage, such as `100m`, `1Gi` or `10%`. */
export type KubeletQuantity = string;

export interface KubeletConfiguration {
  clusterDNS?: string[];
  maxPods?: number;
  podsPerCore?: number;
  systemReserved?: Record<string, KubeletQuantity>;
  kubeReserved?: Record<string, KubeletQuantity>;
  evictionHard?: Record<string, KubeletQuantity>;
  evictionSoft?: Record<string, KubeletQuantity>;
  /** `metav1.Duration` values, such as `1m30s`. */
  evictionSoftGracePeriod?: Record<string, string>;
  evictionMaxPodGracePeriod?: number;
  imageGCHighThresholdPercent?: number;
  imageGCLowThresholdPercent?: number;
  cpuCFSQuota?: boolean;
  serializeImagePulls?: boolean;
  maxParallelImagePulls?: number;
}

export interface Disk {
  sizeGiB?: number;
  category?: DiskCategory;
  boot?: boolean;
  secondaryBootImage?: string;
  secondaryBootMode?: SecondaryBootDiskMode;
  kmsKeyName?: string;
  kmsKeyServiceAccount?: string;
  provisionedIOPS?: number;
  provisionedThroughput?: number;
}

export type DiskCategory =
  | "hyperdisk-balanced"
  | "hyperdisk-balanced-high-availability"
  | "hyperdisk-extreme"
  | "hyperdisk-ml"
  | "hyperdisk-throughput"
  | "pd-balanced"
  | "pd-extreme"
  | "pd-ssd"
  | "pd-standard";

export type SecondaryBootDiskMode = "MODE_UNSPECIFIED" | "CONTAINER_IMAGE_CACHE";

/** A GCE network tag: lowercase letters, digits and hyphens, RFC 1035. */
export type NetworkTag = string;

export interface ShieldedInstanceConfig {
  enableSecureBoot?: boolean;
  enableVtpm?: boolean;
  enableIntegrityMonitoring?: boolean;
}

export interface LinuxNodeConfig {
  hugepages?: HugepagesConfig;
}

export interface HugepagesConfig {
  hugepageSize2m?: number;
  hugepageSize1g?: number;
}

export interface AdvancedMachineFeatures {
  enableNestedVirtualization?: boolean;
}

export interface GCENodeClassStatus {
  images?: Image[];
  subnetRanges?: SubnetRangeStatus[];
  conditions?: Condition[];
}

export interface SubnetRangeStatus {
  name: string;
  totalFreeIP?: number;
}

export interface Image {
  sourceImage: string;
  requirements: NodeSelectorRequirement[];
}

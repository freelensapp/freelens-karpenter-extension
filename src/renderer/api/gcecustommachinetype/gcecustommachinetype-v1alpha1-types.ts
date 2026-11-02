// The spec and status types of karpenter.k8s.gcp/v1alpha1 (GCECustomMachineType), after the Go types of
// cloudpilot-ai/karpenter-provider-gcp v0.7.0 (pkg/apis/v1alpha1) and the optional fields of its generated CRD.

import type { Condition } from "../types";

export interface GCECustomMachineTypeSpec {
  /** A GCE custom machine type, such as `n2-custom-8-24576` or `n2-custom-8-24576-ext`; immutable. */
  machineType: string;
  prices: GCECustomMachineTypePrices;
}

/** Hourly prices in USD, as decimal strings, such as `0.3891`. */
export interface GCECustomMachineTypePrices {
  onDemand: string;
  spot: string;
}

export interface GCECustomMachineTypeStatus {
  guestCpus?: number;
  memoryMb?: number;
  zones?: string[];
  conditions?: Condition[];
}

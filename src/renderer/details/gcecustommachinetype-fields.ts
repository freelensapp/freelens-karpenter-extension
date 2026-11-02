// What the details of a GCECustomMachineType of karpenter.k8s.gcp/v1alpha1 show of its fields, as text: its prices
// and the resources the provider resolved for it, after the Go types of cloudpilot-ai/karpenter-provider-gcp v0.7.0.

import { GCECustomMachineType } from "../api/gcecustommachinetype/gcecustommachinetype-v1alpha1";
import { resourceQuantity } from "../utils/quantity";

/** An hourly price of `spec.prices`, a decimal string of USD, as written: `0.3891 USD per hour`. */
export function formatPrice(price: string | undefined): string | undefined {
  return price ? `${price} USD per hour` : undefined;
}

/** The vCPUs the provider resolved, `status.guestCpus`; none until it is resolved. */
export function guestCpusText(machineType: GCECustomMachineType): string | undefined {
  const guestCpus = machineType.status?.guestCpus;
  return guestCpus ? String(guestCpus) : undefined;
}

/**
 * The memory the provider resolved, `status.memoryMb`, in units, as the host's Node details show memory
 * (`resourceQuantity`): `24576` MiB as `24.0GiB`; none until it is resolved.
 */
export function memoryText(machineType: GCECustomMachineType): string | undefined {
  return resourceQuantity("memory", GCECustomMachineType.getMemory(machineType));
}

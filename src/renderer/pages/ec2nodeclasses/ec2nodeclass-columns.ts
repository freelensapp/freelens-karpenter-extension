// The columns of `kubectl get ec2nodeclasses -o wide`, from the `additionalPrinterColumns` of
// karpenter.k8s.aws_ec2nodeclasses.yaml of aws/karpenter-provider-aws v1.15.1: the value of each `jsonPath` as
// `kubectl` prints it, and the value it sorts by.

import { conditionStatus, conditionStatusOrder } from "../../utils/printer-columns";

import type { EC2NodeClass } from "../../api/ec2nodeclass/ec2nodeclass-v1";

export interface EC2NodeClassColumnValues {
  /** Ready: `.status.conditions[?(@.type=="Ready")].status`. */
  ready: string | undefined;
  /** Role: `.spec.role`, `-o wide`. Empty for an EC2NodeClass with an instance profile instead. */
  role: string | undefined;
}

/** The cells of an EC2NodeClass's row, Name and Age aside. */
export function ec2NodeClassColumnValues(nodeClass: EC2NodeClass): EC2NodeClassColumnValues {
  return {
    ready: conditionStatus(nodeClass.status?.conditions, "Ready"),
    role: nodeClass.spec?.role || undefined,
  };
}

/**
 * What each column sorts by: the status of Ready in the order of the other pages, `True`, `False`, `Unknown`, then
 * none, and the role by its name, an EC2NodeClass without one first.
 */
export const ec2NodeClassSortValues: Record<
  keyof EC2NodeClassColumnValues,
  (nodeClass: EC2NodeClass) => string | number
> = {
  ready: (nodeClass) => conditionStatusOrder(ec2NodeClassColumnValues(nodeClass).ready),
  role: (nodeClass) => ec2NodeClassColumnValues(nodeClass).role ?? "",
};

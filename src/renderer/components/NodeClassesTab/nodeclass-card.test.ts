import { describe, expect, it } from "vitest";
import {
  countNodesByPool,
  type NodeClass,
  nodeClassMetaItems,
  nodeClassProvider,
  nodePoolRowValues,
  nodePoolsOfNodeClass,
} from "./nodeclass-card";

import type { NodePool } from "../../api/nodepool/nodepool-v1";
import type { Node } from "../../utils/kube-helpers";

// The helpers read only the fields of the objects, as the host's objects have them.
const ec2 = (name: string, spec: Record<string, unknown> = {}) =>
  ({ apiVersion: "karpenter.k8s.aws/v1", kind: "EC2NodeClass", metadata: { name }, spec }) as unknown as NodeClass;
const aks = (name: string, spec: Record<string, unknown> = {}, version = "v1beta1") =>
  ({
    apiVersion: `karpenter.azure.com/${version}`,
    kind: "AKSNodeClass",
    metadata: { name },
    spec,
  }) as unknown as NodeClass;

const pool = (
  name: string,
  nodeClassRef: { group?: string; kind: string; name: string } | undefined,
  fields: { spec?: Record<string, unknown>; template?: Record<string, unknown>; status?: Record<string, unknown> } = {},
) =>
  ({
    metadata: { name },
    spec: { ...fields.spec, template: { spec: { nodeClassRef, ...fields.template } } },
    status: fields.status,
  }) as unknown as NodePool;

const awsRef = (name: string) => ({ group: "karpenter.k8s.aws", kind: "EC2NodeClass", name });
const azureRef = (name: string) => ({ group: "karpenter.azure.com", kind: "AKSNodeClass", name });

describe("nodeClassProvider", () => {
  it("is aws for an EC2NodeClass and azure for an AKSNodeClass of either version", () => {
    expect(nodeClassProvider(ec2("a"))).toBe("aws");
    expect(nodeClassProvider(aks("a"))).toBe("azure");
    expect(nodeClassProvider(aks("a", {}, "v1alpha2"))).toBe("azure");
  });
});

describe("nodeClassMetaItems", () => {
  it("summarises an EC2NodeClass, its role and its kubelet settings", () => {
    const nodeClass = ec2("default", {
      amiFamily: "AL2023",
      role: "KarpenterNodeRole-lab",
      amiSelectorTerms: [{ alias: "al2023@latest" }],
      subnetSelectorTerms: [{ tags: { a: "b" } }, { id: "subnet-1" }],
      securityGroupSelectorTerms: [{ id: "sg-1" }],
      kubelet: { maxPods: 58 },
    });
    expect(nodeClassMetaItems(nodeClass)).toEqual([
      { label: "Image Family", value: "AL2023" },
      { label: "Role", value: "KarpenterNodeRole-lab" },
      { label: "AMI Selectors", value: 1 },
      { label: "Subnets", value: 2 },
      { label: "Security Groups", value: 1 },
      { label: "Kubelet Config", value: "✓" },
    ]);
  });

  it("names the instance profile of an EC2NodeClass that has one, and leaves out what is not set", () => {
    expect(nodeClassMetaItems(ec2("p", { instanceProfile: "profile", role: "ignored", kubelet: {} }))).toEqual([
      { label: "Instance Profile", value: "profile" },
    ]);
    expect(nodeClassMetaItems(ec2("empty"))).toEqual([]);
  });

  it("summarises an AKSNodeClass of v1beta1 and of v1alpha2 alike", () => {
    for (const version of ["v1beta1", "v1alpha2"]) {
      const nodeClass = aks(
        "default",
        { imageFamily: "AzureLinux", osDiskSizeGB: 128, kubelet: { cpuManagerPolicy: "static" } },
        version,
      );
      expect(nodeClassMetaItems(nodeClass)).toEqual([
        { label: "Image Family", value: "AzureLinux" },
        { label: "OS Disk", value: "128 GB" },
        { label: "Kubelet Config", value: "✓" },
      ]);
    }
  });

  it("does not read the v1beta1 name kubeletConfig", () => {
    expect(nodeClassMetaItems(aks("a", { kubeletConfig: { maxPods: 10 } }))).toEqual([]);
    expect(nodeClassMetaItems(ec2("a", { kubeletConfig: { maxPods: 10 } }))).toEqual([]);
  });
});

describe("nodePoolsOfNodeClass", () => {
  const pools = [
    pool("general", awsRef("default")),
    pool("gpu", awsRef("gpu")),
    pool("azure", azureRef("default")),
    pool("legacy", { kind: "EC2NodeClass", name: "default" }),
    pool("other-group", { group: "example.com", kind: "EC2NodeClass", name: "default" }),
    pool("no-ref", undefined),
  ];
  const names = (nodeClass: NodeClass) => nodePoolsOfNodeClass(nodeClass, pools).map((np) => np.metadata.name);

  it("matches a NodePool by the group, kind and name of its nodeClassRef", () => {
    expect(names(ec2("default"))).toEqual(["general", "legacy"]);
    expect(names(aks("default"))).toEqual(["azure"]);
    expect(names(aks("default", {}, "v1alpha2"))).toEqual(["azure"]);
    expect(names(ec2("gpu"))).toEqual(["gpu"]);
    expect(names(ec2("unused"))).toEqual([]);
  });
});

describe("countNodesByPool", () => {
  it("counts the nodes of each NodePool and skips the others", () => {
    const node = (labels?: Record<string, string>) => ({ metadata: { name: "n", labels } }) as unknown as Node;
    const counts = countNodesByPool([
      node({ "karpenter.sh/nodepool": "general" }),
      node({ "karpenter.sh/nodepool": "general" }),
      node({ "karpenter.sh/nodepool": "gpu" }),
      node(),
    ]);
    expect(counts).toEqual({ general: 2, gpu: 1 });
  });
});

describe("nodePoolRowValues", () => {
  it("reads the resources, limits, consolidation and expiry of karpenter.sh/v1", () => {
    const nodePool = pool("general", awsRef("default"), {
      spec: {
        limits: { cpu: "100", memory: "400Gi" },
        disruption: { consolidationPolicy: "WhenEmptyOrUnderutilized" },
      },
      template: { expireAfter: "720h" },
      status: { resources: { cpu: "14", memory: "59687568Ki" } },
    });
    expect(nodePoolRowValues(nodePool)).toEqual({
      cpuUsed: "14",
      memoryUsed: "56.9Gi",
      limitCpu: "100",
      limitMemory: "400Gi",
      consolidation: "WhenEmptyOrUnderutilized",
      expireAfter: "720h",
    });
  });

  it("does not read the v1beta1 spec.disruption.expireAfter, and shows a dash for what is not set", () => {
    const nodePool = pool("p", awsRef("default"), { spec: { disruption: { expireAfter: "24h" } } });
    expect(nodePoolRowValues(nodePool)).toEqual({
      cpuUsed: "—",
      memoryUsed: "—",
      limitCpu: "—",
      limitMemory: "—",
      consolidation: "—",
      expireAfter: "—",
    });
  });

  it("shows Never as the expiry of a NodePool whose nodes do not expire", () => {
    expect(nodePoolRowValues(pool("p", awsRef("d"), { template: { expireAfter: "Never" } })).expireAfter).toBe("Never");
  });
});

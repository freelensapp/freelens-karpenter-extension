// @vitest-environment jsdom

import { Renderer } from "@freelensapp/extensions";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EC2NodeClass } from "../api/ec2nodeclass/ec2nodeclass-v1";
import { NodePool } from "../api/nodepool/nodepool-v1";
import { useSubscribedStores } from "../data/use-subscribed-stores";
import { EC2NodeClassDetails } from "./ec2nodeclass-details";

const lastTransitionTime = "2026-10-01T08:00:00Z";

const nodePool = (name: string, nodeClassName: string) =>
  new NodePool({
    apiVersion: "karpenter.sh/v1",
    kind: "NodePool",
    metadata: { name, uid: name, resourceVersion: "1", selfLink: "" },
    spec: {
      template: {
        spec: {
          nodeClassRef: { group: "karpenter.k8s.aws", kind: "EC2NodeClass", name: nodeClassName },
          requirements: [],
        },
      },
    },
  });

// The NodePools of the AWS fixtures of the integration tests: general and empty use default, gpu uses gpu.
const nodePools = [nodePool("general", "default"), nodePool("gpu", "gpu"), nodePool("empty", "default")];

// default of the fixtures, with the fields that they leave out.
const defaultClass = new EC2NodeClass({
  apiVersion: "karpenter.k8s.aws/v1",
  kind: "EC2NodeClass",
  metadata: { name: "default", uid: "1", resourceVersion: "1", selfLink: "" },
  spec: {
    role: "KarpenterNodeRole-lab",
    amiFamily: "AL2023",
    amiSelectorTerms: [{ alias: "al2023@latest" }],
    subnetSelectorTerms: [{ tags: { "karpenter.sh/discovery": "lab" } }],
    securityGroupSelectorTerms: [{ tags: { "karpenter.sh/discovery": "lab" } }],
    capacityReservationSelectorTerms: [{ tags: { "karpenter.sh/discovery": "lab" } }],
    placementGroupSelector: { name: "lab-cluster" },
    associatePublicIPAddress: false,
    ipPrefixCount: 2,
    blockDeviceMappings: [
      { deviceName: "/dev/xvda", rootVolume: true, ebs: { volumeSize: "100Gi", volumeType: "gp3" } },
    ],
    instanceStorePolicy: "RAID0",
    networkInterfaces: [{ networkCardIndex: 0, deviceIndex: 0, interfaceType: "interface" }],
    connectionTracking: { tcpEstablishedTimeout: 432000 },
    metadataOptions: { httpEndpoint: "enabled", httpPutResponseHopLimit: 1, httpTokens: "required" },
    detailedMonitoring: true,
    enclaveOptions: { enabled: false },
    cpuOptions: { nestedVirtualization: "enabled" },
    kubelet: { maxPods: 58, kubeReserved: { cpu: "100m" } },
    tags: { team: "platform" },
    context: "cr-context",
    userData: "#!/bin/bash\necho hello\n",
  },
  status: {
    instanceProfile: "lab_1234567890",
    amis: [
      {
        id: "ami-0a1b2c3d4e5f60001",
        name: "al2023",
        requirements: [{ key: "kubernetes.io/arch", operator: "In", values: ["amd64"] }],
      },
    ],
    subnets: [{ id: "subnet-0a1b2c3d4e5f60002", zone: "eu-west-1b", zoneID: "euw1-az2" }],
    securityGroups: [{ id: "sg-0a1b2c3d4e5f60001", name: "lab-node" }],
    capacityReservations: [
      {
        id: "cr-0a1b2c3d4e5f60001",
        instanceType: "p5.48xlarge",
        availabilityZone: "eu-west-1a",
        reservationType: "capacity-block",
        state: "expiring",
        endTime: "2026-11-02T11:30:00Z",
        instanceMatchCriteria: "targeted",
        ownerID: "123456789012",
      },
    ],
    conditions: [{ type: "Ready", status: "True", reason: "Ready", message: "", lastTransitionTime }],
  },
});

// gpu of the fixtures: its AMI selector found nothing.
const gpuClass = new EC2NodeClass({
  apiVersion: "karpenter.k8s.aws/v1",
  kind: "EC2NodeClass",
  metadata: { name: "gpu", uid: "2", resourceVersion: "1", selfLink: "" },
  spec: {
    instanceProfile: "KarpenterNodeInstanceProfile-lab",
    amiFamily: "Bottlerocket",
    amiSelectorTerms: [{ alias: "bottlerocket@latest" }],
    subnetSelectorTerms: [{ id: "subnet-0a1b2c3d4e5f60001" }],
    securityGroupSelectorTerms: [{ id: "sg-0a1b2c3d4e5f60001" }],
  },
  status: {
    conditions: [
      {
        type: "AMIsReady",
        status: "False",
        reason: "AMINotFound",
        message: "AMISelector did not match any AMIs",
        lastTransitionTime,
      },
      { type: "Ready", status: "False", reason: "UnhealthyDependents", message: "AMIsReady=False", lastTransitionTime },
    ],
  },
});

vi.mock("../data/stores", () => ({
  getNodePoolStore: () => ({ items: nodePools, api: { apiBase: "/apis/karpenter.sh/v1/nodepools" } }),
}));

vi.mock("../data/use-subscribed-stores", () => ({ useSubscribedStores: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("EC2NodeClassDetails", () => {
  it("shows each selector next to what it resolved to", () => {
    render(<EC2NodeClassDetails object={defaultClass} />);

    for (const text of [
      "alias: al2023@latest",
      "ami-0a1b2c3d4e5f60001 (al2023): kubernetes.io/arch In [amd64]",
      "AL2023",
      "subnet-0a1b2c3d4e5f60002 (eu-west-1b, euw1-az2)",
      "sg-0a1b2c3d4e5f60001 (lab-node)",
      "cr-0a1b2c3d4e5f60001 p5.48xlarge in eu-west-1a (capacity-block, expiring, ends 2026-11-02T11:30:00Z, targeted match, owner 123456789012)",
      "name: lab-cluster",
      "KarpenterNodeRole-lab",
      "lab_1234567890",
    ]) {
      expect(screen.getByText(text)).toBeTruthy();
    }
    expect(screen.getAllByText("tags: karpenter.sh/discovery=lab")).toHaveLength(3);
    for (const name of ["Not Ready", "Not Validated"]) {
      expect(screen.queryByText(name)).toBeNull();
    }
  });

  it("shows the launch settings of the instances", () => {
    render(<EC2NodeClassDetails object={defaultClass} />);

    for (const text of [
      "/dev/xvda: 100Gi, gp3, root volume",
      "RAID0",
      "card 0, device 0: interface",
      "tcpEstablishedTimeout: 432000",
      "2",
      "httpTokens: required",
      "nestedVirtualization: enabled",
      "maxPods: 58",
      "kubeReserved: cpu=100m",
      "team=platform",
      "cr-context",
      "2 lines",
    ]) {
      expect(screen.getByText(text)).toBeTruthy();
    }
    // Associate Public IP Address, Detailed Monitoring and Enclave.
    expect(screen.getAllByText("False")).toHaveLength(2);
    expect(screen.getAllByText("True")).toHaveLength(1);
    expect(screen.getByText(/echo hello/)).toBeTruthy();
  });

  it("opens a NodePool that uses it in the drawer", () => {
    render(<EC2NodeClassDetails object={defaultClass} />);

    expect(screen.getByText("Used By")).toBeTruthy();
    expect(screen.queryByText("gpu")).toBeNull();
    fireEvent.click(screen.getByText("empty"));
    expect(Renderer.Navigation.showDetails).toHaveBeenLastCalledWith("/apis/karpenter.sh/v1/nodepools/empty");
    fireEvent.click(screen.getByText("general"));
    expect(Renderer.Navigation.showDetails).toHaveBeenLastCalledWith("/apis/karpenter.sh/v1/nodepools/general");
  });

  it("shows why an EC2NodeClass is not ready, at the selector that did not resolve, and hides what is not set", () => {
    render(<EC2NodeClassDetails object={gpuClass} />);

    expect(screen.getByText("False, UnhealthyDependents: AMIsReady=False")).toBeTruthy();
    expect(screen.getByText("False, AMINotFound: AMISelector did not match any AMIs")).toBeTruthy();
    expect(screen.getByText("KarpenterNodeInstanceProfile-lab")).toBeTruthy();
    for (const name of [
      "Role",
      "Resolved",
      "Capacity Reservations",
      "Placement Group",
      "Block Device Mappings",
      "Metadata Options",
      "Kubelet",
      "Tags",
      "User Data",
      "Detailed Monitoring",
    ]) {
      expect(screen.queryByText(name)).toBeNull();
    }
    expect(screen.getByText("gpu")).toBeTruthy();
  });

  it("subscribes to the store of the NodePools", () => {
    render(<EC2NodeClassDetails object={defaultClass} />);

    const [stores] = vi.mocked(useSubscribedStores).mock.calls[0] ?? [];
    expect(stores?.map((store) => store?.api.apiBase)).toEqual(["/apis/karpenter.sh/v1/nodepools"]);
  });
});

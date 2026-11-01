// @vitest-environment jsdom

import { Renderer } from "@freelensapp/extensions";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AKSNodeClass as AKSNodeClassV1alpha2 } from "../api/aksnodeclass/aksnodeclass-v1alpha2";
import { AKSNodeClass as AKSNodeClassV1beta1 } from "../api/aksnodeclass/aksnodeclass-v1beta1";
import { NodePool } from "../api/nodepool/nodepool-v1";
import { useSubscribedStores } from "../data/use-subscribed-stores";
import { AKSNodeClassDetails } from "./aksnodeclass-details";

const lastTransitionTime = "2026-10-01T08:00:00Z";

const image =
  "/CommunityGalleries/AKSAzureLinux-f7c7cda5-1c9a-4bdc-a222-9614c968580b/images/V3gen2/versions/202610.01.0";
const subnet = "/subscriptions/0/resourceGroups/lab/providers/Microsoft.Network/virtualNetworks/lab/subnets/nodes";
const groupID = "/subscriptions/0/resourceGroups/lab/providers/Microsoft.Compute/capacityReservationGroups/crg";

const nodePool = (name: string, nodeClassName: string) =>
  new NodePool({
    apiVersion: "karpenter.sh/v1",
    kind: "NodePool",
    metadata: { name, uid: name, resourceVersion: "1", selfLink: "" },
    spec: {
      template: {
        spec: {
          nodeClassRef: { group: "karpenter.azure.com", kind: "AKSNodeClass", name: nodeClassName },
          requirements: [],
        },
      },
    },
  });

const nodePools = [nodePool("azure", "default"), nodePool("system", "default"), nodePool("gpu", "gpu")];

// default of the fixtures of the integration tests, with the fields that they leave out.
const defaultClass = new AKSNodeClassV1beta1({
  apiVersion: "karpenter.azure.com/v1beta1",
  kind: "AKSNodeClass",
  metadata: { name: "default", uid: "1", resourceVersion: "1", selfLink: "" },
  spec: {
    vnetSubnetID: subnet,
    capacityReservation: { groupID },
    nodePublicIP: {
      enabled: true,
      prefixIDs: ["/subscriptions/0/resourceGroups/lab/providers/Microsoft.Network/publicIPPrefixes/nodes"],
      ipTags: [{ ipTagType: "RoutingPreference", tag: "Internet" }],
    },
    osDiskType: "Managed",
    osDiskSizeGB: 128,
    imageFamily: "AzureLinux",
    versions: { kubernetesVersion: "1.33.2" },
    fipsMode: "FIPS",
    workloadRuntime: "OCIContainer",
    tags: { team: "platform" },
    kubelet: { cpuManagerPolicy: "static", kubeReserved: { cpuMillicores: 100 } },
    maxPods: 50,
    security: { encryptionAtHost: true, trustedLaunch: { vtpm: true, secureBoot: true } },
    localDNS: {
      mode: "Preferred",
      vnetDNSOverrides: [
        {
          zone: ".",
          queryLogging: "Error",
          protocol: "PreferUDP",
          forwardDestination: "VnetDNS",
          forwardPolicy: "Sequential",
          maxConcurrent: 1000,
          cacheDuration: "1h",
          serveStaleDuration: "1h",
          serveStale: "Verify",
        },
      ],
      kubeDNSOverrides: [],
    },
    gpu: { mode: "Driver", nvidia: { managementMode: "Managed" } },
    artifactStreaming: { enabled: false },
    linuxOSConfig: { transparentHugePageEnabled: "madvise", sysctls: { vmMaxMapCount: 262144 } },
  },
  status: {
    kubernetesVersion: "1.33.2",
    images: [{ id: image, requirements: [{ key: "kubernetes.io/arch", operator: "In", values: ["amd64"] }] }],
    observedVersions: {
      currentControlPlaneKubernetesVersion: "1.34.0",
      latestImageVersion: "202610.01.0",
      recentlyUsedVersions: [{ kubernetesVersion: "1.33.1", nodeImageVersion: "202609.15.0" }],
    },
    localDNSState: "Enabled",
    capacityReservationGroup: {
      id: groupID,
      location: "westeurope",
      zones: ["1"],
      capacityReservations: [
        {
          id: `${groupID}/capacityReservations/d4`,
          name: "d4",
          vmSize: "Standard_D4s_v5",
          provisioningState: "Failed",
        },
      ],
    },
    conditions: [
      {
        type: "CapacityReservationGroupReady",
        status: "True",
        reason: "CapacityReservationGroupReady",
        message: "",
        lastTransitionTime,
      },
      { type: "Ready", status: "True", reason: "Ready", message: "", lastTransitionTime },
    ],
  },
});

// An AKSNodeClass of v1alpha2, which the Azure provider served until v1.14.2: its subnet was not found.
const legacyClass = new AKSNodeClassV1alpha2({
  apiVersion: "karpenter.azure.com/v1alpha2",
  kind: "AKSNodeClass",
  metadata: { name: "gpu", uid: "2", resourceVersion: "1", selfLink: "" },
  spec: { imageFamily: "Ubuntu2204", vnetSubnetID: subnet, gpu: { mode: "None" } },
  status: {
    conditions: [
      {
        type: "SubnetsReady",
        status: "False",
        reason: "SubnetNotFound",
        message: "subnet not found",
        lastTransitionTime,
      },
      {
        type: "Ready",
        status: "False",
        reason: "UnhealthyDependents",
        message: "SubnetsReady=False",
        lastTransitionTime,
      },
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

describe("AKSNodeClassDetails", () => {
  it("shows the image, the versions and the capacity reservation it resolved", () => {
    render(<AKSNodeClassDetails object={defaultClass} />);

    for (const text of [
      "AzureLinux",
      "FIPS",
      `${image}: kubernetes.io/arch In [amd64]`,
      "kubernetesVersion: 1.33.2",
      "1.34.0",
      "202610.01.0",
      "Kubernetes 1.33.1, image 202609.15.0",
      groupID,
      `${groupID} (westeurope, zones 1)`,
      "d4 Standard_D4s_v5 (regional, Failed)",
    ]) {
      expect(screen.getByText(text)).toBeTruthy();
    }
    // The resolved version, and the pinned one.
    expect(screen.getByText("1.33.2")).toBeTruthy();
    for (const name of ["Not Ready", "Not Validated"]) {
      expect(screen.queryByText(name)).toBeNull();
    }
  });

  it("shows the network and local DNS", () => {
    render(<AKSNodeClassDetails object={defaultClass} />);

    for (const text of [
      subnet,
      "/subscriptions/0/resourceGroups/lab/providers/Microsoft.Network/publicIPPrefixes/nodes",
      "RoutingPreference=Internet",
      "Preferred",
      "Enabled",
      ".: forward to VnetDNS, Sequential, PreferUDP, max 1000 concurrent, cache 1h, serve stale Verify for 1h, log Error",
    ]) {
      expect(screen.getByText(text)).toBeTruthy();
    }
    expect(screen.queryByText("Kube DNS Overrides")).toBeNull();
  });

  it("shows the settings of the nodes, gpu.nvidia of v1beta1 among them", () => {
    render(<AKSNodeClassDetails object={defaultClass} />);

    for (const text of [
      "Managed",
      "128 GB",
      "50",
      "OCIContainer",
      "encryptionAtHost: true",
      "trustedLaunch: vtpm=true, secureBoot=true",
      "mode: Driver",
      "nvidia: managementMode=Managed",
      "cpuManagerPolicy: static",
      "kubeReserved: cpuMillicores=100",
      "transparentHugePageEnabled: madvise",
      "vmMaxMapCount: 262144",
      "team=platform",
    ]) {
      expect(screen.getByText(text)).toBeTruthy();
    }
    // Node Public IP, and Artifact Streaming.
    expect(screen.getAllByText("True")).toHaveLength(1);
    expect(screen.getAllByText("False")).toHaveLength(1);
  });

  it("opens a NodePool that uses it in the drawer", () => {
    render(<AKSNodeClassDetails object={defaultClass} />);

    expect(screen.getByText("Used By")).toBeTruthy();
    expect(screen.queryByText("gpu")).toBeNull();
    fireEvent.click(screen.getByText("system"));
    expect(Renderer.Navigation.showDetails).toHaveBeenLastCalledWith("/apis/karpenter.sh/v1/nodepools/system");
    fireEvent.click(screen.getByText("azure"));
    expect(Renderer.Navigation.showDetails).toHaveBeenLastCalledWith("/apis/karpenter.sh/v1/nodepools/azure");
  });

  it("shows an AKSNodeClass of v1alpha2, why it is not ready at its subnet, and hides what is not set", () => {
    render(<AKSNodeClassDetails object={legacyClass} />);

    expect(screen.getByText("False, UnhealthyDependents: SubnetsReady=False")).toBeTruthy();
    expect(screen.getByText("False, SubnetNotFound: subnet not found")).toBeTruthy();
    expect(screen.getByText(subnet)).toBeTruthy();
    expect(screen.getByText("Ubuntu2204")).toBeTruthy();
    expect(screen.getByText("mode: None")).toBeTruthy();
    for (const name of [
      "Images",
      "Versions",
      "Local DNS",
      "Capacity Reservation",
      "Node Public IP",
      "OS Disk Size",
      "Max Pods",
      "Security",
      "Kubelet",
      "Sysctls",
      "Tags",
      "Artifact Streaming",
    ]) {
      expect(screen.queryByText(name)).toBeNull();
    }
    expect(screen.getByText("gpu")).toBeTruthy();
  });

  it("subscribes to the store of the NodePools", () => {
    render(<AKSNodeClassDetails object={defaultClass} />);

    const [stores] = vi.mocked(useSubscribedStores).mock.calls[0] ?? [];
    expect(stores?.map((store) => store?.api.apiBase)).toEqual(["/apis/karpenter.sh/v1/nodepools"]);
  });
});

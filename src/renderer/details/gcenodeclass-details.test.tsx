// @vitest-environment jsdom

import { Renderer } from "@freelensapp/extensions";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GCENodeClass } from "../api/gcenodeclass/gcenodeclass-v1alpha1";
import { NodePool } from "../api/nodepool/nodepool-v1";
import { useSubscribedStores } from "../data/use-subscribed-stores";
import { GCENodeClassDetails } from "./gcenodeclass-details";

const lastTransitionTime = "2026-10-01T08:00:00Z";

const sourceImage = "projects/gke-node-images/global/images/gke-1336-gke1046000-cos-121-18867-90-38-c-pre";
const subnetwork = "projects/lab/regions/us-central1/subnetworks/nodes";
const storageSubnetwork = "projects/lab/regions/us-central1/subnetworks/storage";

const nodePool = (name: string, nodeClassName: string) =>
  new NodePool({
    apiVersion: "karpenter.sh/v1",
    kind: "NodePool",
    metadata: { name, uid: name, resourceVersion: "1", selfLink: "" },
    spec: {
      template: {
        spec: {
          nodeClassRef: { group: "karpenter.k8s.gcp", kind: "GCENodeClass", name: nodeClassName },
          requirements: [],
        },
      },
    },
  });

const nodePools = [nodePool("gke", "default"), nodePool("system", "default"), nodePool("gpu", "ubuntu")];

// default of the fixtures of the integration tests, with the fields that they leave out.
const defaultClass = new GCENodeClass({
  apiVersion: "karpenter.k8s.gcp/v1alpha1",
  kind: "GCENodeClass",
  metadata: { name: "default", uid: "1", resourceVersion: "1", selfLink: "" },
  spec: {
    serviceAccount: "karpenter-node@lab.iam.gserviceaccount.com",
    imageSelectorTerms: [{ family: "ContainerOptimizedOS", channel: "stable" }],
    imageFamily: "ContainerOptimizedOS",
    disks: [
      { category: "pd-balanced", sizeGiB: 100, boot: true },
      { category: "hyperdisk-balanced", sizeGiB: 500, provisionedIOPS: 3000 },
    ],
    subnetRangeName: "pods",
    kubeletConfiguration: { maxPods: 64, evictionHard: { "memory.available": "5%" } },
    labels: { team: "platform" },
    metadata: { "serial-port-enable": "true" },
    networkTags: ["karpenter", "lab"],
    shieldedInstanceConfig: { enableSecureBoot: true, enableIntegrityMonitoring: true },
    confidentialInstanceType: "SEV_SNP",
    networkConfig: {
      enablePrivateNodes: true,
      subnetwork,
      additionalNetworkInterfaces: [{ network: "storage", subnetwork: storageSubnetwork }],
    },
    autoGPUTaint: false,
    gpuDriverVersion: "latest",
  },
  status: {
    images: [{ sourceImage, requirements: [{ key: "kubernetes.io/arch", operator: "In", values: ["amd64"] }] }],
    conditions: [
      { type: "ImagesReady", status: "True", reason: "ImagesReady", message: "", lastTransitionTime },
      { type: "Ready", status: "True", reason: "Ready", message: "", lastTransitionTime },
    ],
  },
});

// A GCENodeClass whose image selector found no image, with nothing else set.
const ubuntuClass = new GCENodeClass({
  apiVersion: "karpenter.k8s.gcp/v1alpha1",
  kind: "GCENodeClass",
  metadata: { name: "ubuntu", uid: "2", resourceVersion: "1", selfLink: "" },
  spec: { imageSelectorTerms: [{ family: "Ubuntu2404", version: "latest" }] },
  status: {
    conditions: [
      {
        type: "ImagesReady",
        status: "False",
        reason: "ImagesNotFound",
        message: "no image found",
        lastTransitionTime,
      },
      {
        type: "Ready",
        status: "False",
        reason: "UnhealthyDependents",
        message: "ImagesReady=False",
        lastTransitionTime,
      },
    ],
  },
});

// default of the fixtures of the integration tests as v0.7.0 writes it: the fields it adds, and the free IPs of its
// pod ranges.
const v070Class = new GCENodeClass({
  apiVersion: "karpenter.k8s.gcp/v1alpha1",
  kind: "GCENodeClass",
  metadata: { name: "default", uid: "3", resourceVersion: "1", selfLink: "" },
  spec: {
    imageSelectorTerms: [{ family: "ContainerOptimizedOS", channel: "stable" }],
    subnetRangeNames: ["pods-a", "pods-b"],
    kubeletConfiguration: { maxPods: 64, serializeImagePulls: false, maxParallelImagePulls: 5 },
    linuxNodeConfig: { hugepages: { hugepageSize2m: 512 } },
    advancedMachineFeatures: { enableNestedVirtualization: true },
    localSsdMode: "Ephemeral",
    preemptionNoticeDuration: "120s",
  },
  status: {
    subnetRanges: [
      { name: "pods-a", totalFreeIP: 3840 },
      { name: "pods-b", totalFreeIP: 1012 },
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

describe("GCENodeClassDetails", () => {
  it("shows the image selector terms next to the images they resolved to", () => {
    render(<GCENodeClassDetails object={defaultClass} />);

    for (const text of [
      "ContainerOptimizedOS",
      "family: ContainerOptimizedOS; channel: stable",
      `${sourceImage}: kubernetes.io/arch In [amd64]`,
    ]) {
      expect(screen.getByText(text)).toBeTruthy();
    }
    expect(screen.queryByText("Not Ready")).toBeNull();
  });

  it("shows the settings of the instances", () => {
    render(<GCENodeClassDetails object={defaultClass} />);

    for (const text of [
      "karpenter-node@lab.iam.gserviceaccount.com",
      "boot disk: 100 GiB, pd-balanced",
      "disk: 500 GiB, hyperdisk-balanced, 3000 IOPS",
      "enableSecureBoot: true",
      "enableIntegrityMonitoring: true",
      "SEV_SNP",
      "maxPods: 64",
      "evictionHard: memory.available=5%",
      "team=platform",
      "serial-port-enable=true",
    ]) {
      expect(screen.getByText(text)).toBeTruthy();
    }
  });

  it("shows the network and the GPU", () => {
    render(<GCENodeClassDetails object={defaultClass} />);

    for (const text of [subnetwork, "pods", `${storageSubnetwork} (network storage)`, "karpenter", "lab", "latest"]) {
      expect(screen.getByText(text)).toBeTruthy();
    }
    // Private Nodes, and Auto GPU Taint.
    expect(screen.getAllByText("True")).toHaveLength(1);
    expect(screen.getAllByText("False")).toHaveLength(1);
  });

  it("shows the fields of v0.7.0, and the pod ranges next to their free IPs", () => {
    render(<GCENodeClassDetails object={v070Class} />);

    for (const text of [
      "Ephemeral",
      "enableNestedVirtualization: true",
      "120s",
      "512 pages of 2 MiB",
      "serializeImagePulls: false",
      "maxParallelImagePulls: 5",
      "pods-a",
      "pods-b",
      "pods-a: 3840 free IPs",
      "pods-b: 1012 free IPs",
    ]) {
      expect(screen.getByText(text)).toBeTruthy();
    }
    for (const name of [
      "Local SSD Mode",
      "Advanced Machine Features",
      "Preemption Notice",
      "Hugepages",
      "Subnet Ranges",
      "Resolved Ranges",
    ]) {
      expect(screen.getByText(name)).toBeTruthy();
    }
    // The deprecated single name, which the node class does not set.
    expect(screen.queryByText("Subnet Range")).toBeNull();
  });

  it("opens a NodePool that uses it in the drawer", () => {
    render(<GCENodeClassDetails object={defaultClass} />);

    expect(screen.getByText("Used By")).toBeTruthy();
    expect(screen.queryByText("gpu")).toBeNull();
    fireEvent.click(screen.getByText("system"));
    expect(Renderer.Navigation.showDetails).toHaveBeenLastCalledWith("/apis/karpenter.sh/v1/nodepools/system");
    fireEvent.click(screen.getByText("gke"));
    expect(Renderer.Navigation.showDetails).toHaveBeenLastCalledWith("/apis/karpenter.sh/v1/nodepools/gke");
  });

  it("shows why it is not ready at its images, and hides what is not set", () => {
    render(<GCENodeClassDetails object={ubuntuClass} />);

    expect(screen.getByText("False, UnhealthyDependents: ImagesReady=False")).toBeTruthy();
    expect(screen.getByText("False, ImagesNotFound: no image found")).toBeTruthy();
    expect(screen.getByText("family: Ubuntu2404; version: latest")).toBeTruthy();
    for (const name of [
      "Image Family",
      "Resolved",
      "Instances",
      "Service Account",
      "Disks",
      "Local SSD Mode",
      "Shielded Instance",
      "Advanced Machine Features",
      "Confidential Instance",
      "Preemption Notice",
      "Hugepages",
      "Kubelet",
      "Labels",
      "Metadata",
      "Network",
      "Subnet Ranges",
      "Resolved Ranges",
      "GPU",
    ]) {
      expect(screen.queryByText(name)).toBeNull();
    }
    expect(screen.getByText("gpu")).toBeTruthy();
  });

  it("subscribes to the store of the NodePools", () => {
    render(<GCENodeClassDetails object={defaultClass} />);

    const [stores] = vi.mocked(useSubscribedStores).mock.calls[0] ?? [];
    expect(stores?.map((store) => store?.api.apiBase)).toEqual(["/apis/karpenter.sh/v1/nodepools"]);
  });
});

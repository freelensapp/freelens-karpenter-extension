/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// Node autoprovisioning of AKS, with the CRDs of
// Azure/karpenter-provider-azure: an AKSNodeClass, a NodePool, a NodeOverlay,
// NodeClaims and their events, without nodes. Karpenter runs outside the
// cluster, so there is no controller Deployment. The session disconnects the kind cluster, sets up the variant,
// connects the cluster again, so that the app reads the CRDs anew, and leaves
// the cluster disconnected; it does not depend on another test file having run.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  agePattern,
  aksNodeClassColumns,
  appReady,
  clickAndExpectDetails,
  connectApp,
  disconnectKindCluster,
  expectEmptyCells,
  expectInDetails,
  expectListRow,
  expectNoKindPageEntry,
  hostMetricsRequestPattern,
  installExtension,
  kindClusterName,
  nodeClaimColumns,
  nodeOverlayColumns,
  nodePoolColumns,
  openDashboard,
  openKindCluster,
  openKindPage,
  openNodeDetails,
  openTab,
  setUpCluster,
  tearDownCluster,
} from "./extension-helpers";

import type { Frame } from "playwright";

import type { AppSession } from "./extension-helpers";

const variant = "aks";

describe.skipIf(!(await appReady({ cluster: true })))("Karpenter on AKS", () => {
  let session: AppSession | undefined;
  let frame: Frame;

  beforeAll(
    async () => {
      session = await connectApp();
      await disconnectKindCluster(session);
      setUpCluster(variant);
      await installExtension(session);
      frame = await openKindCluster(session);
      await openDashboard(frame);
    },
    10 * 60 * 1000,
  );

  afterAll(
    async () => {
      let errors: string[] = [];

      try {
        // The errors first: the app refreshes the cluster while it disconnects,
        // and logs errors of its own when the refresh loses the race.
        errors = ((await session?.stopCollecting()) ?? []).filter((error) => !hostMetricsRequestPattern.test(error));

        // The cluster then: the app watches the CRDs, and would log errors for
        // CRDs deleted under it.
        if (session) {
          await disconnectKindCluster(session);
        }

        await session?.close();
      } finally {
        tearDownCluster(variant);
      }

      expect(errors).toEqual([]);
    },
    10 * 60 * 1000,
  );

  // The first view: it loads every store, and shows nothing when an effect
  // aborts its own second run under React.StrictMode.
  it("shows the Overview of the NodePools", async () => {
    // No Deployment, and no version in the CRDs. The NodePool has a card for
    // its NodeClaim still waiting for its node; it sets no memory limit,
    // and the NodeOverlay that can apply to it is on its card.
    await openTab(frame, "Overview", [
      "Karpenter installed",
      "azure",
      "azure-pend1",
      /\/ —$/,
      /^Expire after:\s*336h$/,
      "spot-discount",
    ]);
  });

  it("shows the Topology of the NodeClaims", async () => {
    await openTab(frame, "Topology", ["Node Pools", "Other (non-Karpenter)"]);
  });

  it("shows the node classes", async () => {
    // The AKSNodeClass is served as v1beta1.
    await openTab(frame, "Node Classes", ["Node Classes", /^default\b/, "AKSNodeClass", "1 NodePool"]);
  });

  it("shows the scaling decisions", async () => {
    // Karpenter writes the events of its cluster-scoped objects to the default
    // namespace.
    await openTab(frame, "Scaling Decisions", [
      "Scaling decisions",
      "4 / 4 karpenter events",
      "Launched",
      "NotLaunched",
    ]);
  });

  it("opens the details of the objects it links to, and they stay open", async () => {
    // The row of the NodeClaim still waiting for its node, and the
    // NodePool and the AKSNodeClass of its card. The sidebar link does not
    // leave the tab that is open, so the Overview is opened by its tab.
    await openTab(frame, "Overview", ["azure-pend1"]);
    await clickAndExpectDetails(
      frame,
      frame.getByTitle("Click to open NodeClaim details").filter({ hasText: "azure-pend1" }).first(),
      /^NodeClaim: azure-pend1/,
    );
    await openTab(frame, "Overview", ["azure-pend1"]);
    await clickAndExpectDetails(frame, frame.getByTitle("Open NodePool azure").first(), /^NodePool: azure/);
    await openTab(frame, "Overview", ["azure-pend1"]);
    await clickAndExpectDetails(frame, frame.getByTitle("Open AKSNodeClass default").first(), /^AKSNodeClass: default/);
  });

  it("lists the NodePools on their page, and shows the details of one", async () => {
    // The entry of the sidebar, and the columns of kubectl get nodepools -o
    // wide: azure has 2 nodes, a weight of 10, and 12 CPUs in use. Its
    // requirement on the SKU family, and its CPUs in use against its limit,
    // are in the details only.
    await openKindPage(frame, "nodepools", "Node Pools");

    const row = await expectListRow(frame, nodePoolColumns, [
      "azure",
      "default",
      "2",
      "True",
      agePattern,
      "10",
      "12",
      "49284200Ki",
    ]);

    await clickAndExpectDetails(frame, row.getByText("azure", { exact: true }).first(), /^NodePool: azure/);
    await expectInDetails(frame, ["karpenter.azure.com/sku-family In [D]", "12 / 48"]);
  });

  it("lists the NodeClaims on their page, and shows the details of one", async () => {
    // The entry of the sidebar, and the columns of kubectl get nodeclaims -o
    // wide. azure-d3e4f is the one NodeClaim that drifted; azure-pend1 has
    // no node yet, so its Node, ImageID and ID are empty. The capacity and
    // allocatable CPUs of azure-d3e4f, and its requirement, are in the
    // details only.
    await openKindPage(frame, "nodeclaims", "Node Claims");

    const row = await expectListRow(frame, nodeClaimColumns, [
      "azure-d3e4f",
      "Standard_D8s_v5",
      "spot",
      "westeurope-2",
      "aks-azure-d3e4f-12345678-vmss000001",
      "True",
      agePattern,
      "AKSAzureLinux-V3gen2-202610.01.0",
      "azure:///subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/mc_lab/providers/Microsoft.Compute/virtualMachines/azure-d3e4f",
      "azure",
      "default",
      "True",
    ]);

    const pending = await expectListRow(frame, nodeClaimColumns, [
      "azure-pend1",
      "spot",
      agePattern,
      "azure",
      "default",
    ]);
    await expectEmptyCells(frame, pending, ["Type", "Zone", "Node", "Ready", "ImageID", "ID", "Drifted"]);

    await clickAndExpectDetails(
      frame,
      row.getByText("azure-d3e4f", { exact: true }).first(),
      /^NodeClaim: azure-d3e4f/,
    );
    await expectInDetails(frame, ["8 / 7920m", "node.kubernetes.io/instance-type In [Standard_D8s_v5]"]);
  });

  it("lists the NodeOverlays on their page, and shows the details of one", async () => {
    // The entry of the sidebar, and the columns of kubectl get nodeoverlays
    // -o wide. The NodePool spot-discount applies to, azure, which allows
    // spot, and its requirement are in the details only.
    await openKindPage(frame, "nodeoverlays", "Node Overlays");

    const row = await expectListRow(frame, nodeOverlayColumns, ["spot-discount", "True", agePattern, "10"]);

    await clickAndExpectDetails(
      frame,
      row.getByText("spot-discount", { exact: true }).first(),
      /^NodeOverlay: spot-discount/,
    );
    await expectInDetails(frame, ["Applies To", "azure", "karpenter.sh/capacity-type In [spot]"]);
  });

  it("lists the AKSNodeClasses on their page, and shows the details of one", async () => {
    // The entry of the sidebar, and the columns of kubectl get aksnodeclasses
    // -o wide. The image and the Kubernetes version that default resolved,
    // its OS disk size and the NodePool that uses it are in the details
    // only.
    await openKindPage(frame, "aksnodeclasses", "AKS Node Classes");

    const row = await expectListRow(frame, aksNodeClassColumns, ["default", "True", agePattern, "AzureLinux"]);

    await clickAndExpectDetails(frame, row.getByText("default", { exact: true }).first(), /^AKSNodeClass: default/);
    await expectInDetails(frame, [
      "/CommunityGalleries/AKSAzureLinux-f7c7cda5-1c9a-4bdc-a222-9614c968580b/images/V3gen2/versions/202610.01.0: kubernetes.io/arch In [amd64]",
      "1.33.2",
      "128 GB",
      "Used By",
      "azure",
    ]);
  });

  it("opens the AKSNodeClass of a NodePool on the AKS Node Classes page", async () => {
    await openKindPage(frame, "nodepools", "Node Pools");

    const row = await expectListRow(frame, nodePoolColumns, ["azure", "default"]);

    await clickAndExpectDetails(frame, row.getByTitle("Open AKSNodeClass default"), /^AKSNodeClass: default/);
    // Its max pods are in its details only.
    await expectInDetails(frame, ["Max Pods", "50"]);
    // Under the details, the AKS Node Classes page.
    await frame
      .locator(".ItemListLayout")
      .getByText("AKS Node Classes", { exact: true })
      .first()
      .waitFor({ timeout: 60 * 1000 });
  });

  it("has no entry for the node classes of AWS and GCP", async () => {
    // The cluster serves AKSNodeClasses only.
    await expectNoKindPageEntry(frame, "ec2nodeclasses", "nodepools");
    await expectNoKindPageEntry(frame, "gcenodeclasses", "nodepools");
  });

  it("renders the details of a node Karpenter does not manage", async () => {
    await openNodeDetails(frame, `${kindClusterName}-control-plane`);
  });
});

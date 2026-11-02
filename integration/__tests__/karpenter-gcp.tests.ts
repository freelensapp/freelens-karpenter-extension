/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// Self-hosted Karpenter on GKE, with the CRDs of
// cloudpilot-ai/karpenter-provider-gcp: a GCENodeClass, a NodePool, a
// NodeOverlay, NodeClaims and their events, without nodes. The controller
// Deployment is scaled to zero. The session disconnects the kind cluster, sets
// up the variant, connects the cluster again, so that the app reads the CRDs
// anew, and leaves the cluster disconnected; it does not depend on another
// test file having run.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  agePattern,
  appReady,
  clickAndExpectDetails,
  connectApp,
  disconnectKindCluster,
  expectEmptyCells,
  expectInDetails,
  expectListRow,
  expectNoKindPageEntry,
  gceNodeClassColumns,
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

const variant = "gcp";

describe.skipIf(!(await appReady({ cluster: true })))("Karpenter on GCP", () => {
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
    // The version is the image tag of the controller Deployment. The NodePool
    // has a card for its NodeClaim still waiting for its node; it sets no
    // memory limit, and the NodeOverlay that can apply to it is on its card.
    await openTab(frame, "Overview", [
      "Karpenter 0.6.1",
      "gke",
      "gke-pend1",
      /\/ —$/,
      /^Expire after:\s*480h$/,
      "spot-discount",
    ]);
  });

  it("shows the Topology of the NodeClaims", async () => {
    await openTab(frame, "Topology", ["Node Pools", "Other (non-Karpenter)"]);
  });

  it("shows the node classes", async () => {
    // The GCENodeClass is served as v1alpha1. Its image family comes from its
    // family term, and its service account is shown. A value follows its label
    // in the element of the item, so the pattern names both.
    await openTab(frame, "Node Classes", [
      "Node Classes",
      /^default\b/,
      "GCENodeClass",
      "1 NodePool",
      /^Image Family\s+ContainerOptimizedOS$/,
      /^Service Account\s+karpenter-node@lab\.iam\.gserviceaccount\.com$/,
    ]);
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
    // NodePool and the GCENodeClass of its card. The sidebar link does not
    // leave the tab that is open, so the Overview is opened by its tab.
    await openTab(frame, "Overview", ["gke-pend1"]);
    await clickAndExpectDetails(
      frame,
      frame.getByTitle("Click to open NodeClaim details").filter({ hasText: "gke-pend1" }).first(),
      /^NodeClaim: gke-pend1/,
    );
    await openTab(frame, "Overview", ["gke-pend1"]);
    await clickAndExpectDetails(frame, frame.getByTitle("Open NodePool gke").first(), /^NodePool: gke/);
    await openTab(frame, "Overview", ["gke-pend1"]);
    await clickAndExpectDetails(frame, frame.getByTitle("Open GCENodeClass default").first(), /^GCENodeClass: default/);
  });

  it("lists the NodePools on their page, and shows the details of one", async () => {
    // The entry of the sidebar, and the columns of kubectl get nodepools -o
    // wide: gke has 2 nodes, a weight of 10, and 12 CPUs in use. Its
    // requirement on the instance family, and its CPUs in use against its
    // limit, are in the details only.
    await openKindPage(frame, "nodepools", "Node Pools");

    const row = await expectListRow(frame, nodePoolColumns, [
      "gke",
      "default",
      "2",
      "True",
      agePattern,
      "10",
      "12",
      "49283072Ki",
    ]);

    await clickAndExpectDetails(frame, row.getByText("gke", { exact: true }).first(), /^NodePool: gke/);
    await expectInDetails(frame, ["karpenter.k8s.gcp/instance-family In [e2 n2]", "12 / 64"]);
  });

  it("lists the NodeClaims on their page, and shows the details of one", async () => {
    // The entry of the sidebar, and the columns of kubectl get nodeclaims -o
    // wide, with Status in place of Ready, without ImageID and ID, and Age
    // last. gke-d3e4f is the one NodeClaim that drifted; gke-pend1 has no node
    // yet: it is Claiming and has no Node. The capacity and allocatable CPUs of
    // gke-d3e4f, and its requirement, are in the details only.
    await openKindPage(frame, "nodeclaims", "Node Claims");

    const row = await expectListRow(frame, nodeClaimColumns, [
      "gke-d3e4f",
      "n2-standard-8",
      "spot",
      "us-central1-b",
      "karpenter-gke-d3e4f",
      "Ready",
      "gke",
      "default",
      "True",
      agePattern,
    ]);

    const pending = await expectListRow(frame, nodeClaimColumns, [
      "gke-pend1",
      "spot",
      "Claiming",
      "gke",
      "default",
      agePattern,
    ]);
    await expectEmptyCells(frame, pending, ["Type", "Zone", "Node", "Drifted"]);

    await clickAndExpectDetails(frame, row.getByText("gke-d3e4f", { exact: true }).first(), /^NodeClaim: gke-d3e4f/);
    await expectInDetails(frame, ["8 / 7910m", "node.kubernetes.io/instance-type In [n2-standard-8]"]);
  });

  it("lists the NodeOverlays on their page, and shows the details of one", async () => {
    // The entry of the sidebar, and the columns of kubectl get nodeoverlays
    // -o wide. The NodePool spot-discount applies to, gke, which allows spot,
    // and its requirement are in the details only.
    await openKindPage(frame, "nodeoverlays", "Node Overlays");

    const row = await expectListRow(frame, nodeOverlayColumns, ["spot-discount", "True", agePattern, "10"]);

    await clickAndExpectDetails(
      frame,
      row.getByText("spot-discount", { exact: true }).first(),
      /^NodeOverlay: spot-discount/,
    );
    await expectInDetails(frame, ["Applies To", "gke", "karpenter.sh/capacity-type In [spot]"]);
  });

  it("lists the GCENodeClasses on their page, and shows the details of one", async () => {
    // The entry of the sidebar, and the columns of kubectl get gcenodeclasses
    // -o wide. The image selector term of default with the image it resolved,
    // its boot disk and its kubelet configuration are in the details only.
    // The API server returns the fields of a custom resource with their keys
    // sorted, so the term has its channel first.
    await openKindPage(frame, "gcenodeclasses", "GCE Node Classes");

    const row = await expectListRow(frame, gceNodeClassColumns, ["default", "True", agePattern]);

    await clickAndExpectDetails(frame, row.getByText("default", { exact: true }).first(), /^GCENodeClass: default/);
    await expectInDetails(frame, [
      "channel: stable; family: ContainerOptimizedOS",
      "projects/gke-node-images/global/images/gke-1336-gke1046000-cos-121-18867-90-38-c-pre: kubernetes.io/arch In [amd64]",
      "boot disk: 100 GiB, pd-balanced",
      "maxPods: 64",
      "Used By",
      "gke",
    ]);
  });

  it("opens the GCENodeClass of a NodePool on the GCE Node Classes page", async () => {
    await openKindPage(frame, "nodepools", "Node Pools");

    const row = await expectListRow(frame, nodePoolColumns, ["gke", "default"]);

    await clickAndExpectDetails(frame, row.getByTitle("Open GCENodeClass default"), /^GCENodeClass: default/);
    // Its network tag is in its details only.
    await expectInDetails(frame, ["Network Tags", "karpenter"]);
    // Under the details, the GCE Node Classes page.
    await frame
      .locator(".ItemListLayout")
      .getByText("GCE Node Classes", { exact: true })
      .first()
      .waitFor({ timeout: 60 * 1000 });
  });

  it("has no entry for the node classes of AWS and Azure", async () => {
    // The cluster serves GCENodeClasses only.
    await expectNoKindPageEntry(frame, "ec2nodeclasses", "nodepools");
    await expectNoKindPageEntry(frame, "aksnodeclasses", "nodepools");
  });

  it("renders the details of a node Karpenter does not manage", async () => {
    await openNodeDetails(frame, `${kindClusterName}-control-plane`);
  });
});

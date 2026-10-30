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
  appReady,
  clickAndExpectDetails,
  connectApp,
  disconnectKindCluster,
  hostMetricsRequestPattern,
  installExtension,
  kindClusterName,
  openDashboard,
  openKindCluster,
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

  it("renders the details of a node Karpenter does not manage", async () => {
    await openNodeDetails(frame, `${kindClusterName}-control-plane`);
  });
});

/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// Self-hosted Karpenter on AWS, with the CRDs of aws/karpenter-provider-aws:
// EC2NodeClasses, NodePools, NodeOverlays, NodeClaims and their events, without
// nodes. The session disconnects the kind cluster, sets up the variant,
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

const variant = "aws";

describe.skipIf(!(await appReady({ cluster: true })))("Karpenter on AWS", () => {
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
    // The version is the image tag of the controller Deployment. Without nodes,
    // only general has a card, for its NodeClaim still waiting for its node;
    // gpu and empty are folded as empty. general expires its nodes after 720h
    // (B3), and the NodeOverlay that can apply to it is on its card (C5).
    await openTab(frame, "Overview", [
      "Karpenter 1.15.1",
      "general",
      "general-pend1",
      "+2 empty",
      /^Expire after:\s*720h$/,
      "spot-discount",
    ]);
  });

  it("shows the Topology of the NodeClaims", async () => {
    await openTab(frame, "Topology", ["Node Pools", "Other (non-Karpenter)"]);
  });

  it("shows the node classes", async () => {
    // A card names its node class next to a link arrow. The EC2NodeClass
    // default has the NodePools general and empty only (B2) and kubelet
    // settings (B4); gpu never expires its nodes (B3).
    await openTab(frame, "Node Classes", [
      "Node Classes",
      /^default\b/,
      /^gpu\b/,
      "2 NodePools",
      "Kubelet Config",
      "Never",
    ]);
  });

  it("shows the scaling decisions", async () => {
    // The events of the default namespace are Karpenter's (the namespaces of
    // SPEC-0001). Finalized is the end of a NodeClaim (B11).
    await openTab(frame, "Scaling Decisions", [
      "Scaling decisions",
      "15 / 15 karpenter events",
      "NodePool: general",
      "Finalized",
      "DisruptionTerminating",
      "NotLaunched",
    ]);
  });

  it("opens the details of the objects it links to, and they stay open", async () => {
    // The row of the NodeClaim still waiting for its node (B14), and the
    // NodePool and the EC2NodeClass of its card. The sidebar link does not leave the tab that is
    // open, so the Overview is opened by its tab.
    await openTab(frame, "Overview", ["general-pend1"]);
    await clickAndExpectDetails(
      frame,
      frame.getByTitle("Click to open NodeClaim details").filter({ hasText: "general-pend1" }).first(),
      /^NodeClaim: general-pend1/,
    );
    await openTab(frame, "Overview", ["general-pend1"]);
    await clickAndExpectDetails(frame, frame.getByTitle("Open NodePool general").first(), /^NodePool: general/);
    await openTab(frame, "Overview", ["general-pend1"]);
    await clickAndExpectDetails(frame, frame.getByTitle("Open EC2NodeClass default").first(), /^EC2NodeClass: default/);
  });

  it("renders the details of a node Karpenter does not manage", async () => {
    await openNodeDetails(frame, `${kindClusterName}-control-plane`);
  });
});

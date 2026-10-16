/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// Runs inside a Freelens checkout, copied into `freelens/integration/__tests__/`
// by the integration tests workflow, and imports the helpers found there.
//
// One session against the static lab of SPEC-0002 (e2e/scripts/lab-up.sh
// static): it starts its own app, installs the extension, opens the dashboard
// and each tab, and checks the content the fixtures of e2e/fixtures/static
// give. It only reads the cluster.

import { describeIf } from "@freelensapp/test-utils";
import { afterAll, beforeAll, expect, it } from "vitest";
import { clusterReady, installExtension, openDashboard, openKindCluster, openTab, startApp } from "./extension-helpers";

import type { Frame } from "playwright";

import type { AppSession } from "./extension-helpers";

describeIf(clusterReady())("Karpenter dashboard", () => {
  let session: AppSession | undefined;
  let frame: Frame;

  beforeAll(
    async () => {
      session = await startApp();
      await installExtension(session);
      frame = await openKindCluster(session);
      await openDashboard(frame);
    },
    10 * 60 * 1000,
  );

  afterAll(
    async () => {
      expect((await session?.close()) ?? []).toEqual([]);
    },
    10 * 60 * 1000,
  );

  it("shows the Overview of the NodePools", async () => {
    // The NodePool azure sets no memory limit (B8), and general expires its nodes after 720h (B3).
    await openTab(frame, "Overview", [
      "Karpenter 1.15.0",
      "general",
      "azure",
      "gpu",
      /\/ —$/,
      /^Expire after:\s*720h$/,
    ]);
  });

  it("shows the Topology of the nodes", async () => {
    await openTab(frame, "Topology", ["Node Pools", "Other (non-Karpenter)"]);
  });

  it("shows the node classes", async () => {
    // A card names its node class next to a link arrow.
    await openTab(frame, "Node Classes", ["Node Classes", /^default\b/, /^gpu\b/]);
  });

  it("shows the scaling decisions", async () => {
    await openTab(frame, "Scaling Decisions", ["Scaling decisions"]);
  });
});

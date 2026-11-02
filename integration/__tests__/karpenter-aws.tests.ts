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
  agePattern,
  appReady,
  clickAndExpectDetails,
  connectApp,
  disconnectKindCluster,
  ec2NodeClassColumns,
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
    // gpu and empty are folded as empty. general expires its nodes after 720h,
    // and the NodeOverlay that applies to it is on its card, with
    // spot-adjustment, which Karpenter rejected for a conflict with it, apart.
    await openTab(frame, "Overview", [
      "Karpenter 1.15.1",
      "general",
      "general-pend1",
      "+2 empty",
      /^Expire after:\s*720h$/,
      "spot-discount",
      "Not applied:",
    ]);
  });

  it("shows the Topology of the NodeClaims", async () => {
    await openTab(frame, "Topology", ["Node Pools", "Other (non-Karpenter)"]);
  });

  it("shows the node classes", async () => {
    // A card names its node class next to a link arrow. The EC2NodeClass
    // default has the NodePools general and empty only and kubelet
    // settings; gpu never expires its nodes.
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
    // Karpenter writes the events of its cluster-scoped objects to the default
    // namespace. Finalized is the end of a NodeClaim.
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
    // The row of the NodeClaim still waiting for its node, and the
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
    // The NodeOverlay that Karpenter rejected, apart from the one that applies.
    await expectInDetails(frame, [
      "Not Applied",
      "spot-adjustment (price +5%): Conflict: conflict with another overlay",
    ]);
    await openTab(frame, "Overview", ["general-pend1"]);
    await clickAndExpectDetails(frame, frame.getByTitle("Open EC2NodeClass default").first(), /^EC2NodeClass: default/);
    // The NodeOverlay of the card of general opens on the Node Overlays page.
    await openTab(frame, "Overview", ["general-pend1"]);
    await clickAndExpectDetails(
      frame,
      frame.getByTitle("Open NodeOverlay spot-discount (weight 10)").first(),
      /^NodeOverlay: spot-discount/,
    );
  });

  it("lists the NodePools on their page, and shows the details of one", async () => {
    // The entry of the sidebar, and the columns of kubectl get nodepools -o
    // wide. gpu is the one NodePool with a weight, and it is not Ready: its
    // EC2NodeClass is not. Its requirement, its taint and why it is not Ready
    // are in the details only.
    await openKindPage(frame, "nodepools", "Node Pools");

    const row = await expectListRow(frame, nodePoolColumns, [
      "gpu",
      "gpu",
      "1",
      "50",
      "4",
      "15.5GiB",
      "False",
      agePattern,
    ]);

    await clickAndExpectDetails(frame, row.getByText("gpu", { exact: true }).first(), /^NodePool: gpu/);
    await expectInDetails(frame, [
      "False, NodeClassNotReady",
      "karpenter.k8s.aws/instance-family In [g5]",
      "nvidia.com/gpu:NoSchedule",
    ]);
  });

  it("lists the NodeClaims on their page, and shows the details of one", async () => {
    // The entry of the sidebar, and the columns of kubectl get nodeclaims -o
    // wide, with Status in place of Ready, without ImageID and ID, and Age
    // last. general-9qwmt is the one NodeClaim that drifted; general-pend1 has
    // no node yet: it is Claiming and has no Node. Why it has none, the reason
    // and message of its Launched condition, is in the details only, as its
    // capacity type and its requirement.
    await openKindPage(frame, "nodeclaims", "Node Claims");

    await expectListRow(frame, nodeClaimColumns, [
      "general-9qwmt",
      "m5.2xlarge",
      "on-demand",
      "eu-west-1b",
      "ip-10-0-2-12.eu-west-1.compute.internal",
      "general",
      "default",
      "Ready",
      "True",
      agePattern,
    ]);

    const pending = await expectListRow(frame, nodeClaimColumns, [
      "general-pend1",
      "on-demand",
      "general",
      "default",
      "Claiming",
      "False",
      agePattern,
    ]);
    await expectEmptyCells(frame, pending, ["Type", "Zone", "Node"]);

    await clickAndExpectDetails(
      frame,
      pending.getByText("general-pend1", { exact: true }).first(),
      /^NodeClaim: general-pend1/,
    );
    await expectInDetails(frame, [
      "Unknown, NotLaunched: Waiting for an instance",
      "karpenter.sh/nodepool In [general]",
    ]);
  });

  it("lists the NodeOverlays on their page, and shows the details of one", async () => {
    // The entry of the sidebar, and the columns of kubectl get nodeoverlays
    // -o wide. spot-adjustment is not Ready: Karpenter rejected it for a
    // conflict with spot-discount, which has the same weight. gpu-fpga applies
    // to the NodePool gpu only, by its name; the NodePool, its requirement and
    // the capacity it adds, as a resource list, are in the details only.
    await openKindPage(frame, "nodeoverlays", "Node Overlays");

    await expectListRow(frame, nodeOverlayColumns, ["spot-discount", "10", "True", agePattern]);
    await expectListRow(frame, nodeOverlayColumns, ["spot-adjustment", "10", "False", agePattern]);
    const row = await expectListRow(frame, nodeOverlayColumns, ["gpu-fpga", "50", "True", agePattern]);

    await clickAndExpectDetails(frame, row.getByText("gpu-fpga", { exact: true }).first(), /^NodeOverlay: gpu-fpga/);
    await expectInDetails(frame, ["Applies To", "gpu", "karpenter.sh/nodepool In [gpu]", "example.com/fpga 1"]);
  });

  it("lists the EC2NodeClasses on their page, and shows the details of one", async () => {
    // The entry of the sidebar, and the columns of kubectl get ec2nodeclasses
    // -o wide. gpu found no AMI, so it is not Ready. The subnets, the
    // security group and the instance profile that the selectors of default
    // resolved to, its kubelet setting and the NodePools that use it are in
    // the details only.
    await openKindPage(frame, "ec2nodeclasses", "EC2 Node Classes");

    await expectListRow(frame, ec2NodeClassColumns, ["gpu", "KarpenterNodeRole-lab", "False", agePattern]);
    const row = await expectListRow(frame, ec2NodeClassColumns, [
      "default",
      "KarpenterNodeRole-lab",
      "True",
      agePattern,
    ]);

    await clickAndExpectDetails(frame, row.getByText("default", { exact: true }).first(), /^EC2NodeClass: default/);
    await expectInDetails(frame, [
      "tags: karpenter.sh/discovery=lab",
      "subnet-0a1b2c3d4e5f60002 (eu-west-1b, euw1-az2)",
      "sg-0a1b2c3d4e5f60001 (lab-node)",
      "lab_1234567890",
      "maxPods: 58",
      "Used By",
      "empty",
      "general",
    ]);
  });

  it("opens the EC2NodeClass of a NodePool on the EC2 Node Classes page", async () => {
    await openKindPage(frame, "nodepools", "Node Pools");

    const row = await expectListRow(frame, nodePoolColumns, ["gpu", "gpu"]);

    await clickAndExpectDetails(frame, row.getByTitle("Open EC2NodeClass gpu"), /^EC2NodeClass: gpu/);
    // Why gpu is not Ready, and its subnet selector, are in its details only.
    await expectInDetails(frame, [
      "False, AMIsNotFound: AMISelector did not match any AMIs",
      "id: subnet-0a1b2c3d4e5f60001",
    ]);
    // Under the details, the EC2 Node Classes page.
    await frame
      .locator(".ItemListLayout")
      .getByText("EC2 Node Classes", { exact: true })
      .first()
      .waitFor({ timeout: 60 * 1000 });
  });

  it("has no entry for the node classes of Azure and GCP, nor for the custom machine types of GCP", async () => {
    // The cluster serves EC2NodeClasses only, and no GCECustomMachineType.
    await expectNoKindPageEntry(frame, "aksnodeclasses", "nodepools");
    await expectNoKindPageEntry(frame, "gcenodeclasses", "nodepools");
    await expectNoKindPageEntry(frame, "gcecustommachinetypes", "nodepools");
  });

  it("renders the details of a node Karpenter does not manage", async () => {
    await openNodeDetails(frame, `${kindClusterName}-control-plane`);
  });
});

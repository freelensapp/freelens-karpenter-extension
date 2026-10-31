/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { Renderer } from "@freelensapp/extensions";
import { computed } from "mobx";
import { NodePool } from "./api/nodepool/nodepool-v1";
import { withDetailsErrorBoundary, withPageErrorBoundary } from "./components/error-boundary";
import { getNodePoolStore } from "./data/stores";
import { NodeKarpenterDetails } from "./details/node-karpenter-details";
import { NodePoolDetails } from "./details/nodepool-details";
// must be `?raw` as we need SVG element
import svgIconLogo from "./icons/karpenter.svg?raw";
import { KarpenterDashboard } from "./pages/dashboard";
import { NodePoolsPage } from "./pages/nodepools/nodepools-page";
import { pageId } from "./pages/routes";

const {
  Component: { Icon },
} = Renderer;

export function KarpenterIcon(props: Renderer.Component.IconProps) {
  return <Icon {...props} svg={svgIconLogo} />;
}

// The pages render inside an error boundary, so that an error they throw stays in the page instead of replacing the
// main area of the cluster with the host's error.
export default class KarpenterExtensionRenderer extends Renderer.LensExtension {
  clusterPages: Renderer.LensExtension["clusterPages"] = [
    {
      id: pageId.overview,
      components: {
        Page: () => <KarpenterDashboard extension={this} />,
      },
    },
    {
      id: pageId.nodePools,
      components: {
        Page: () => <NodePoolsPage extension={this} />,
      },
    },
  ].map((registration) => withPageErrorBoundary(this, registration));

  // The details of the kinds, one registration for every modeled version, and the Karpenter section of the host's
  // Node details. Each comes after the host's own: for a kind, its printer columns and conditions.
  kubeObjectDetailItems: Renderer.LensExtension["kubeObjectDetailItems"] = [
    Renderer.K8sApi.detailsFor(NodePool, { priority: 10, Details: NodePoolDetails }),
    Renderer.K8sApi.detailsFor(Renderer.K8sApi.Node, { Details: NodeKarpenterDetails }),
  ].map((registration) => withDetailsErrorBoundary(this, registration));

  // "Karpenter" has no page of its own: it opens and closes its entries, one level, with no group. The Overview is
  // always there, also to say that Karpenter is not installed; the page of a kind only while the cluster serves it.
  // `getServedStore` reads the host's observable API registry, so an entry comes and goes with its CRD.
  clusterPageMenus: Renderer.LensExtension["clusterPageMenus"] = [
    {
      id: "karpenter",
      title: "Karpenter",
      components: {
        Icon: KarpenterIcon,
      },
    },
    {
      id: pageId.overview,
      parentId: "karpenter",
      title: "Overview",
      target: { pageId: pageId.overview },
      components: {},
    },
    {
      id: pageId.nodePools,
      parentId: "karpenter",
      title: NodePool.crd.title,
      target: { pageId: pageId.nodePools },
      visible: computed(() => getNodePoolStore() !== undefined),
      components: {},
    },
  ];
}

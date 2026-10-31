/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { Renderer } from "@freelensapp/extensions";
import { withDetailsErrorBoundary, withPageErrorBoundary } from "./components/error-boundary";
import { NodeKarpenterDetails } from "./details/node-karpenter-details";
// must be `?raw` as we need SVG element
import svgIconLogo from "./icons/karpenter.svg?raw";
import { KarpenterDashboard } from "./pages/dashboard";
import { pageId } from "./pages/routes";

const {
  Component: { Icon },
} = Renderer;

export function KarpenterIcon(props: Renderer.Component.IconProps) {
  return <Icon {...props} svg={svgIconLogo} />;
}

// The page renders inside an error boundary, so that an error it throws stays in the page instead of replacing the
// main area of the cluster with the host's error.
export default class KarpenterExtensionRenderer extends Renderer.LensExtension {
  clusterPages: Renderer.LensExtension["clusterPages"] = [
    {
      id: pageId.overview,
      components: {
        Page: () => <KarpenterDashboard extension={this} />,
      },
    },
  ].map((registration) => withPageErrorBoundary(this, registration));

  // The Karpenter section of the host's Node details, after the host's own.
  kubeObjectDetailItems: Renderer.LensExtension["kubeObjectDetailItems"] = [
    Renderer.K8sApi.detailsFor(Renderer.K8sApi.Node, { Details: NodeKarpenterDetails }),
  ].map((registration) => withDetailsErrorBoundary(this, registration));

  // "Karpenter" has no page of its own: it opens and closes its entries, one level, with no group. The Overview is
  // always there, also to say that Karpenter is not installed.
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
  ];
}

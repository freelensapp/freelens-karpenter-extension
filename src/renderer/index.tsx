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
      id: "dashboard",
      components: {
        Page: () => <KarpenterDashboard extension={this} />,
      },
    },
  ].map((registration) => withPageErrorBoundary(this, registration));

  // The Karpenter section of the host's Node details, after the host's own.
  kubeObjectDetailItems: Renderer.LensExtension["kubeObjectDetailItems"] = [
    Renderer.K8sApi.detailsFor(Renderer.K8sApi.Node, { Details: NodeKarpenterDetails }),
  ].map((registration) => withDetailsErrorBoundary(this, registration));

  clusterPageMenus = [
    {
      id: "dashboard",
      title: "Karpenter",
      target: { pageId: "dashboard" },
      components: {
        Icon: KarpenterIcon,
      },
    },
  ];
}

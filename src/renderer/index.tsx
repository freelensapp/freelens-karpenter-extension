/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { Renderer } from "@freelensapp/extensions";
//import { karpenterObjects } from "./k8s/karpenter/objects";
// transpiled .tsx code must have `React` symbol in the scope
// @ts-ignore
import React from "react";
// must be `?raw` as we need SVG element
//import svgIcon from "./icons/example.svg?raw";
import svgIconLogo from "./icons/karpenter.svg?raw";
import { KarpenterDashboard } from "./page";

const {
  Component: { Icon },
} = Renderer;

export function FluxExtensionExampleIcon(props: Renderer.Component.IconProps) {
  return <Icon {...props} svg={svgIconLogo} />;
}

export default class FluxExtensionExampleRenderer extends Renderer.LensExtension {
  clusterPages = [
    {
      id: "dashboard",
      components: {
        Page: () => <KarpenterDashboard extension={this} />,
      },
    },
  ];

  clusterPageMenus = [
    {
      id: "dashboard",
      title: "Karpenter",
      target: { pageId: "dashboard" },
      components: {
        Icon: FluxExtensionExampleIcon,
      },
    },
  ];
}

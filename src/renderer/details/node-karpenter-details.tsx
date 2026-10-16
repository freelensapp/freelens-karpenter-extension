import { Renderer } from "@freelensapp/extensions";
import { nodeClaimSelfLink, nodePoolSelfLink } from "../utils/kube-helpers";
import { karpenterNodeInfo } from "./node-karpenter";

import type React from "react";

const {
  Component: { DrawerItem, DrawerTitle },
} = Renderer;

// A link inside a details drawer opens the other object's details in its place, over the same page, as the host's
// own links do. It prevents the click's default, as theirs do: the drawer closes on a click whose target is not
// inside it, and the link is no longer inside it once the new details have replaced the old ones, which happens
// before the drawer sees the click when the object is already in its store.
const showDetails = (selfLink: string) => (event: React.MouseEvent) => {
  event.preventDefault();
  Renderer.Navigation.showDetails(selfLink);
};

const CAPACITY_TYPE_LABEL = { spot: "Spot", "on-demand": "On-Demand", unknown: "—" } as const;

/** The Karpenter section of the host's Node details (C4); nothing for a node Karpenter does not manage. */
export function NodeKarpenterDetails({
  object: node,
}: Renderer.Component.KubeObjectDetailsProps<Renderer.K8sApi.Node>) {
  const info = karpenterNodeInfo(node);
  if (!info) return null;

  const lifecycle = [info.registered && "Registered", info.initialized && "Initialized"].filter(Boolean).join(", ");
  const disruption = info.disrupting ? "Being disrupted" : info.doNotDisrupt ? "Do not disrupt" : "";

  return (
    <>
      <DrawerTitle>Karpenter</DrawerTitle>
      <DrawerItem name="NodePool" hidden={!info.nodePool}>
        <a onClick={showDetails(nodePoolSelfLink(info.nodePool))}>{info.nodePool}</a>
      </DrawerItem>
      <DrawerItem name="NodeClaim" hidden={!info.nodeClaim}>
        <a onClick={showDetails(nodeClaimSelfLink(info.nodeClaim))}>{info.nodeClaim}</a>
      </DrawerItem>
      <DrawerItem name="Instance type">{info.instanceType}</DrawerItem>
      <DrawerItem name="Capacity type">{CAPACITY_TYPE_LABEL[info.capacityType]}</DrawerItem>
      <DrawerItem name="Zone">{info.zone}</DrawerItem>
      <DrawerItem name="Status">{info.status}</DrawerItem>
      <DrawerItem name="Lifecycle" hidden={!lifecycle}>
        {lifecycle}
      </DrawerItem>
      <DrawerItem name="Disruption" hidden={!disruption}>
        {disruption}
      </DrawerItem>
    </>
  );
}

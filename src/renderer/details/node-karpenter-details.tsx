import { Renderer } from "@freelensapp/extensions";
import { DetailsLink } from "../components/shared/DetailsLink";
import { nodeClaimSelfLink, nodePoolSelfLink } from "../utils/kube-helpers";
import { karpenterNodeInfo } from "./node-karpenter";

const {
  Component: { DrawerItem, DrawerTitle },
} = Renderer;

const CAPACITY_TYPE_LABEL = { spot: "Spot", "on-demand": "On-Demand", unknown: "—" } as const;

/** The Karpenter section of the host's Node details; nothing for a node Karpenter does not manage. */
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
      {/* In place of the node's details, over the same page, as the host's own links in a drawer: the NodePool in
          the extension's details. */}
      <DrawerItem name="NodePool" hidden={!info.nodePool}>
        <DetailsLink selfLink={nodePoolSelfLink(info.nodePool)}>{info.nodePool}</DetailsLink>
      </DrawerItem>
      <DrawerItem name="NodeClaim" hidden={!info.nodeClaim}>
        <DetailsLink selfLink={nodeClaimSelfLink(info.nodeClaim)}>{info.nodeClaim}</DetailsLink>
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

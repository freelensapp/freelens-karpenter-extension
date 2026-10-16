import { Renderer } from "@freelensapp/extensions";
import { openNodeClaimDetail, openNodePoolDetailByName } from "../utils/kube-helpers";
import { karpenterNodeInfo } from "./node-karpenter";

const {
  Component: { DrawerItem, DrawerTitle },
} = Renderer;

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
        <a onClick={() => openNodePoolDetailByName(info.nodePool)}>{info.nodePool}</a>
      </DrawerItem>
      <DrawerItem name="NodeClaim" hidden={!info.nodeClaim}>
        <a onClick={() => openNodeClaimDetail(info.nodeClaim)}>{info.nodeClaim}</a>
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

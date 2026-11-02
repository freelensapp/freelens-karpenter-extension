import { Renderer } from "@freelensapp/extensions";
import { observer } from "mobx-react";
import { Badges } from "../components/shared/Badges";
import { DetailsLink } from "../components/shared/DetailsLink";
import { detectProvider, nodeClassSelfLink } from "../data/nodeclass";
import { nodeClaimColumnValues } from "../pages/nodeclaims/nodeclaim-columns";
import { nodePoolSelfLink, nodeSelfLink } from "../utils/kube-helpers";
import { formatRequirement, formatTaint, notTrueReason } from "./karpenter-v1";
import { capacityRows, formatResources, stageNotReached, trueReason } from "./nodeclaim-status";

import type { NodeClaim } from "../api/nodeclaim/nodeclaim-v1";

const {
  Component: { DrawerItem, DrawerTitle, LocaleDate },
} = Renderer;

/**
 * The details of a NodeClaim of karpenter.sh/v1, after the host's own: the metadata, the printer columns and the
 * conditions, and the events of the object at the end. Grouped as the Go structs group the fields: what its
 * conditions say, the objects around it and the node it launched, from its status, then its spec.
 *
 * An observer: the link of its node class reads which node class stores the cluster serves.
 */
export const NodeClaimDetails = observer(
  ({ object: nodeClaim }: Renderer.Component.KubeObjectDetailsProps<NodeClaim>) => {
    const { spec, status } = nodeClaim;
    const values = nodeClaimColumnValues(nodeClaim);
    const nodeClassRef = spec?.nodeClassRef;
    const notReady = notTrueReason(status?.conditions, "Ready");
    const notReached = stageNotReached(status?.conditions);
    const drifted = trueReason(status?.conditions, "Drifted");
    const resources = capacityRows(status?.capacity, status?.allocatable);

    return (
      <>
        <DrawerItem name="Not Ready" hidden={notReady === undefined}>
          {notReady}
        </DrawerItem>
        <DrawerItem name={`Not ${notReached?.stage}`} hidden={notReached === undefined}>
          {notReached?.why}
        </DrawerItem>
        <DrawerItem name="Drifted" hidden={drifted === undefined}>
          {drifted}
        </DrawerItem>
        <DrawerItem name="Node" hidden={values.node === undefined}>
          {values.node !== undefined && (
            <DetailsLink selfLink={nodeSelfLink(values.node)} title={`Open Node ${values.node}`}>
              {values.node}
            </DetailsLink>
          )}
        </DrawerItem>
        <DrawerItem name="Node Pool" hidden={values.nodePool === undefined}>
          {values.nodePool !== undefined && (
            <DetailsLink selfLink={nodePoolSelfLink(values.nodePool)} title={`Open Node Pool ${values.nodePool}`}>
              {values.nodePool}
            </DetailsLink>
          )}
        </DrawerItem>
        <DrawerItem name="Node Class" hidden={!nodeClassRef}>
          {nodeClassRef && (
            <DetailsLink
              selfLink={nodeClassSelfLink(nodeClassRef.name, detectProvider(nodeClassRef))}
              title={`Open ${nodeClassRef.kind} ${nodeClassRef.name}`}
            >
              {`${nodeClassRef.kind} ${nodeClassRef.name}`}
            </DetailsLink>
          )}
        </DrawerItem>
        <DrawerItem name="Instance Type" hidden={values.type === undefined}>
          {values.type}
        </DrawerItem>
        <DrawerItem name="Capacity Type" hidden={values.capacity === undefined}>
          {values.capacity}
        </DrawerItem>
        <DrawerItem name="Zone" hidden={values.zone === undefined}>
          {values.zone}
        </DrawerItem>
        <DrawerItem name="Provider ID" hidden={values.id === undefined}>
          {values.id}
        </DrawerItem>
        <DrawerItem name="Image ID" hidden={values.imageID === undefined}>
          {values.imageID}
        </DrawerItem>
        <DrawerItem name="Last Pod Event" hidden={!status?.lastPodEventTime}>
          {status?.lastPodEventTime && <LocaleDate date={status.lastPodEventTime} />}
        </DrawerItem>

        {resources.length > 0 && (
          <>
            <DrawerTitle>Resources (capacity / allocatable)</DrawerTitle>
            {resources.map(({ name, capacity, allocatable }) => (
              <DrawerItem key={name} name={name}>
                {`${capacity ?? "-"} / ${allocatable ?? "-"}`}
              </DrawerItem>
            ))}
          </>
        )}

        <DrawerTitle>Spec</DrawerTitle>
        <Badges name="Resource Requests" texts={formatResources(spec?.resources?.requests)} />
        <Badges name="Requirements" texts={(spec?.requirements ?? []).map(formatRequirement)} />
        <Badges name="Taints" texts={(spec?.taints ?? []).map(formatTaint)} />
        <Badges name="Startup Taints" texts={(spec?.startupTaints ?? []).map(formatTaint)} />
        <DrawerItem name="Expire After" hidden={!spec?.expireAfter}>
          {spec?.expireAfter}
        </DrawerItem>
        <DrawerItem name="Termination Grace Period" hidden={!spec?.terminationGracePeriod}>
          {spec?.terminationGracePeriod}
        </DrawerItem>
      </>
    );
  },
);

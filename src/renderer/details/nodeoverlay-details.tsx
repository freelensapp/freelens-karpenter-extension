import { Renderer } from "@freelensapp/extensions";
import { observer } from "mobx-react";
import { Badges } from "../components/shared/Badges";
import { DetailsLink } from "../components/shared/DetailsLink";
import { getNodePoolStore } from "../data/stores";
import { useSubscribedStores } from "../data/use-subscribed-stores";
import { nodePoolSelfLink } from "../utils/kube-helpers";
import { formatRequirement, notTrueReason } from "./karpenter-v1";
import { formatResources } from "./nodeclaim-status";
import { isRejected, nodePoolsOfOverlay } from "./nodeoverlay-relations";

import type { NodeOverlay } from "../api/nodeoverlay/nodeoverlay-v1alpha1";

const {
  Component: { DrawerItem, DrawerTitle },
} = Renderer;

/**
 * The details of a NodeOverlay of karpenter.sh/v1alpha1, after the host's own: the metadata, the printer columns and
 * the conditions, and the events of the object at the end. Why Karpenter has not validated it, from its status, then
 * its spec, then the NodePools it applies to.
 *
 * An observer: it reads the NodePools from their store, which it loads when the page under the drawer has not.
 */
export const NodeOverlayDetails = observer(
  ({ object: overlay }: Renderer.Component.KubeObjectDetailsProps<NodeOverlay>) => {
    const nodePoolStore = getNodePoolStore();
    useSubscribedStores([nodePoolStore]);

    const { spec, status } = overlay;
    const notReady = notTrueReason(status?.conditions, "Ready");
    const notValidated = notTrueReason(status?.conditions, "ValidationSucceeded");
    const rejected = isRejected(overlay);
    const nodePools = nodePoolsOfOverlay(overlay, nodePoolStore?.items ?? []);

    return (
      <>
        <DrawerItem name="Not Ready" hidden={notReady === undefined}>
          {notReady}
        </DrawerItem>
        <DrawerItem name="Not Validated" hidden={notValidated === undefined}>
          {notValidated}
        </DrawerItem>

        <DrawerTitle>Spec</DrawerTitle>
        <DrawerItem name="Weight" hidden={spec?.weight === undefined}>
          {spec?.weight}
        </DrawerItem>
        <Badges name="Requirements" texts={(spec?.requirements ?? []).map(formatRequirement)} />
        <DrawerItem name="Price" hidden={spec?.price === undefined}>
          {spec?.price}
        </DrawerItem>
        <DrawerItem name="Price Adjustment" hidden={spec?.priceAdjustment === undefined}>
          {spec?.priceAdjustment}
        </DrawerItem>
        <Badges name="Capacity" texts={formatResources(spec?.capacity)} />

        {nodePoolStore && (
          <>
            <DrawerTitle>NodePools</DrawerTitle>
            {/* A rejected overlay applies to no instance type: the NodePools it matches, said so. */}
            <DrawerItem name={rejected ? "Matches (not applied)" : "Applies To"}>
              {nodePools.length === 0
                ? "None"
                : nodePools.map((name, index) => (
                    <span key={name}>
                      {index > 0 && ", "}
                      <DetailsLink selfLink={nodePoolSelfLink(name)} title={`Open NodePool ${name}`}>
                        {name}
                      </DetailsLink>
                    </span>
                  ))}
            </DrawerItem>
          </>
        )}
      </>
    );
  },
);

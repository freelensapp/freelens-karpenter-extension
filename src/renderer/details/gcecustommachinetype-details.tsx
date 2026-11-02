import { Renderer } from "@freelensapp/extensions";
import { observer } from "mobx-react";
import { Badges } from "../components/shared/Badges";
import { formatPrice, guestCpusText, memoryText } from "./gcecustommachinetype-fields";
import { notTrueReason } from "./karpenter-v1";

import type { GCECustomMachineType } from "../api/gcecustommachinetype/gcecustommachinetype-v1alpha1";

const {
  Component: { DrawerItem, DrawerTitle },
} = Renderer;

/**
 * The details of a GCECustomMachineType of karpenter.k8s.gcp/v1alpha1, after the host's own: the metadata, the
 * printer columns and the conditions, and the events of the object at the end. The machine type with why it is not
 * ready, when it is not; its hourly prices, which GCP does not publish for a custom shape; then what the provider
 * resolved for it in the zones of the cluster: its vCPUs, its memory and the zones that have it.
 *
 * An observer, as the other details: the object the host passes is observable.
 */
export const GCECustomMachineTypeDetails = observer(
  ({ object: machineType }: Renderer.Component.KubeObjectDetailsProps<GCECustomMachineType>) => {
    const { spec, status } = machineType;
    const notReady = notTrueReason(status?.conditions, "Ready");
    const onDemand = formatPrice(spec?.prices?.onDemand);
    const spot = formatPrice(spec?.prices?.spot);
    const guestCpus = guestCpusText(machineType);
    const memory = memoryText(machineType);
    const zones = status?.zones ?? [];

    return (
      <>
        <DrawerItem name="Not Ready" hidden={notReady === undefined}>
          {notReady}
        </DrawerItem>
        <DrawerItem name="Machine Type" hidden={!spec?.machineType}>
          {spec?.machineType}
        </DrawerItem>

        {(onDemand || spot) && (
          <>
            <DrawerTitle>Prices</DrawerTitle>
            <DrawerItem name="On-Demand" hidden={!onDemand}>
              {onDemand}
            </DrawerItem>
            <DrawerItem name="Spot" hidden={!spot}>
              {spot}
            </DrawerItem>
          </>
        )}

        {(guestCpus || memory || zones.length > 0) && (
          <>
            <DrawerTitle>Resolved</DrawerTitle>
            <DrawerItem name="CPUs" hidden={!guestCpus}>
              {guestCpus}
            </DrawerItem>
            <DrawerItem name="Memory" hidden={!memory}>
              {memory}
            </DrawerItem>
            <Badges name="Zones" texts={zones} />
          </>
        )}
      </>
    );
  },
);

import { Renderer } from "@freelensapp/extensions";
import { observer } from "mobx-react";
import { nodePoolsOfNodeClass } from "../components/NodeClassesTab/nodeclass-card";
import { Badges } from "../components/shared/Badges";
import { DetailsLink } from "../components/shared/DetailsLink";
import { getNodePoolStore } from "../data/stores";
import { useSubscribedStores } from "../data/use-subscribed-stores";
import { nodePoolSelfLink } from "../utils/kube-helpers";
import {
  formatAKSCapacityReservation,
  formatCapacityReservationGroup,
  formatIPTag,
  formatLocalDNSOverride,
  formatNodeImage,
  formatOSDiskSize,
  formatRecentlyUsedVersion,
} from "./aksnodeclass-fields";
import { fieldTexts } from "./fields";
import { notTrueReason } from "./karpenter-v1";

import type React from "react";

import type { AKSNodeClass } from "../data/stores";

const {
  Component: { BadgeBoolean, DrawerItem, DrawerItemLabels, DrawerTitle },
} = Renderer;

interface SectionProps {
  title: string;
  /** Why the condition of the section, such as `SubnetsReady`, is not `True`. */
  notReady: string | undefined;
  /** Whether the AKSNodeClass sets or resolved anything the section shows. */
  hasContent: boolean;
  children: React.ReactNode;
}

/** A section of the details, with why its condition is not `True`; nothing when it has neither. */
function Section({ title, notReady, hasContent, children }: SectionProps) {
  if (!hasContent && notReady === undefined) return null;

  return (
    <>
      <DrawerTitle>{title}</DrawerTitle>
      <DrawerItem name="Not Ready" hidden={notReady === undefined}>
        {notReady}
      </DrawerItem>
      {children}
    </>
  );
}

/**
 * The details of an AKSNodeClass of karpenter.azure.com, v1beta1 or v1alpha2, after the host's own: the metadata, the
 * printer columns and the conditions, and the events of the object at the end. Grouped as the Go structs group the
 * fields: the image and the versions it resolved, the network, local DNS and the capacity reservation, each with the
 * condition that says whether it is ready when that is not `True`, then the settings of the nodes, then the NodePools
 * that use it. A field only v1beta1 has, such as `gpu.nvidia`, shows when the object has it.
 *
 * An observer: it reads the NodePools from their store, which it loads when the page under the drawer has not.
 */
export const AKSNodeClassDetails = observer(
  ({ object: nodeClass }: Renderer.Component.KubeObjectDetailsProps<AKSNodeClass>) => {
    const nodePoolStore = getNodePoolStore();
    useSubscribedStores([nodePoolStore]);

    const { spec, status } = nodeClass;
    const conditions = status?.conditions;
    const notReady = notTrueReason(conditions, "Ready");
    const notValidated = notTrueReason(conditions, "ValidationSucceeded");
    const nodePools = nodePoolsOfNodeClass(nodeClass, nodePoolStore?.items ?? [])
      .map((nodePool) => nodePool.getName())
      .sort((a, b) => a.localeCompare(b));

    const images = (status?.images ?? []).map(formatNodeImage);
    const observed = status?.observedVersions;
    const recentlyUsed = (observed?.recentlyUsedVersions ?? []).map(formatRecentlyUsedVersion);
    const publicIP = spec?.nodePublicIP;
    const localDNS = spec?.localDNS;
    const reservationGroup = status?.capacityReservationGroup;
    const { sysctls, ...linuxOSConfig } = spec?.linuxOSConfig ?? {};

    return (
      <>
        <DrawerItem name="Not Ready" hidden={notReady === undefined}>
          {notReady}
        </DrawerItem>
        <DrawerItem name="Not Validated" hidden={notValidated === undefined}>
          {notValidated}
        </DrawerItem>

        <Section
          title="Image"
          notReady={notTrueReason(conditions, "ImagesReady")}
          hasContent={!!spec?.imageFamily || !!spec?.fipsMode || images.length > 0}
        >
          <DrawerItem name="Image Family" hidden={!spec?.imageFamily}>
            {spec?.imageFamily}
          </DrawerItem>
          <DrawerItem name="FIPS Mode" hidden={!spec?.fipsMode}>
            {spec?.fipsMode}
          </DrawerItem>
          <Badges name="Images" texts={images} />
        </Section>

        <Section
          title="Versions"
          notReady={notTrueReason(conditions, "KubernetesVersionReady")}
          hasContent={!!spec?.versions || !!status?.kubernetesVersion || !!observed}
        >
          <DrawerItem name="Kubernetes Version" hidden={!status?.kubernetesVersion}>
            {status?.kubernetesVersion}
          </DrawerItem>
          <Badges name="Pinned" texts={fieldTexts(spec?.versions)} />
          <DrawerItem name="Control Plane" hidden={!observed?.currentControlPlaneKubernetesVersion}>
            {observed?.currentControlPlaneKubernetesVersion}
          </DrawerItem>
          <DrawerItem name="Latest Image Version" hidden={!observed?.latestImageVersion}>
            {observed?.latestImageVersion}
          </DrawerItem>
          <Badges name="Recently Used" texts={recentlyUsed} />
        </Section>

        <Section
          title="Network"
          notReady={notTrueReason(conditions, "SubnetsReady")}
          hasContent={!!spec?.vnetSubnetID || !!publicIP}
        >
          <DrawerItem name="VNet Subnet" hidden={!spec?.vnetSubnetID}>
            {spec?.vnetSubnetID}
          </DrawerItem>
          <DrawerItem name="Node Public IP" hidden={publicIP?.enabled === undefined}>
            <BadgeBoolean value={!!publicIP?.enabled} />
          </DrawerItem>
          <Badges name="Public IP Prefixes" texts={publicIP?.prefixIDs ?? []} />
          <Badges name="IP Tags" texts={(publicIP?.ipTags ?? []).map(formatIPTag)} />
        </Section>

        <Section
          title="Local DNS"
          notReady={notTrueReason(conditions, "LocalDNSReady")}
          hasContent={!!localDNS || !!status?.localDNSState}
        >
          <DrawerItem name="Mode" hidden={!localDNS?.mode}>
            {localDNS?.mode}
          </DrawerItem>
          <DrawerItem name="State" hidden={!status?.localDNSState}>
            {status?.localDNSState}
          </DrawerItem>
          <Badges name="VNet DNS Overrides" texts={(localDNS?.vnetDNSOverrides ?? []).map(formatLocalDNSOverride)} />
          <Badges name="Kube DNS Overrides" texts={(localDNS?.kubeDNSOverrides ?? []).map(formatLocalDNSOverride)} />
        </Section>

        <Section
          title="Capacity Reservation"
          notReady={notTrueReason(conditions, "CapacityReservationGroupReady")}
          hasContent={!!spec?.capacityReservation || !!reservationGroup}
        >
          <DrawerItem name="Group ID" hidden={!spec?.capacityReservation?.groupID}>
            {spec?.capacityReservation?.groupID}
          </DrawerItem>
          <DrawerItem name="Resolved" hidden={!reservationGroup}>
            {reservationGroup && formatCapacityReservationGroup(reservationGroup)}
          </DrawerItem>
          <Badges
            name="Reservations"
            texts={(reservationGroup?.capacityReservations ?? []).map(formatAKSCapacityReservation)}
          />
        </Section>

        <DrawerTitle>Nodes</DrawerTitle>
        <DrawerItem name="OS Disk Type" hidden={!spec?.osDiskType}>
          {spec?.osDiskType}
        </DrawerItem>
        <DrawerItem name="OS Disk Size" hidden={spec?.osDiskSizeGB === undefined}>
          {formatOSDiskSize(spec?.osDiskSizeGB)}
        </DrawerItem>
        <DrawerItem name="Max Pods" hidden={spec?.maxPods === undefined}>
          {spec?.maxPods}
        </DrawerItem>
        <DrawerItem name="Workload Runtime" hidden={!spec?.workloadRuntime}>
          {spec?.workloadRuntime}
        </DrawerItem>
        <Badges name="Security" texts={fieldTexts(spec?.security)} />
        <Badges name="GPU" texts={fieldTexts(spec?.gpu)} />
        <DrawerItem name="Artifact Streaming" hidden={spec?.artifactStreaming?.enabled === undefined}>
          <BadgeBoolean value={!!spec?.artifactStreaming?.enabled} />
        </DrawerItem>
        <Badges name="Kubelet" texts={fieldTexts(spec?.kubelet)} />
        <Badges name="Linux OS Config" texts={fieldTexts(linuxOSConfig)} />
        <Badges name="Sysctls" texts={fieldTexts(sysctls)} />
        <DrawerItemLabels name="Tags" labels={spec?.tags ?? {}} />

        {nodePoolStore && (
          <>
            <DrawerTitle>NodePools</DrawerTitle>
            <DrawerItem name="Used By">
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

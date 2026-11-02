import { Renderer } from "@freelensapp/extensions";
import { observer } from "mobx-react";
import { nodePoolsOfNodeClass } from "../components/NodeClassesTab/nodeclass-card";
import { Badges } from "../components/shared/Badges";
import { DetailsLink } from "../components/shared/DetailsLink";
import { getNodePoolStore } from "../data/stores";
import { useSubscribedStores } from "../data/use-subscribed-stores";
import { nodePoolSelfLink } from "../utils/kube-helpers";
import { fieldTexts, formatSelectorTerm } from "./fields";
import { formatAdditionalNetworkInterface, formatDisk, formatImage } from "./gcenodeclass-fields";
import { notTrueReason } from "./karpenter-v1";

import type React from "react";

import type { GCENodeClass } from "../api/gcenodeclass/gcenodeclass-v1alpha1";

const {
  Component: { BadgeBoolean, DrawerItem, DrawerItemLabels, DrawerTitle },
} = Renderer;

interface SectionProps {
  title: string;
  /** Whether the GCENodeClass sets anything the section shows. */
  hasContent: boolean;
  children: React.ReactNode;
}

/** A section of the details; nothing when the GCENodeClass sets none of its fields. */
function Section({ title, hasContent, children }: SectionProps) {
  if (!hasContent) return null;

  return (
    <>
      <DrawerTitle>{title}</DrawerTitle>
      {children}
    </>
  );
}

/**
 * The details of a GCENodeClass of karpenter.k8s.gcp/v1alpha1, after the host's own: the metadata, the printer columns
 * and the conditions, and the events of the object at the end. Grouped as the fields of the spec go together: the
 * image selector terms next to the images they resolved to, with `ImagesReady` when it is not `True`; the instances
 * (service account, disks, shielded and confidential instance, labels, metadata, kubelet); the network; the GPU; then
 * the NodePools that use it.
 *
 * An observer: it reads the NodePools from their store, which it loads when the page under the drawer has not.
 */
export const GCENodeClassDetails = observer(
  ({ object: nodeClass }: Renderer.Component.KubeObjectDetailsProps<GCENodeClass>) => {
    const nodePoolStore = getNodePoolStore();
    useSubscribedStores([nodePoolStore]);

    const { spec, status } = nodeClass;
    const conditions = status?.conditions;
    const notReady = notTrueReason(conditions, "Ready");
    const notImagesReady = notTrueReason(conditions, "ImagesReady");
    const nodePools = nodePoolsOfNodeClass(nodeClass, nodePoolStore?.items ?? [])
      .map((nodePool) => nodePool.getName())
      .sort((a, b) => a.localeCompare(b));

    const disks = (spec?.disks ?? []).map(formatDisk);
    const shieldedInstance = fieldTexts(spec?.shieldedInstanceConfig);
    const kubelet = fieldTexts(spec?.kubeletConfiguration);
    const network = spec?.networkConfig;
    const networkTags = spec?.networkTags ?? [];
    const additionalInterfaces = (network?.additionalNetworkInterfaces ?? []).map(formatAdditionalNetworkInterface);

    return (
      <>
        <DrawerItem name="Not Ready" hidden={notReady === undefined}>
          {notReady}
        </DrawerItem>

        <DrawerTitle>Image</DrawerTitle>
        <DrawerItem name="Not Ready" hidden={notImagesReady === undefined}>
          {notImagesReady}
        </DrawerItem>
        <DrawerItem name="Image Family" hidden={!spec?.imageFamily}>
          {spec?.imageFamily}
        </DrawerItem>
        <Badges name="Selector Terms" texts={(spec?.imageSelectorTerms ?? []).map(formatSelectorTerm)} />
        <Badges name="Resolved" texts={(status?.images ?? []).map(formatImage)} />

        <Section
          title="Instances"
          hasContent={
            !!spec?.serviceAccount ||
            disks.length > 0 ||
            shieldedInstance.length > 0 ||
            !!spec?.confidentialInstanceType ||
            kubelet.length > 0 ||
            Object.keys(spec?.labels ?? {}).length > 0 ||
            Object.keys(spec?.metadata ?? {}).length > 0
          }
        >
          <DrawerItem name="Service Account" hidden={!spec?.serviceAccount}>
            {spec?.serviceAccount}
          </DrawerItem>
          <Badges name="Disks" texts={disks} />
          <Badges name="Shielded Instance" texts={shieldedInstance} />
          <DrawerItem name="Confidential Instance" hidden={!spec?.confidentialInstanceType}>
            {spec?.confidentialInstanceType}
          </DrawerItem>
          <Badges name="Kubelet" texts={kubelet} />
          <DrawerItemLabels name="Labels" labels={spec?.labels ?? {}} />
          <DrawerItemLabels name="Metadata" labels={spec?.metadata ?? {}} />
        </Section>

        <Section
          title="Network"
          hasContent={
            !!spec?.subnetRangeName ||
            network?.enablePrivateNodes !== undefined ||
            !!network?.subnetwork ||
            additionalInterfaces.length > 0 ||
            networkTags.length > 0
          }
        >
          <DrawerItem name="Subnetwork" hidden={!network?.subnetwork}>
            {network?.subnetwork}
          </DrawerItem>
          <DrawerItem name="Subnet Range" hidden={!spec?.subnetRangeName}>
            {spec?.subnetRangeName}
          </DrawerItem>
          <DrawerItem name="Private Nodes" hidden={network?.enablePrivateNodes === undefined}>
            <BadgeBoolean value={!!network?.enablePrivateNodes} />
          </DrawerItem>
          <Badges name="Additional Network Interfaces" texts={additionalInterfaces} />
          <Badges name="Network Tags" texts={networkTags} />
        </Section>

        <Section title="GPU" hasContent={spec?.autoGPUTaint !== undefined || !!spec?.gpuDriverVersion}>
          <DrawerItem name="Driver Version" hidden={!spec?.gpuDriverVersion}>
            {spec?.gpuDriverVersion}
          </DrawerItem>
          <DrawerItem name="Auto GPU Taint" hidden={spec?.autoGPUTaint === undefined}>
            <BadgeBoolean value={!!spec?.autoGPUTaint} />
          </DrawerItem>
        </Section>

        {nodePoolStore && (
          <>
            <DrawerTitle>Node Pools</DrawerTitle>
            <DrawerItem name="Used By">
              {nodePools.length === 0
                ? "None"
                : nodePools.map((name, index) => (
                    <span key={name}>
                      {index > 0 && ", "}
                      <DetailsLink selfLink={nodePoolSelfLink(name)} title={`Open Node Pool ${name}`}>
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

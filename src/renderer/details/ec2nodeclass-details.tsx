import { Renderer } from "@freelensapp/extensions";
import { observer } from "mobx-react";
import { nodePoolsOfNodeClass } from "../components/NodeClassesTab/nodeclass-card";
import { Badges } from "../components/shared/Badges";
import { CollapsedText } from "../components/shared/CollapsedText";
import { DetailsLink } from "../components/shared/DetailsLink";
import { getNodePoolStore } from "../data/stores";
import { useSubscribedStores } from "../data/use-subscribed-stores";
import { nodePoolSelfLink } from "../utils/kube-helpers";
import {
  fieldTexts,
  formatAMI,
  formatBlockDeviceMapping,
  formatCapacityReservation,
  formatNetworkInterface,
  formatSecurityGroup,
  formatSelectorTerm,
  formatSubnet,
  linesSummary,
} from "./ec2nodeclass-fields";
import { notTrueReason } from "./karpenter-v1";

import type { EC2NodeClass } from "../api/ec2nodeclass/ec2nodeclass-v1";
import type { Condition } from "../api/types";

const {
  Component: { BadgeBoolean, DrawerItem, DrawerItemLabels, DrawerTitle },
} = Renderer;

interface SelectorSectionProps {
  title: string;
  /** The condition that says whether the terms resolved, such as `SubnetsReady`. */
  condition: string;
  conditions: Condition[] | undefined;
  terms: object[] | undefined;
  /** What the terms resolved to, from the status, as text. */
  resolved: string[];
}

/**
 * The selector terms of one kind of resource next to what Karpenter resolved them to, and why they did not resolve
 * when their condition is not `True`; nothing when the EC2NodeClass has neither terms nor resolved values.
 */
function SelectorSection({ title, condition, conditions, terms = [], resolved }: SelectorSectionProps) {
  const notReady = notTrueReason(conditions, condition);
  if (terms.length === 0 && resolved.length === 0 && notReady === undefined) return null;

  return (
    <>
      <DrawerTitle>{title}</DrawerTitle>
      <DrawerItem name="Not Ready" hidden={notReady === undefined}>
        {notReady}
      </DrawerItem>
      <Badges name="Selector Terms" texts={terms.map(formatSelectorTerm)} />
      <Badges name="Resolved" texts={resolved} />
    </>
  );
}

/**
 * The details of an EC2NodeClass of karpenter.k8s.aws/v1, after the host's own: the metadata, the printer columns and
 * the conditions, and the events of the object at the end. Grouped as the Go structs group the fields: the selector
 * terms of each resource next to what they resolved to, the instance profile, the launch settings of the instances
 * (block devices, network, metadata, enclave and CPU options, kubelet, tags, user data), then the NodePools that use
 * it.
 *
 * An observer: it reads the NodePools from their store, which it loads when the page under the drawer has not.
 */
export const EC2NodeClassDetails = observer(
  ({ object: nodeClass }: Renderer.Component.KubeObjectDetailsProps<EC2NodeClass>) => {
    const nodePoolStore = getNodePoolStore();
    useSubscribedStores([nodePoolStore]);

    const { spec, status } = nodeClass;
    const conditions = status?.conditions;
    const notReady = notTrueReason(conditions, "Ready");
    const notValidated = notTrueReason(conditions, "ValidationSucceeded");
    const notInstanceProfileReady = notTrueReason(conditions, "InstanceProfileReady");
    const nodePools = nodePoolsOfNodeClass(nodeClass, nodePoolStore?.items ?? [])
      .map((nodePool) => nodePool.getName())
      .sort((a, b) => a.localeCompare(b));
    const placementGroup = spec?.placementGroupSelector;

    return (
      <>
        <DrawerItem name="Not Ready" hidden={notReady === undefined}>
          {notReady}
        </DrawerItem>
        <DrawerItem name="Not Validated" hidden={notValidated === undefined}>
          {notValidated}
        </DrawerItem>

        <DrawerTitle>Instance Profile</DrawerTitle>
        <DrawerItem name="Not Ready" hidden={notInstanceProfileReady === undefined}>
          {notInstanceProfileReady}
        </DrawerItem>
        <DrawerItem name="Role" hidden={!spec?.role}>
          {spec?.role}
        </DrawerItem>
        <DrawerItem name="Instance Profile" hidden={!spec?.instanceProfile}>
          {spec?.instanceProfile}
        </DrawerItem>
        <DrawerItem name="Resolved" hidden={!status?.instanceProfile}>
          {status?.instanceProfile}
        </DrawerItem>

        <SelectorSection
          title="AMIs"
          condition="AMIsReady"
          conditions={conditions}
          terms={spec?.amiSelectorTerms}
          resolved={(status?.amis ?? []).map(formatAMI)}
        />
        <DrawerItem name="AMI Family" hidden={!spec?.amiFamily}>
          {spec?.amiFamily}
        </DrawerItem>
        <SelectorSection
          title="Subnets"
          condition="SubnetsReady"
          conditions={conditions}
          terms={spec?.subnetSelectorTerms}
          resolved={(status?.subnets ?? []).map(formatSubnet)}
        />
        <SelectorSection
          title="Security Groups"
          condition="SecurityGroupsReady"
          conditions={conditions}
          terms={spec?.securityGroupSelectorTerms}
          resolved={(status?.securityGroups ?? []).map(formatSecurityGroup)}
        />
        <SelectorSection
          title="Capacity Reservations"
          condition="CapacityReservationsReady"
          conditions={conditions}
          terms={spec?.capacityReservationSelectorTerms}
          resolved={(status?.capacityReservations ?? []).map(formatCapacityReservation)}
        />
        <SelectorSection
          title="Placement Group"
          condition="PlacementGroupReady"
          conditions={conditions}
          terms={placementGroup ? [placementGroup] : []}
          resolved={[]}
        />

        <DrawerTitle>Instances</DrawerTitle>
        <Badges name="Block Device Mappings" texts={(spec?.blockDeviceMappings ?? []).map(formatBlockDeviceMapping)} />
        <DrawerItem name="Instance Store Policy" hidden={!spec?.instanceStorePolicy}>
          {spec?.instanceStorePolicy}
        </DrawerItem>
        <Badges name="Network Interfaces" texts={(spec?.networkInterfaces ?? []).map(formatNetworkInterface)} />
        <Badges name="Connection Tracking" texts={fieldTexts(spec?.connectionTracking)} />
        <DrawerItem name="Associate Public IP Address" hidden={spec?.associatePublicIPAddress === undefined}>
          <BadgeBoolean value={!!spec?.associatePublicIPAddress} />
        </DrawerItem>
        <DrawerItem name="IP Prefix Count" hidden={spec?.ipPrefixCount === undefined}>
          {spec?.ipPrefixCount}
        </DrawerItem>
        <Badges name="Metadata Options" texts={fieldTexts(spec?.metadataOptions)} />
        <DrawerItem name="Detailed Monitoring" hidden={spec?.detailedMonitoring === undefined}>
          <BadgeBoolean value={!!spec?.detailedMonitoring} />
        </DrawerItem>
        <DrawerItem name="Enclave" hidden={spec?.enclaveOptions === undefined}>
          <BadgeBoolean value={!!spec?.enclaveOptions?.enabled} />
        </DrawerItem>
        <Badges name="CPU Options" texts={fieldTexts(spec?.cpuOptions)} />
        <Badges name="Kubelet" texts={fieldTexts(spec?.kubelet)} />
        <DrawerItemLabels name="Tags" labels={spec?.tags ?? {}} />
        <DrawerItem name="Context" hidden={!spec?.context}>
          {spec?.context}
        </DrawerItem>
        <CollapsedText name="User Data" text={spec?.userData} summary={linesSummary(spec?.userData ?? "")} />

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

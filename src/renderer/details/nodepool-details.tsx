import { Renderer } from "@freelensapp/extensions";
import { observer } from "mobx-react";
import { NodePool } from "../api/nodepool/nodepool-v1";
import { DetailsLink } from "../components/shared/DetailsLink";
import { detectProvider, nodeClassSelfLink } from "../data/nodeclass";
import { getNodeClaimStore, getNodeOverlayStore } from "../data/stores";
import { useSubscribedStores } from "../data/use-subscribed-stores";
import { nodeClaimSelfLink, nodeOverlaySelfLink } from "../utils/kube-helpers";
import { formatBudget, formatRequirement, formatTaint, notTrueReason, resourceRows } from "./karpenter-v1";
import { nodeClaimsOfNodePool, overlaysOfNodePool } from "./nodepool-relations";

const {
  Component: { Badge, DrawerItem, DrawerItemLabels, DrawerTitle },
} = Renderer;

/** Texts as badges, one per line of the drawer item; nothing without any. */
function Badges({ name, texts }: { name: string; texts: string[] }) {
  return (
    <DrawerItem name={name} labelsOnly hidden={texts.length === 0}>
      {texts.map((text) => (
        <Badge key={text} label={text} />
      ))}
    </DrawerItem>
  );
}

/**
 * The details of a NodePool of karpenter.sh/v1, after the host's own: the metadata, the printer columns and the
 * conditions, and the events of the object at the end. Grouped as the Go structs group the fields: the spec and its
 * status, the template of its NodeClaims, its disruption, then the objects around it.
 *
 * An observer: it reads the NodeClaims and NodeOverlays from their stores, which it loads when the page under the
 * drawer has not.
 */
export const NodePoolDetails = observer(({ object: nodePool }: Renderer.Component.KubeObjectDetailsProps<NodePool>) => {
  const nodeClaimStore = getNodeClaimStore();
  const nodeOverlayStore = getNodeOverlayStore();
  useSubscribedStores([nodeClaimStore, nodeOverlayStore]);

  const { spec, status } = nodePool;
  const template = NodePool.getTemplateSpec(nodePool);
  const metadata = spec?.template?.metadata;
  const nodeClassRef = template?.nodeClassRef;
  const disruption = spec?.disruption;
  const resources = resourceRows(status?.resources, spec?.limits);
  const nodeClaims = nodeClaimsOfNodePool(nodePool, nodeClaimStore?.items ?? []);
  const overlays = overlaysOfNodePool(nodePool, nodeOverlayStore?.items ?? []);

  const notReady = notTrueReason(status?.conditions, "Ready");

  return (
    <>
      <DrawerItem name="Not Ready" hidden={notReady === undefined}>
        {notReady}
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
      <DrawerItem name="Weight" hidden={spec?.weight === undefined}>
        {spec?.weight}
      </DrawerItem>
      <DrawerItem name="Replicas" hidden={spec?.replicas === undefined}>
        {`${spec?.replicas} (static NodePool)`}
      </DrawerItem>
      <DrawerItem name="Nodes" hidden={status?.nodes === undefined}>
        {status?.nodes}
      </DrawerItem>
      <DrawerItem name="Node Class Observed Generation" hidden={status?.nodeClassObservedGeneration === undefined}>
        {status?.nodeClassObservedGeneration}
      </DrawerItem>

      {resources.length > 0 && (
        <>
          <DrawerTitle>Resources (in use / limit)</DrawerTitle>
          {resources.map(({ name, inUse, limit }) => (
            <DrawerItem key={name} name={name}>
              {`${inUse ?? "-"} / ${limit ?? "no limit"}`}
            </DrawerItem>
          ))}
        </>
      )}

      <DrawerTitle>NodeClaim Template</DrawerTitle>
      <DrawerItemLabels name="Labels" labels={metadata?.labels ?? {}} />
      <DrawerItemLabels name="Annotations" labels={metadata?.annotations ?? {}} />
      <Badges name="Requirements" texts={(template?.requirements ?? []).map(formatRequirement)} />
      <Badges name="Taints" texts={(template?.taints ?? []).map(formatTaint)} />
      <Badges name="Startup Taints" texts={(template?.startupTaints ?? []).map(formatTaint)} />
      <DrawerItem name="Expire After" hidden={!template?.expireAfter}>
        {template?.expireAfter}
      </DrawerItem>
      <DrawerItem name="Termination Grace Period" hidden={!template?.terminationGracePeriod}>
        {template?.terminationGracePeriod}
      </DrawerItem>

      <DrawerTitle>Disruption</DrawerTitle>
      <DrawerItem name="Consolidation Policy" hidden={!disruption?.consolidationPolicy}>
        {disruption?.consolidationPolicy}
      </DrawerItem>
      <DrawerItem name="Consolidate After" hidden={!disruption?.consolidateAfter}>
        {disruption?.consolidateAfter}
      </DrawerItem>
      <Badges name="Budgets" texts={(disruption?.budgets ?? []).map(formatBudget)} />

      <DrawerTitle>NodeClaims</DrawerTitle>
      {nodeClaims.length === 0 ? (
        <DrawerItem name="NodeClaims">None</DrawerItem>
      ) : (
        nodeClaims.map((nodeClaim) => (
          <DrawerItem key={nodeClaim.getName()} name={nodeClaim.status?.nodeName ? "Node" : "Pending"}>
            <DetailsLink
              selfLink={nodeClaimSelfLink(nodeClaim.getName())}
              title={`Open NodeClaim ${nodeClaim.getName()}`}
            >
              {nodeClaim.getName()}
            </DetailsLink>
            {nodeClaim.status?.nodeName ? ` (${nodeClaim.status.nodeName})` : ""}
          </DrawerItem>
        ))
      )}

      {nodeOverlayStore && (
        <>
          <DrawerTitle>NodeOverlays</DrawerTitle>
          {overlays.length === 0 ? (
            <DrawerItem name="NodeOverlays">None applies</DrawerItem>
          ) : (
            overlays.map((overlay) => (
              <DrawerItem key={overlay.name} name={`Weight ${overlay.weight}`}>
                <DetailsLink selfLink={nodeOverlaySelfLink(overlay.name)} title={`Open NodeOverlay ${overlay.name}`}>
                  {overlay.name}
                </DetailsLink>
                {overlay.changes ? ` (${overlay.changes})` : ""}
              </DrawerItem>
            ))
          )}
        </>
      )}
    </>
  );
});

import { observer } from "mobx-react";
import { NodeClaim } from "../../api/nodeclaim/nodeclaim-v1";
import {
  ageColumn,
  type KindColumn,
  KindListPage,
  nameColumn,
  textColumn,
} from "../../components/KindListPage/KindListPage";
import { ConditionStatus } from "../../components/shared/ConditionStatus";
import { DetailsLink } from "../../components/shared/DetailsLink";
import { detectProvider, nodeClassSelfLink } from "../../data/nodeclass";
import { getNodeClaimStore } from "../../data/stores";
import { nodePoolSelfLink, nodeSelfLink } from "../../utils/kube-helpers";
import { pageId, pageUrl } from "../routes";
import { nodeClaimColumnValues, nodeClaimSortValues } from "./nodeclaim-columns";

import type { Renderer } from "@freelensapp/extensions";

export interface NodeClaimsPageProps {
  extension: Renderer.LensExtension;
}

/** The node of a NodeClaim, in the host's Node details over the page. */
function NodeLink({ nodeClaim }: { nodeClaim: NodeClaim }) {
  const name = nodeClaimColumnValues(nodeClaim).node;
  if (name === undefined) return null;
  return (
    <DetailsLink selfLink={nodeSelfLink(name)} title={`Open Node ${name}`}>
      {name}
    </DetailsLink>
  );
}

/** The NodePool of a NodeClaim, on the Node Pools page. */
function NodePoolLink({ nodeClaim }: { nodeClaim: NodeClaim }) {
  const name = nodeClaimColumnValues(nodeClaim).nodePool;
  if (name === undefined) return null;
  return (
    <DetailsLink selfLink={nodePoolSelfLink(name)} page={pageUrl(pageId.nodePools)} title={`Open NodePool ${name}`}>
      {name}
    </DetailsLink>
  );
}

// An observer: the link reads which node class stores the cluster serves.
const NodeClassLink = observer(function NodeClassLink({ nodeClaim }: { nodeClaim: NodeClaim }) {
  const ref = nodeClaim.spec?.nodeClassRef;
  const name = nodeClaimColumnValues(nodeClaim).nodeClass;
  if (!ref || name === undefined) return null;
  return (
    <DetailsLink selfLink={nodeClassSelfLink(name, detectProvider(ref))} title={`Open ${ref.kind} ${name}`}>
      {name}
    </DetailsLink>
  );
});

// The columns of `kubectl get nodeclaims -o wide`, in its order.
const columns: KindColumn<NodeClaim>[] = [
  nameColumn(),
  textColumn("type", "Type", (nodeClaim) => nodeClaimColumnValues(nodeClaim).type, nodeClaimSortValues.type),
  textColumn(
    "capacity",
    "Capacity",
    (nodeClaim) => nodeClaimColumnValues(nodeClaim).capacity,
    nodeClaimSortValues.capacity,
  ),
  textColumn("zone", "Zone", (nodeClaim) => nodeClaimColumnValues(nodeClaim).zone, nodeClaimSortValues.zone),
  {
    id: "node",
    title: "Node",
    render: (nodeClaim) => <NodeLink nodeClaim={nodeClaim} />,
    sortBy: nodeClaimSortValues.node,
  },
  {
    id: "ready",
    title: "Ready",
    render: (nodeClaim) => <ConditionStatus status={nodeClaimColumnValues(nodeClaim).ready} />,
    sortBy: nodeClaimSortValues.ready,
  },
  ageColumn(),
  textColumn(
    "imageID",
    "ImageID",
    (nodeClaim) => nodeClaimColumnValues(nodeClaim).imageID,
    nodeClaimSortValues.imageID,
  ),
  textColumn("id", "ID", (nodeClaim) => nodeClaimColumnValues(nodeClaim).id, nodeClaimSortValues.id),
  {
    id: "nodePool",
    title: "NodePool",
    render: (nodeClaim) => <NodePoolLink nodeClaim={nodeClaim} />,
    sortBy: nodeClaimSortValues.nodePool,
  },
  {
    id: "nodeClass",
    title: "NodeClass",
    render: (nodeClaim) => <NodeClassLink nodeClaim={nodeClaim} />,
    sortBy: nodeClaimSortValues.nodeClass,
  },
  {
    id: "drifted",
    title: "Drifted",
    render: (nodeClaim) => <ConditionStatus status={nodeClaimColumnValues(nodeClaim).drifted} />,
    sortBy: nodeClaimSortValues.drifted,
  },
];

/** The Node Claims page: the NodeClaims of `karpenter.sh/v1`. An observer, which follows the CRD. */
export const NodeClaimsPage = observer((_props: NodeClaimsPageProps) => (
  <KindListPage
    title={NodeClaim.crd.title}
    plural={NodeClaim.crd.plural}
    store={getNodeClaimStore()}
    columns={columns}
  />
));

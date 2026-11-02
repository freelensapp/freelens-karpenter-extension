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
import { STATUS_BORDER_COLOR, STATUS_VISUAL } from "../../config/theme";
import { detectProvider, nodeClassPage, nodeClassSelfLink } from "../../data/nodeclass";
import { getNodeClaimStore, getNodeStore } from "../../data/stores";
import { useSubscribedStores } from "../../data/use-subscribed-stores";
import { nodePoolSelfLink, nodeSelfLink } from "../../utils/kube-helpers";
import { pageId, pageUrl } from "../routes";
import { nodeClaimColumnValues, nodeClaimSortValues, nodeClaimStatus, nodeClaimStatusOrder } from "./nodeclaim-columns";

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

/** The node of a NodeClaim in the host's store, which the page loads. */
const nodeOf = (nodeClaim: NodeClaim) => {
  const name = nodeClaim.status?.nodeName;
  return name ? getNodeStore().getByName(name) : undefined;
};

// The status of a NodeClaim in the colour the Overview gives it, as plain text, as the host's tables show a status.
// An observer: it follows the node in the store.
const StatusCell = observer(function StatusCell({ nodeClaim }: { nodeClaim: NodeClaim }) {
  const status = nodeClaimStatus(nodeClaim, nodeOf(nodeClaim));
  return <span style={{ color: STATUS_BORDER_COLOR[status] }}>{STATUS_VISUAL[status].label}</span>;
});

// The node class of a NodeClaim, on the page of its kind when it has one, else over the page. An observer: the link
// reads which node class stores the cluster serves.
const NodeClassLink = observer(function NodeClassLink({ nodeClaim }: { nodeClaim: NodeClaim }) {
  const ref = nodeClaim.spec?.nodeClassRef;
  const name = nodeClaimColumnValues(nodeClaim).nodeClass;
  if (!ref || name === undefined) return null;
  const provider = detectProvider(ref);
  return (
    <DetailsLink
      selfLink={nodeClassSelfLink(name, provider)}
      page={nodeClassPage(provider)}
      title={`Open ${ref.kind} ${name}`}
    >
      {name}
    </DetailsLink>
  );
});

// The columns of `kubectl get nodeclaims -o wide`, in its order, with Status in place of Ready, without ImageID and ID,
// and Age last.
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
    id: "status",
    title: "Status",
    render: (nodeClaim) => <StatusCell nodeClaim={nodeClaim} />,
    sortBy: (nodeClaim) => nodeClaimStatusOrder(nodeClaimStatus(nodeClaim, nodeOf(nodeClaim))),
  },
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
  ageColumn(),
];

/**
 * The Node Claims page: the NodeClaims of `karpenter.sh/v1`. An observer, which follows the CRD. It loads the nodes,
 * which the Status column reads, when no other view has.
 */
export const NodeClaimsPage = observer((_props: NodeClaimsPageProps) => {
  useSubscribedStores([getNodeStore()]);
  return (
    <KindListPage
      title={NodeClaim.crd.title}
      plural={NodeClaim.crd.plural}
      store={getNodeClaimStore()}
      columns={columns}
    />
  );
});

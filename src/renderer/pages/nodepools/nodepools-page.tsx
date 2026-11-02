import { observer } from "mobx-react";
import { NodePool } from "../../api/nodepool/nodepool-v1";
import {
  ageColumn,
  booleanColumn,
  type KindColumn,
  KindListPage,
  nameColumn,
  numberColumn,
  textColumn,
} from "../../components/KindListPage/KindListPage";
import { DetailsLink } from "../../components/shared/DetailsLink";
import { detectProvider, nodeClassPage, nodeClassSelfLink } from "../../data/nodeclass";
import { getNodePoolStore } from "../../data/stores";
import { conditionFlag } from "../../utils/printer-columns";
import { nodePoolColumnValues, nodePoolSortValues } from "./nodepool-columns";

import type { Renderer } from "@freelensapp/extensions";

export interface NodePoolsPageProps {
  extension: Renderer.LensExtension;
}

// The node class of a NodePool, on the page of its kind when it has one, else over the page. An observer: the link
// reads which node class stores the cluster serves.
const NodeClassLink = observer(function NodeClassLink({ nodePool }: { nodePool: NodePool }) {
  const ref = NodePool.getTemplateSpec(nodePool)?.nodeClassRef;
  const name = nodePoolColumnValues(nodePool).nodeClass;
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

// The columns of `kubectl get nodepools -o wide`, with Ready right before Age, last.
const columns: KindColumn<NodePool>[] = [
  nameColumn(),
  {
    id: "nodeClass",
    title: "NodeClass",
    render: (nodePool) => <NodeClassLink nodePool={nodePool} />,
    sortBy: nodePoolSortValues.nodeClass,
  },
  numberColumn("nodes", "Nodes", (nodePool) => nodePoolColumnValues(nodePool).nodes, nodePoolSortValues.nodes),
  textColumn("weight", "Weight", (nodePool) => nodePoolColumnValues(nodePool).weight, nodePoolSortValues.weight),
  numberColumn("cpu", "CPU", (nodePool) => nodePoolColumnValues(nodePool).cpu, nodePoolSortValues.cpu),
  textColumn("memory", "Memory", (nodePool) => nodePoolColumnValues(nodePool).memory, nodePoolSortValues.memory),
  booleanColumn(
    "ready",
    "Ready",
    (nodePool) => conditionFlag(nodePoolColumnValues(nodePool).ready),
    nodePoolSortValues.ready,
  ),
  ageColumn(),
];

/** The Node Pools page: the NodePools of `karpenter.sh/v1`. An observer, which follows the CRD. */
export const NodePoolsPage = observer((_props: NodePoolsPageProps) => (
  <KindListPage title={NodePool.crd.title} plural={NodePool.crd.plural} store={getNodePoolStore()} columns={columns} />
));

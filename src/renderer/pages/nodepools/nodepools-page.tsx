import { observer } from "mobx-react";
import { NodePool } from "../../api/nodepool/nodepool-v1";
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
import { getNodePoolStore } from "../../data/stores";
import { nodePoolColumnValues, nodePoolSortValues } from "./nodepool-columns";

import type { Renderer } from "@freelensapp/extensions";

export interface NodePoolsPageProps {
  extension: Renderer.LensExtension;
}

// An observer: the link reads which node class stores the cluster serves.
const NodeClassLink = observer(function NodeClassLink({ nodePool }: { nodePool: NodePool }) {
  const ref = NodePool.getTemplateSpec(nodePool)?.nodeClassRef;
  const name = nodePoolColumnValues(nodePool).nodeClass;
  if (!ref || name === undefined) return null;
  return (
    <DetailsLink selfLink={nodeClassSelfLink(name, detectProvider(ref))} title={`Open ${ref.kind} ${name}`}>
      {name}
    </DetailsLink>
  );
});

// The columns of `kubectl get nodepools -o wide`, in its order.
const columns: KindColumn<NodePool>[] = [
  nameColumn(),
  {
    id: "nodeClass",
    title: "NodeClass",
    render: (nodePool) => <NodeClassLink nodePool={nodePool} />,
    sortBy: nodePoolSortValues.nodeClass,
  },
  textColumn("nodes", "Nodes", (nodePool) => nodePoolColumnValues(nodePool).nodes, nodePoolSortValues.nodes),
  {
    id: "ready",
    title: "Ready",
    render: (nodePool) => <ConditionStatus status={nodePoolColumnValues(nodePool).ready} />,
    sortBy: nodePoolSortValues.ready,
  },
  ageColumn(),
  textColumn("weight", "Weight", (nodePool) => nodePoolColumnValues(nodePool).weight, nodePoolSortValues.weight),
  textColumn("cpu", "CPU", (nodePool) => nodePoolColumnValues(nodePool).cpu, nodePoolSortValues.cpu),
  textColumn("memory", "Memory", (nodePool) => nodePoolColumnValues(nodePool).memory, nodePoolSortValues.memory),
];

/** The Node Pools page: the NodePools of `karpenter.sh/v1`. An observer, which follows the CRD. */
export const NodePoolsPage = observer((_props: NodePoolsPageProps) => (
  <KindListPage title={NodePool.crd.title} plural={NodePool.crd.plural} store={getNodePoolStore()} columns={columns} />
));

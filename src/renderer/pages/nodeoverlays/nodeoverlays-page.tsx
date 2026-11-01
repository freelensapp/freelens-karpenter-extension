import { observer } from "mobx-react";
import { NodeOverlay } from "../../api/nodeoverlay/nodeoverlay-v1alpha1";
import {
  ageColumn,
  type KindColumn,
  KindListPage,
  nameColumn,
  textColumn,
} from "../../components/KindListPage/KindListPage";
import { ConditionStatus } from "../../components/shared/ConditionStatus";
import { getNodeOverlayStore } from "../../data/stores";
import { nodeOverlayColumnValues, nodeOverlaySortValues } from "./nodeoverlay-columns";

import type { Renderer } from "@freelensapp/extensions";

export interface NodeOverlaysPageProps {
  extension: Renderer.LensExtension;
}

// The columns of `kubectl get nodeoverlays -o wide`, in its order.
const columns: KindColumn<NodeOverlay>[] = [
  nameColumn(),
  {
    id: "ready",
    title: "Ready",
    render: (overlay) => <ConditionStatus status={nodeOverlayColumnValues(overlay).ready} />,
    sortBy: nodeOverlaySortValues.ready,
  },
  ageColumn(),
  textColumn("weight", "Weight", (overlay) => nodeOverlayColumnValues(overlay).weight, nodeOverlaySortValues.weight),
];

/** The Node Overlays page: the NodeOverlays of `karpenter.sh/v1alpha1`. An observer, which follows the CRD. */
export const NodeOverlaysPage = observer((_props: NodeOverlaysPageProps) => (
  <KindListPage
    title={NodeOverlay.crd.title}
    plural={NodeOverlay.crd.plural}
    store={getNodeOverlayStore()}
    columns={columns}
  />
));

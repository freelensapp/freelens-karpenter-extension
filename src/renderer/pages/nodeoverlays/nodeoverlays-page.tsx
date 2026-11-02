import { observer } from "mobx-react";
import { NodeOverlay } from "../../api/nodeoverlay/nodeoverlay-v1alpha1";
import {
  ageColumn,
  booleanColumn,
  type KindColumn,
  KindListPage,
  nameColumn,
  numberColumn,
} from "../../components/KindListPage/KindListPage";
import { getNodeOverlayStore } from "../../data/stores";
import { conditionFlag } from "../../utils/printer-columns";
import { nodeOverlayColumnValues, nodeOverlaySortValues } from "./nodeoverlay-columns";

import type { Renderer } from "@freelensapp/extensions";

export interface NodeOverlaysPageProps {
  extension: Renderer.LensExtension;
}

// The columns of `kubectl get nodeoverlays -o wide`, with Ready right before Age, last.
const columns: KindColumn<NodeOverlay>[] = [
  nameColumn(),
  numberColumn("weight", "Weight", (overlay) => nodeOverlayColumnValues(overlay).weight, nodeOverlaySortValues.weight),
  booleanColumn(
    "ready",
    "Ready",
    (overlay) => conditionFlag(nodeOverlayColumnValues(overlay).ready),
    nodeOverlaySortValues.ready,
  ),
  ageColumn(),
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

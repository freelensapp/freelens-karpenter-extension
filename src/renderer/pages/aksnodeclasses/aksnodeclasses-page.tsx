import { observer } from "mobx-react";
import { AKSNodeClass as AKSNodeClassV1beta1 } from "../../api/aksnodeclass/aksnodeclass-v1beta1";
import {
  ageColumn,
  type KindColumn,
  KindListPage,
  nameColumn,
  textColumn,
} from "../../components/KindListPage/KindListPage";
import { ConditionStatus } from "../../components/shared/ConditionStatus";
import { type AKSNodeClass, getAKSNodeClassStore } from "../../data/stores";
import { aksNodeClassColumnValues, aksNodeClassSortValues } from "./aksnodeclass-columns";

import type { Renderer } from "@freelensapp/extensions";

export interface AKSNodeClassesPageProps {
  extension: Renderer.LensExtension;
}

// The columns of `kubectl get aksnodeclasses -o wide`, the same in both versions, with Ready right before Age, last.
const columns: KindColumn<AKSNodeClass>[] = [
  nameColumn(),
  textColumn(
    "imageFamily",
    "ImageFamily",
    (nodeClass) => aksNodeClassColumnValues(nodeClass).imageFamily,
    aksNodeClassSortValues.imageFamily,
  ),
  {
    id: "ready",
    title: "Ready",
    render: (nodeClass) => <ConditionStatus status={aksNodeClassColumnValues(nodeClass).ready} />,
    sortBy: aksNodeClassSortValues.ready,
  },
  ageColumn(),
];

/**
 * The AKS Node Classes page: the AKSNodeClasses of the newest version the cluster serves, `karpenter.azure.com/v1beta1`,
 * else `v1alpha2`, which the Azure provider served until v1.14.2. The two versions have the same title and the same
 * columns. An observer, which follows the CRD.
 */
export const AKSNodeClassesPage = observer((_props: AKSNodeClassesPageProps) => (
  <KindListPage<AKSNodeClass>
    title={AKSNodeClassV1beta1.crd.title}
    plural={AKSNodeClassV1beta1.crd.plural}
    // The store of one version is a store of the union for the page, which only reads the objects; the store's
    // `defaultSorting`, typed for its version, keeps TypeScript from seeing that.
    store={getAKSNodeClassStore() as Renderer.K8sApi.KubeObjectStore<AKSNodeClass> | undefined}
    columns={columns}
  />
));

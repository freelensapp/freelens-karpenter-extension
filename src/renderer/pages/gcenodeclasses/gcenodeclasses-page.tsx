import { observer } from "mobx-react";
import { GCENodeClass } from "../../api/gcenodeclass/gcenodeclass-v1alpha1";
import {
  ageColumn,
  badgesColumn,
  type KindColumn,
  KindListPage,
  nameColumn,
  readyColumn,
} from "../../components/KindListPage/KindListPage";
import { getGCENodeClassStore } from "../../data/stores";
import { gceNodeClassColumnValues, gceNodeClassImageTerms, gceNodeClassSortValues } from "./gcenodeclass-columns";

import type { Renderer } from "@freelensapp/extensions";

export interface GCENodeClassesPageProps {
  extension: Renderer.LensExtension;
}

// The columns of `kubectl get gcenodeclasses -o wide`, after Image Family, which the CRD has no column for.
const columns: KindColumn<GCENodeClass>[] = [
  nameColumn(),
  badgesColumn("imageFamily", "Image Family", gceNodeClassImageTerms),
  readyColumn((nodeClass) => gceNodeClassColumnValues(nodeClass).ready, gceNodeClassSortValues.ready),
  ageColumn(),
];

/** The GCE Node Classes page: the GCENodeClasses of `karpenter.k8s.gcp/v1alpha1`. An observer, which follows the CRD. */
export const GCENodeClassesPage = observer((_props: GCENodeClassesPageProps) => (
  <KindListPage
    title={GCENodeClass.crd.title}
    plural={GCENodeClass.crd.plural}
    store={getGCENodeClassStore()}
    columns={columns}
  />
));

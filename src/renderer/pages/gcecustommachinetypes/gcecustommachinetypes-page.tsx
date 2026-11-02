import { observer } from "mobx-react";
import { GCECustomMachineType } from "../../api/gcecustommachinetype/gcecustommachinetype-v1alpha1";
import {
  ageColumn,
  type KindColumn,
  KindListPage,
  nameColumn,
  readyColumn,
  textColumn,
} from "../../components/KindListPage/KindListPage";
import { getGCECustomMachineTypeStore } from "../../data/stores";
import { gceCustomMachineTypeColumnValues, gceCustomMachineTypeSortValues } from "./gcecustommachinetype-columns";

import type { Renderer } from "@freelensapp/extensions";

export interface GCECustomMachineTypesPageProps {
  extension: Renderer.LensExtension;
}

// The columns of `kubectl get gcecustommachinetypes -o wide`, with Ready right before Age, last.
const columns: KindColumn<GCECustomMachineType>[] = [
  nameColumn(),
  textColumn(
    "machineType",
    "Machine Type",
    (machineType) => gceCustomMachineTypeColumnValues(machineType).machineType,
    gceCustomMachineTypeSortValues.machineType,
  ),
  readyColumn(
    (machineType) => gceCustomMachineTypeColumnValues(machineType).ready,
    gceCustomMachineTypeSortValues.ready,
  ),
  ageColumn(),
];

/**
 * The GCE Custom Machine Types page: the GCECustomMachineTypes of `karpenter.k8s.gcp/v1alpha1`. An observer, which
 * follows the CRD.
 */
export const GCECustomMachineTypesPage = observer((_props: GCECustomMachineTypesPageProps) => (
  <KindListPage
    title={GCECustomMachineType.crd.title}
    plural={GCECustomMachineType.crd.plural}
    store={getGCECustomMachineTypeStore()}
    columns={columns}
  />
));

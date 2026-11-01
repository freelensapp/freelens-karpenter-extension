import { observer } from "mobx-react";
import { EC2NodeClass } from "../../api/ec2nodeclass/ec2nodeclass-v1";
import {
  ageColumn,
  type KindColumn,
  KindListPage,
  nameColumn,
  textColumn,
} from "../../components/KindListPage/KindListPage";
import { ConditionStatus } from "../../components/shared/ConditionStatus";
import { getEC2NodeClassStore } from "../../data/stores";
import { ec2NodeClassColumnValues, ec2NodeClassSortValues } from "./ec2nodeclass-columns";

import type { Renderer } from "@freelensapp/extensions";

export interface EC2NodeClassesPageProps {
  extension: Renderer.LensExtension;
}

// The columns of `kubectl get ec2nodeclasses -o wide`, in its order.
const columns: KindColumn<EC2NodeClass>[] = [
  nameColumn(),
  {
    id: "ready",
    title: "Ready",
    render: (nodeClass) => <ConditionStatus status={ec2NodeClassColumnValues(nodeClass).ready} />,
    sortBy: ec2NodeClassSortValues.ready,
  },
  ageColumn(),
  textColumn("role", "Role", (nodeClass) => ec2NodeClassColumnValues(nodeClass).role, ec2NodeClassSortValues.role),
];

/** The EC2 Node Classes page: the EC2NodeClasses of `karpenter.k8s.aws/v1`. An observer, which follows the CRD. */
export const EC2NodeClassesPage = observer((_props: EC2NodeClassesPageProps) => (
  <KindListPage
    title={EC2NodeClass.crd.title}
    plural={EC2NodeClass.crd.plural}
    store={getEC2NodeClassStore()}
    columns={columns}
  />
));

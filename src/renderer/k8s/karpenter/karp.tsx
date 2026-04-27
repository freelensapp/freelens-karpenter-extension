import { Renderer } from "@freelensapp/extensions";

import { observer } from "mobx-react";

import React from "react";

import styleInline from "./karp.scss?inline";
import { NodePool, getNodePoolStore } from "./store";

const {
  Component: { KubeObjectListLayout},
} = Renderer;

enum sortBy {
  name = "name",
}

@observer
export class KarpenterNodePools extends React.Component<{ extension: Renderer.LensExtension }> {
  render() {
    const nodePoolStore = getNodePoolStore();

    return (
      <>
        <style>{styleInline}</style>
        <KubeObjectListLayout
          tableId="helmReleasesTable"
          className="HelmReleases"
          store={nodePoolStore}
          sortingCallbacks={{
            // show revision like weave
            [sortBy.name]: (nodePool: NodePool) => nodePool.getName(),
          }}
          searchFilters={[(nodePool: NodePool) => nodePool.getSearchFields()]}
          renderHeaderTitle="Node Pools"
          renderTableHeader={[
            { title: "Name", className: "name", sortBy: sortBy.name },
          ]}
          renderTableContents={(nodepool: NodePool) => {
            const tooltipId = `nodepool-${nodepool.getId()}`;


            return [
              <>
                <span id={`${tooltipId}-name`}>{nodepool.getName()}</span>
              </>,
            ];
          }}
        />
      </>
    );
  }
}

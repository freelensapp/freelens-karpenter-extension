# SPEC-0001: Port to the Freelens v2 extension API

- **Status:** Approved
- **Milestone:** `M1` (see [ROADMAP.md](../development/ROADMAP.md))
- **Karpenter versions reviewed:** `kubernetes-sigs/karpenter` `v1.15.0`, `aws/karpenter-provider-aws` `v1.15.0`, `Azure/karpenter-provider-azure` `v1.14.5`
- **Freelens pin:** freelensapp/freelens@d5e986b4359866284e37968798dba5910e831ad4, `@freelensapp/extensions@2.0.0-0-nightly-2026-10-12`
- **Tracking issues:** the migration issue (a copy of freelensapp/freelens-example-extension#326) and the feature issues K (data layer), O (Overview and dashboard shell), T (Topology), N (Node classes), S (Scaling decisions)
- **Author / date:** Roberto Bandini, with a coding agent, 2026-10-15

## Goal

The Karpenter dashboard loads and works on Freelens 2.x as it does on
Freelens 1.x with the extension 1.0.1, built and tested the way the reference
template builds and tests a v2 extension.

## Upstream reference

- Freelens: `docs/extensions/migrating-from-v1.md`, `docs/extensions/api.md`
  (contracts C1-C15) at the pin; the template
  freelensapp/freelens-example-extension at `main`, its `AGENTS.md` and its
  `port-freelens-extension-to-v2` skill.
- Karpenter: the API types of `karpenter.sh/v1` (`NodePool`, `NodeClaim`) in
  `kubernetes-sigs/karpenter` `pkg/apis/v1`; `karpenter.k8s.aws/v1`
  (`EC2NodeClass`) in `aws/karpenter-provider-aws` `pkg/apis/v1`;
  `karpenter.azure.com/v1beta1` and `v1alpha2` (`AKSNodeClass`) in
  `Azure/karpenter-provider-azure` `pkg/apis`; the concepts pages of
  karpenter.sh (NodePools, NodeClaims, NodeClasses, Disruption).

## Scope

Included: everything the extension does in 1.0.1, on the v2 API, with typed
models, the host's stores, an error boundary around the page, unit tests,
integration tests and the build stack of the template.

Excluded: any change of behaviour that v2 does not require. Those are
candidates of [SPEC-0003](SPEC-0003-improvements.md). The only exception is
the set of AKSNodeClass versions, see "Data layer".

## Design

### Standard or ad hoc view

The extension stays one ad hoc view, the "Karpenter" dashboard, because its
tasks cut across kinds: which NodePool owns which nodes, how full its limits
are, what Karpenter decided and when. The Karpenter kinds keep no list page
of their own; their objects open in the host's Custom Resources pages, which
is why `customResources` stays unset.

### Layout after the port

```text
src/
  main/index.ts              KarpenterExtensionMain (no behaviour)
  renderer/index.tsx         KarpenterExtensionRenderer: clusterPages, clusterPageMenus
  renderer/api/<kind>/       one model per kind and version, with its tests
  renderer/api/types.ts      types shared by the models
  renderer/pages/            the dashboard page
  renderer/components/       the tabs, cards, charts, shared components, error boundary
  renderer/utils/            pure helpers, with their tests
  renderer/icons/            karpenter.svg
test/freelens-extensions.ts  stub of @freelensapp/extensions for the tests
examples/                    Karpenter CRDs and test objects (SPEC-0002)
e2e/                         the local lab (SPEC-0002)
```

`src/common/` is created only if main and renderer come to share code.

### Data layer (feature K)

- Models, after "CRD KubeObject Pattern" of the template:
  `NodePool` and `NodeClaim` (`karpenter.sh/v1`), `EC2NodeClass`
  (`karpenter.k8s.aws/v1`), `AKSNodeClass` (`karpenter.azure.com/v1beta1`
  and `v1alpha2`), all cluster-scoped. `declare kind` and `declare apiVersion`
  literals, `static readonly` metadata, `static` helpers only.
- AKSNodeClass: the newest served version is read. The Azure provider marks
  `v1alpha2` deprecated and no longer serves it in v1.14.5, where the 1.0.1
  extension, pinned to `v1alpha2`, finds no node class.
- Stores: the host's `nodesStore`, `podsStore`, `namespaceStore`,
  `crdStore`, `deploymentStore` and the models' `getStore()`, read inside
  `observer` components so that CRDs registered after the first render are
  followed. The extension builds and registers no store of a built-in kind.
- Node usage: from the metrics API through the host (`nodeMetricsApi` or
  `KubeJsonApi.forCluster`, settled in K0), kept in a map of the extension;
  the host's `Node` objects are not modified. No metrics-server, no usage, no
  error.
- Events (parity): the namespaces `default`, `karpenter` and
  `karpenter-system` are read, as in 1.0.1, without changing what the host's
  own Events page loads; K0 settles whether through `eventStore` or a
  `KubeObjectStore` of the extension over the host's event API.
- Installed: Karpenter counts as installed when the cluster serves
  `nodepools.karpenter.sh`.
- Controller version (parity): the image tag of a Deployment whose name
  contains `karpenter` in `karpenter` or `karpenter-system`; else the
  `karpenter.sh/version` or `app.kubernetes.io/version` annotation or label of
  the NodePool CRD; else "installed". Finding it in `kube-system` is
  candidate C6 of SPEC-0003.

### Overview and dashboard shell (feature O)

- Registration: `clusterPages` entry `dashboard` with
  `Page: () => <KarpenterDashboard extension={this} />`, wrapped by
  `withPageErrorBoundary`; `clusterPageMenus` entry "Karpenter" with the
  Karpenter icon.
- States: not installed (no `nodepools.karpenter.sh`), loading, loaded; tabs
  Overview, Topology, Node Classes, Scaling Decisions; version badge.
- Overview (parity): limits pie charts and NodePool cards for the NodePools
  that have at least one node; NodeClaims without a node shown as claiming;
  table and tree views; resource bars; the pool's event timeline with its
  debug table. A click on a NodePool name sets a search shared by every tab.

### Topology (feature T)

Parity: KPI strip, status and capacity-type bar, interactive legend, treemap
of nodes grouped by NodePool, instance type, zone or capacity type and sized
by the chosen measure, with the squarified layout of `topology-utils.ts`.

### Node classes (feature N)

Parity: one card per EC2NodeClass and AKSNodeClass with Ready status,
settings and the NodePools that reference it; provider detected from the
`nodeClassRef`; a click opens the node class details in the host.

### Scaling decisions (feature S)

Parity: an event is Karpenter's when its source or reporting component
contains `karpenter`, its involved kind is a Karpenter kind (`NodePool`,
`NodeClaim`, `Machine`, `EC2NodeClass`, `AKSNodeClass`, `NodeClass`), its
involved namespace is `karpenter` or `karpenter-system`, or its reason is in
the reason list of `ScalingDecisions.tsx` (which includes `FailedScheduling`
and `Nominated`). The timeline buckets them over time; the list shows them.

### Node status (shared, parity)

A node is Terminating with a deletion timestamp or the
`karpenter.sh/disruption` taint, Ready with condition Ready true; a Karpenter
node (label `karpenter.sh/nodeclaim` or `karpenter.sh/nodepool`) without
Ready, with a bootstrap taint or younger than 5 minutes is Provisioning,
otherwise NotReady. A NodeClaim without `status.nodeName` and without a
deletion timestamp is claiming.

### Safety

Read-only: list and watch of the kinds above, a get of the metrics API.
Nothing is written to the cluster.

## Tests (non-regression list)

- Unit (`vitest`, next to the code):
  - models: metadata, `declare` literals, `static` helpers of each kind and
    version;
  - `utils/`: node status (each branch above), condition status, resource
    parsing (`parseCpuCores`, `parseMemGi`), instance type, pod count map,
    version parsing from an image and from CRD metadata;
  - events: `filterPoolEvents`, `isKarpenterEvent`, timeline bucketing;
  - topology: grouping by each key, `squarify` (proportional areas, every
    item placed once, no recursion on degenerate input), KPI counts;
  - node classes: provider detection, the NodePools of a node class;
  - page: the three states, and the late-CRD case with a `getStore` spy that
    reads an observable;
  - error boundary: the template's test.
- Integration (Freelens harness, template style): install the extension;
  open the static lab cluster; open the dashboard and each tab; check one
  NodePool card, the treemap, one node class card and the decisions list; no
  error in either process.
- Functional (lab, Freelens dev over CDP): the functional checks of the
  migration issue and of each feature issue, with screenshots per tab,
  compared with the v1 baseline.
- Manual verification (maintainer): see below.

### Manual verification

1. On a real EKS cluster with Karpenter, read-only: open the dashboard, each
   tab, and the links to a node, a NodePool, a NodeClaim and an EC2NodeClass.
   Expected: the same content as in 1.0.1 on Freelens 1.x, no error.
2. On a real AKS cluster with node autoprovisioning: the Node Classes tab
   shows the AKSNodeClasses. Expected: cards present (1.0.1 shows none on
   provider v1.14.x).
3. The dashboard on macOS and Windows, both themes. Expected: same layout as
   on Linux.

Results: not yet run.

## Notes and deviations

None yet.

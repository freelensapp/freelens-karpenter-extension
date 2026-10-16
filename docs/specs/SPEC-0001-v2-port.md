# SPEC-0001: Port to the Freelens v2 extension API

- **Status:** Verified (2026-10-16: Phase 5 validation and the manual checks)
- **Milestone:** `M1` (see [ROADMAP.md](../development/ROADMAP.md))
- **Karpenter versions reviewed:** `kubernetes-sigs/karpenter` `v1.15.0`, `aws/karpenter-provider-aws` `v1.15.0`, `Azure/karpenter-provider-azure` `v1.14.5`
- **Freelens pin:** freelensapp/freelens@5e1870e97467edab81b856a4983483d0729db896, `@freelensapp/extensions@2.0.0-0-nightly-2026-10-15` (moved from d5e986b43 and the 2026-10-12 nightly on 2026-10-15, with the template)
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
candidates of [SPEC-0003](SPEC-0003-improvements.md). The exceptions are the
set of AKSNodeClass versions (see "Data layer") and the bugs of 1.0.1 found in
the baseline of SPEC-0002, which the port fixes in the code it touches, each
with a unit test (decision of 2026-10-15):

- B2: a NodePool belongs to the node class its `nodeClassRef` names by group,
  kind and name, not by name alone (Node classes);
- B3: "Expire after" reads `spec.template.spec.expireAfter` of
  `karpenter.sh/v1` (Node classes);
- B4: the kubelet settings read `spec.kubelet`, the name of both
  `karpenter.k8s.aws/v1` and `karpenter.azure.com` (Node classes);
- B7: memory is shown in binary units, as in the other tabs (Node classes);
- B8: a NodePool without a memory limit shows no limit, not `0Mi` (Overview);
- B9, found in T2: a node labelled `eks.amazonaws.com/capacityType=ON_DEMAND`,
  as EKS labels the nodes of its managed node groups, counts as on-demand, not
  as unknown (Topology);
- B10, found in N0: the role of an EC2NodeClass is labelled "Role", not
  "Instance Profile", which names `spec.instanceProfile` only (Node classes).
- B11, found in S0: the node count of a NodePool over time drops a node at
  `Finalized`, the event Karpenter v1 writes when a NodeClaim is gone, as well
  as at `Terminated` of earlier versions; 1.0.1 knew only `Terminated`, so a
  removed node stayed in the history until the live count at the end
  (Scaling decisions);
- B12, found in S1: Topology and Scaling decisions follow the stores while
  they are open. 1.0.1 kept their data in `useMemo`s keyed on the stores'
  `items`, an array the host updates in place, so the nodes and events
  stayed as they were when the tab was opened (seen on 1.0.1 in the live
  lab: 1 Karpenter node in the cluster, 3 on the open Topology tab).
- B13, found in I (C4): a Karpenter node that is not ready and has the
  disruption taint is Terminating by `karpenter.sh/disrupted`, the taint of
  Karpenter v1, as well as by `karpenter.sh/disruption` of earlier versions;
  1.0.1 knew only the old one (node status, shared).
- B14, found in Phase 5: a click on a NodeClaim still waiting for its node,
  in the table of a NodePool card, opens its details. In 1.0.1 it reached the
  NodeClaim list and closed the drawer at once: the click went on to the
  host's drawer, which took it for a click outside itself, since the row was
  no longer in the page. Every other link of the extension stops the click
  (Overview).

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
  renderer/index.tsx         KarpenterExtensionRenderer: clusterPages, clusterPageMenus, kubeObjectDetailItems
  renderer/api/<kind>/       one model per kind and version, with its tests
  renderer/api/types.ts      types shared by the models
  renderer/data/             stores, loading, controller version, node classes
  renderer/pages/            the dashboard page and the Overview tab
  renderer/details/          the Karpenter section of the host's Node details (C4)
  renderer/components/       the other tabs, cards, charts, shared components, error boundary
  renderer/hooks/            data hooks of the NodePool card
  renderer/utils/            pure helpers, with their tests
  renderer/config/theme.ts   colours, icons, labels
  renderer/icons/            karpenter.svg
test/freelens-extensions.ts  stub of @freelensapp/extensions for the tests
e2e/                         the local lab, with its CRDs and fixtures (SPEC-0002)
```

The layout and its rules are described in `AGENTS.md`.

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
- Node usage: 1.0.1 fetched the metrics API for every node and wrote the
  result into `status.usage` of the host's `Node` objects, but no view ever
  read it, so the port drops the request without a replacement. A view that
  needs node usage takes it from `Renderer.K8sApi.nodesStore.loadKubeMetrics()`
  and `getNodeKubeMetrics(node)` (step 0).
- Events (parity): the namespaces `default`, `karpenter` and
  `karpenter-system` are read, as in 1.0.1, by a `KubeObjectStore` of the
  extension over a `KubeApi` of its own (`autoRegister: false`), so that what
  the host's own Events page has loaded does not change. Not over
  `Renderer.K8sApi.eventApi`: that object wraps `objectConstructor` in a plain
  function, and the store's `new` of it fails on every watch event (finding
  of K, reported upstream).
- Installed: Karpenter counts as installed when the cluster serves
  `nodepools.karpenter.sh`.
- Controller version (parity): the image tag of a Deployment whose name
  contains `karpenter` in `karpenter` or `karpenter-system`; else the
  `karpenter.sh/version` or `app.kubernetes.io/version` annotation or label of
  the NodePool CRD; else "installed". Finding it by its label in any
  namespace, `kube-system` included, is C6 of SPEC-0003, done in feature I.

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
of nodes grouped by NodePool, zone, instance type or node class and sized
by CPU, memory, pods or equally, with the squarified layout of `topology-utils.ts`.

### Node classes (feature N)

Parity: one card per EC2NodeClass and AKSNodeClass with Ready status,
settings and the NodePools that reference it by the group, kind and name of
their `nodeClassRef` (B2); provider from the kind of the node class; a click
opens the node class details in the host, a click on a NodePool row the
NodePool's.

### Scaling decisions (feature S)

Which events (parity): an event is Karpenter's when its source or reporting
component contains `karpenter`, its involved kind is a Karpenter kind
(`NodePool`, `NodeClaim`, `Machine`, `EC2NodeClass`, `AKSNodeClass`,
`NodeClass`), its involved namespace is `karpenter` or `karpenter-system`, or
its reason is one Karpenter writes, `FailedScheduling` of the scheduler
included, as in 1.0.1. Reasons that other components write too (the
kubelet's `Evicted`, a bare `Ready`) count only by the source. Only the
events of the namespaces of the data layer are read, so the `Nominated` and
`FailedScheduling` events of a pod in another namespace are not shown, as in
1.0.1 (decision of 2026-10-16; a known limit).

Groups (decision of 2026-10-16), by the reasons of Karpenter v1.15.0 and
those of earlier versions, in `utils/karpenter-events.ts`:

- Scale up: `Launched`, `Registered`, `Initialized`, `Ready` on a NodeClaim,
  Machine or node (on a NodePool these are the status of the pool: Other);
  `Provisioned`, `ScaledUp`.
- Scale down: `DisruptionLaunching`, `DisruptionWaitingReadiness`,
  `DisruptionTerminating`, `Drained`, `Finalized`, `Disrupted`, `Evicted`;
  `Disrupting`, `Consolidated`, `Terminating`, `Terminated`, `ScaledDown`.
- Drift: `Drifted`.
- Errors: `InsufficientCapacityError`, `FailedScheduling`,
  `NoCompatibleInstanceTypes`, `NodeClassNotReady`, `FailedDraining`,
  `FailedTermination`, `FailedConsistencyCheck`, `UnregisteredTaintMissing`,
  `RebootFailed`; `NotLaunched`, `NotRegistered`, `NotInitialized`,
  `InsufficientCapacity`; and any Warning no reason classifies.
- Other: the rest, such as `Nominated`, `Unconsolidatable`,
  `DisruptionBlocked` and `NodeRepairBlocked` (drawn as a block),
  `Consolidation*`, `DoNotDisrupt*` and the conditions of a NodePool.

The same groups colour the events of a NodePool card in the Overview.

Timeline (parity): about 45 buckets over the range (1h, 6h, 24h, all), at
least 5 minutes for fewer than 10 events, empty buckets kept. The node count
of a NodePool over time starts from the live nodes and walks back through
the NodeClaim events: a NodeClaim adds a node at its first `Launched` and
removes it at its first `Finalized` or `Terminated` (B11); node events are
left out, since a node has events under its own name and its NodeClaim's.

### Node status (shared, parity)

A node is Terminating with a deletion timestamp, Ready with condition Ready
true; a Karpenter node (label `karpenter.sh/nodeclaim` or
`karpenter.sh/nodepool`) that is not ready is Terminating with the
`karpenter.sh/disrupted` taint (`karpenter.sh/disruption` before v1, B13),
Provisioning without Ready, with a bootstrap taint or younger than 5 minutes,
otherwise NotReady. A NodeClaim without `status.nodeName` and without a
deletion timestamp is claiming.

### Safety

Read-only: list and watch of the Karpenter kinds the cluster serves
(NodePools, NodeClaims, NodeOverlays, EC2NodeClasses, AKSNodeClasses), nodes,
pods and the events of `default`, `karpenter` and `karpenter-system`; a list
of CRDs and of namespaces; a list of Deployments for the controller version, in all
namespaces by label, else in `karpenter` and `karpenter-system` (C6 of
SPEC-0003). The metrics API is no longer read (see "Data layer"). Nothing is
written to the cluster.

## Tests (non-regression list)

- Unit (`vitest`, next to the code):
  - models: metadata, `declare` literals, `static` helpers of each kind and
    version;
  - `utils/`: node status (each branch above), condition status, resource
    parsing (`parseCpuCores`, `parseMemGi`), instance type, pod count map,
    version parsing from an image and from CRD metadata;
  - events: `filterPoolEvents`, `isKarpenterEvent`, the group of each reason,
    the NodePool of an event, bucket size and bucketing, the node count over
    time, age;
  - `useItems`: a memo follows a store updated in place (B12);
  - topology: grouping by each key, `squarify` (proportional areas, every
    item placed once, no recursion on degenerate input), KPI counts;
  - node classes: provider detection, the NodePools of a node class;
  - improvements (SPEC-0003): the Overview figures (C2), the empty event
    state of a card (C3), the Node details item (C4), the NodeOverlays of a
    NodePool (C5), the controller lookup (C6);
  - page: the three states, and the late-CRD case with a `getStore` spy that
    reads an observable;
  - error boundary: the template's test.
- Integration (Freelens harness, template style): install the extension;
  open the static lab cluster; open the dashboard and each tab; check one
  NodePool card, the treemap, one node class card and the decisions list; the
  Karpenter section of a node's details; the details that the links of the
  dashboard and of that section open, still open a second later (B14); no
  error in either process but the
  host's requests to the metrics API, which the static lab does not serve.
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

Results (2026-10-16, Roberto Bandini, on the build validated in Phase 5):
1. EKS, read-only: as expected.
2. AKS with node autoprovisioning: as expected.
3. macOS and Windows, both themes: as expected.
The labs of SPEC-0002 were also reviewed by hand in both themes.

## Notes and deviations

- Feature K (2026-10-16): the models are in `src/renderer/api/<kind>/`; their
  spec and status types (`*-types.ts`) were produced from the Go types of the
  reviewed versions by a generator kept in the working folder of the port
  (`tools/gen-api-types/`), which takes the optional fields from the generated
  CRDs and reports where the markers disagree (nowhere, at these versions),
  and were then reviewed. `api/types.ts` holds the Kubernetes core types they
  use. The data access is in `src/renderer/data/`: `stores.ts` (the served
  version of each kind, the host's stores, the events store), `load.ts` (load
  and subscribe, with an abort signal), `controller-version.ts` and
  `nodeclass.ts`. The `k8s/` folder of 1.0.1 is gone.
- Feature O (2026-10-16): the page is `src/renderer/pages/dashboard.tsx`, an
  `observer` function component; its state (loading, not installed, loaded)
  comes from `data/use-dashboard-data.ts`, which loads the data again when
  the served stores change, so a CRD created or deleted while the page is open
  is followed. The Overview is `pages/overview.tsx`, its filter
  `pages/overview-filter.ts`. B3 was also in the NodePool card, which read the
  `expireAfter` of v1beta1; the card reads `spec.template.spec.expireAfter`.
  The API server can answer 429 to the first list of a kind whose CRD was just
  created, and the host's `loadAll` then resolves with the store empty;
  `loadAndSubscribe` tries a failed load again, with a growing wait, before it
  subscribes.
- Feature T (2026-10-16): no change of behaviour beyond B9; `topology-utils.ts`
  reads the host's `Node` and the NodePool model, and `computeKpi` takes the
  time to compare the age of the nodes with, as `getNodeStatus` does, so that
  the tests do not depend on the clock. The `ResizeObserver` of the treemap was
  already disconnected on unmount.
- Feature N (2026-10-16): what the cards show is in
  `components/NodeClassesTab/nodeclass-card.ts`, pure functions of the
  objects; the card is an `observer` and reads the NodePool and node stores
  while it renders, where 1.0.1 kept them in a `useMemo` keyed on the number of
  items, which missed a change that kept the number. The memory of the other
  tabs and of the Node Classes tab is formatted by `formatMemory` of
  `utils/kube-helpers.ts`. An AKSNodeClass has no `subnetSelectorTerms` (its
  subnet is `spec.vnetSubnetID`), so 1.0.1 never showed "Subnets" for it; the
  card no longer reads it.
- Feature S (2026-10-16): what the tab computes is in
  `utils/karpenter-events.ts`, pure functions of the events (which are
  Karpenter's, their group and look, their NodePool, the buckets, the node
  count over time), shared with the events of the NodePool cards, which took
  their look from a reason table of `config/theme.ts` that is gone. The tab no
  longer injects its stylesheet a second time with a `<style>` element. B12
  is fixed by `data/use-items.ts`, a copy of a store's items that is a new
  array when an object is added, removed or updated, used by the tab and by
  Topology. Checked in the live lab with the tab open while the workloads
  scale up and down: the counts, the charts and the tables follow, and a
  removed node leaves the history at its `Finalized` event.

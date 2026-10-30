# SPEC-0003: Improvements beyond parity

- **Status:** Verified (C1-C6, 2026-10-16; approved 2026-10-15, C2 redefined and C3 removal chosen in step I0)
- **Milestone:** `M2` (see [ROADMAP.md](../development/ROADMAP.md))
- **Karpenter versions reviewed:** `kubernetes-sigs/karpenter` `v1.15.0`, `aws/karpenter-provider-aws` `v1.15.0`, `Azure/karpenter-provider-azure` `v1.14.5`
- **Tracking issue:** the improvements feature issue (I)
- **Author / date:** Roberto Bandini, with a coding agent, 2026-10-15

## Goal

Make the dashboard better than 1.0.1 where the port showed a gap, with every
change approved on its own before it is coded.

## Scope

The candidates below. Each one is approved, changed or dropped by the
maintainer; only approved ones are implemented, after the parity features of
SPEC-0001. Nothing here writes to a cluster.

## Candidates

### C1. Both themes

- **Problem:** most colours come from the host's CSS variables, but the tab
  bar, the version badge and the empty states use fixed colours with dark
  fallbacks, and the extension was only seen in the dark theme.
- **Proposal:** check every view in the light theme against the baseline and
  move the fixed colours to the host's theme variables; no new palette.
- **Tests:** functional screenshots of every tab in both themes.
- **Decision:** approved by Roberto Bandini, 2026-10-15.

### C2. NodePools without nodes

- **Problem:** the Overview leaves out NodePools without nodes, so one
  scaled to zero, or one that cannot launch, is invisible.
- **Proposal:** show every NodePool, with an empty state for one without
  nodes.
- **Tests:** unit test of the pool selection; the `empty` NodePool of the
  static lab is shown.
- **Decision:** approved by Roberto Bandini, 2026-10-15.
- **Note (baseline, 2026-10-15):** the Overview of 1.0.1 already has a "+1
  empty" control for NodePools without nodes. Step I0 checks what it shows;
  C2 is redefined to the gap that remains, or dropped if none does.
- **Step I0 (2026-10-16):** the "+N empty" control shows each NodePool
  without nodes with its limits and an empty state, and hides them again, in
  1.0.1 and in the port (`smoke/I0-empty` of the working folder). What
  remains is the "NODEPOOLS" figure of the Overview chart, which counts the
  NodePools with nodes only, so a cluster with a pool scaled to zero reads as
  having one pool fewer.
- **Redefined (decision of 2026-10-16):** the "NODEPOOLS" figure counts every
  NodePool; the NodePools without nodes stay behind "+N empty", and the chart
  still has one slice per NodePool with nodes. Tests: unit test of the count;
  the static lab, with its `empty` NodePool, shows 4 (1.0.1 shows 3).

### C3. Debug table of the pool events

- **Problem:** the NodePool card offers a debug table of raw events in the
  released UI.
- **Proposal:** remove it, or keep it behind a preference.
- **Tests:** functional check that it is gone, or follows the preference.
- **Decision:** approved by Roberto Bandini, 2026-10-15; removal or preference is chosen in step I0.
- **Step I0 (2026-10-16):** the table lists the namespace, kind, name and
  reason of events the card has already matched, which the card shows
  anyway, and only when it has matched none, so it is empty whenever it
  appears. It helped while the event matching was written. Removed
  (decision of 2026-10-16), with its "Show debug" button; the empty state
  keeps "No events found" and the refresh.

### C4. Karpenter details on the host's Node details

- **Problem:** the Karpenter information of a node (NodePool, NodeClaim,
  capacity type, disruption taint) is only in the dashboard.
- **Proposal:** a details item on the host's Node details, registered with
  `Renderer.K8sApi.detailsFor(Renderer.K8sApi.Node, ...)` and wrapped by the
  error boundary; `customResources` stays unset.
- **Tests:** unit test of the item; functional check on a KWOK node.
- **Decision:** approved by Roberto Bandini, 2026-10-15.

### C5. NodeOverlays

- **Problem:** Karpenter v1.15.0 has `NodeOverlay` (`karpenter.sh/v1alpha1`),
  which changes the price and capacity Karpenter assumes for instance types;
  the dashboard does not show it.
- **Proposal:** list the NodeOverlays that apply to each NodePool in its
  Overview card.
- **Tests:** model tests; a NodeOverlay fixture in the static lab.
- **Decision:** approved by Roberto Bandini, 2026-10-15.

### C6. Controller version in any namespace

- **Problem:** the controller Deployment is looked up only in `karpenter`
  and `karpenter-system`; the Karpenter getting-started guide installs it in
  `kube-system`, where the badge falls back to the CRD metadata or
  "installed".
- **Proposal:** find the Deployment by its label
  `app.kubernetes.io/name=karpenter` in any namespace.
- **Tests:** unit test of the lookup; a fixture with the Deployment in
  `kube-system`.
- **Decision:** approved by Roberto Bandini, 2026-10-15.

## Notes and deviations

All six were done in feature I (2026-10-16) and checked with unit tests, the
integration test on the static lab and screenshots on both labs.

- C1: the neutral colours (backgrounds, borders, text greys) are the host's
  theme variables: `--contentColor`, `--borderColor`, `--borderFaintColor`
  and the `--textColor*` ones, with layers made by `color-mix()` of the text
  colour over the content colour, lighter in the dark theme and darker in the
  light one. Topology loses its navy canvas, the Scaling Decisions panels
  their near-black, the Overview figures their fixed light grey. The status,
  capacity and group colours stay as they were: they read on both
  backgrounds, as the host's own `colorError`, `colorWarning` do. A grey for
  data, `COLOR.neutral`, stays fixed where a CSS variable cannot go (SVG
  attributes, the canvas of the chart); the SVG elements take theme colours
  through `style`. Checked with every tab of both labs in both themes; the
  sandbox of the working folder takes the theme by its name (`Light`,
  `Dark`), which is how the host keys its themes.
- C2: `components/PieChart/overview-stats.ts` counts every NodePool for the
  NodePool figures; the chart keeps one slice per NodePool with nodes. A
  `poolstatus:` filter, which the "Not Ready pools" figure sets, also shows
  the NodePools without nodes it matches, so that the figure and the list
  agree (`selectVisibleNodePools` of `pages/overview-filter.ts`).
- C3: removed with its button and the debug counts of the empty state;
  `TIMING.maxDebugEvents` and the unused `eventFetchTtl` are gone. The pool
  timeline takes its limit of 60 events from `TIMING.maxTimelineEvents`.
- C4: `details/node-karpenter.ts` (pure) and `node-karpenter-details.tsx`,
  registered with `detailsFor(Renderer.K8sApi.Node, …)` inside the details
  error boundary, after the host's own Node details. It shows the NodePool and
  NodeClaim (links), instance type, capacity type, zone, status, the
  registered and initialized labels, and whether Karpenter is disrupting the
  node or may not; nothing for other nodes. Found while writing it: B13 of
  SPEC-0001. Its NodePool and NodeClaim links open the object's details in
  place of the node's, over the same page (`Renderer.Navigation.showDetails`),
  as the host's own links in a drawer do, and prevent the click's default, as
  theirs do; otherwise the drawer takes the click for one outside itself and
  closes the new details (found in Phase 5).
- C5: the model `api/nodeoverlay/nodeoverlay-v1alpha1.ts` (types generated
  like the others, the requirement type its own, with `Gte` and `Lte`), its
  store loaded with the others, the list on the NodePool card. Karpenter
  applies a NodeOverlay to the instance types whose labels, with the
  NodePool's name and template labels, meet its requirements; the instance
  types are the cloud provider's, so the card lists the NodeOverlays that
  _can_ apply: a requirement on a label the NodePool fixes (by its name, a
  template label, or an `In`, `NotIn`, `Exists` or `DoesNotExist`
  requirement) must be met, any other can. Highest weight first, then by
  name, as Karpenter merges them.
- C6: the Deployments labelled `app.kubernetes.io/name=karpenter` are listed
  in all namespaces first, whatever their name; when that finds none or is
  not allowed, the Deployments whose name contains `karpenter` in
  `karpenter` and `karpenter-system`, as before. The live lab, where the
  chart installs the controller in `kube-system`, now shows the version
  (1.0.1 showed "installed").

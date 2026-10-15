# SPEC-0003: Improvements beyond parity

- **Status:** Approved (C1-C6, 2026-10-15; the variant of C3 is chosen in step I0)
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

### C3. Debug table of the pool events

- **Problem:** the NodePool card offers a debug table of raw events in the
  released UI.
- **Proposal:** remove it, or keep it behind a preference.
- **Tests:** functional check that it is gone, or follows the preference.
- **Decision:** approved by Roberto Bandini, 2026-10-15; removal or preference is chosen in step I0.

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

None yet.

# SPEC-0002: Local lab and test levels

- **Status:** Draft
- **Milestone:** `M1` (see [ROADMAP.md](../development/ROADMAP.md))
- **Karpenter versions reviewed:** `kubernetes-sigs/karpenter` `v1.15.0`, `aws/karpenter-provider-aws` `v1.15.0`, `Azure/karpenter-provider-azure` `v1.14.5`
- **Tracking issue:** the migration issue (steps 5 and 6) and the functional checks of every feature issue
- **Author / date:** Roberto Bandini, with a coding agent, 2026-10-15

## Goal

Every view of the extension can be exercised on a developer machine and in
CI, against Karpenter objects that look like a real cluster's, without a cloud
account and without touching any cluster but a local kind one.

## Upstream reference

- kind `v0.33.0`; kindest/node of the integration workflow.
- KWOK `v0.8.0` (`kubernetes-sigs/kwok`): `kwok.yaml`, `stage-fast.yaml` and
  `metrics-usage.yaml` of the release, for fake nodes, running pods and
  simulated node metrics.
- Karpenter `v1.15.0` with its KWOK cloud provider
  (`kubernetes-sigs/karpenter/kwok`), built from source with `ko` and Go
  `1.26.9` as its `go.mod` asks, loaded into kind (`KO_DOCKER_REPO=kind.local`).
- metrics-server `v0.9.0`.
- The CRDs of the reviewed Karpenter, AWS provider and Azure provider
  versions, fetched from their tags.

## Scope

Included: scripts that create, fill and delete the lab; the fixtures; the
test levels and what each covers; the safety rules.

Excluded: a real EKS or AKS cluster (manual verification in SPEC-0001).
EC2NodeClass and AKSNodeClass are not reconciled by anything in the lab:
their status is written by the fixtures.

## Design

### Two profiles

| Profile | Cluster | What runs | Used for |
| --- | --- | --- | --- |
| `static` | `karpenter-lab-static` | the Karpenter, AWS and Azure CRDs; the KWOK controller; numbered fixtures with written status; no Karpenter controller; no metrics-server | integration tests, deterministic screenshots, the parity baseline, the "no metrics-server" case |
| `live` | `karpenter-lab-live` | Karpenter with the KWOK provider (real NodePools, NodeClaims, nodes, disruption and events); metrics-server with the KWOK metrics; an `inflate` Deployment scaled up and down | the live checks: objects appearing without a reload, scaling decisions, node usage |

The two are separate clusters because a running Karpenter would reconcile, or
garbage-collect, the static NodeClaims and nodes.

### Layout in the repository

```text
e2e/
  scripts/lib.sh           shared: names, pinned versions, safety checks
  scripts/lab-up.sh        lab-up.sh static|live: create the cluster, install, apply fixtures, wait
  scripts/lab-down.sh      delete only the lab cluster of the profile
  scripts/lab-scale.sh     live: scale the inflate workload to drive Karpenter
  kind-config.yaml         one control plane, one worker
  fixtures/static/NN-*.yaml numbered, applied in order
  fixtures/live/NN-*.yaml
examples/                  the CRDs (by URL at the pinned tags) and a minimal set of objects, kubectl apply -k
.e2e/                      git-ignored: kubeconfig per profile, logs, the Karpenter source checkout
```

### Static fixtures

Numbered, each step waits for what it creates:

- `00` namespaces `karpenter`, `team-a`
- `10` `EC2NodeClass` `default` and `gpu` (one Ready, one not), an
  `AKSNodeClass` `v1beta1`, with status
- `20` `NodePool` `general` (EC2, spot and on-demand, limits), `gpu` (EC2,
  taints), `azure` (AKS), `empty` (no nodes), with status
- `30` KWOK nodes with the labels Karpenter sets (`karpenter.sh/nodepool`,
  `karpenter.sh/nodeclaim`, `node.kubernetes.io/instance-type`,
  `topology.kubernetes.io/zone`, `karpenter.sh/capacity-type`), one being
  disrupted (taint `karpenter.sh/disruption`), one not ready
- `40` `NodeClaim`s bound to those nodes, one claiming (no node yet), with
  status
- `50` pods bound to the KWOK nodes
- `60` Karpenter events (Launched, Registered, Initialized, Disrupting,
  Consolidated, FailedScheduling) in `default`, at known times
- `70` a `karpenter` Deployment in `karpenter`, image tag `1.15.0`, zero
  replicas, for the version badge

Status is written with `kubectl apply --server-side --subresource=status`.
A variant of the static profile serves only `AKSNodeClass` `v1alpha2` next to
`v1beta1`, for the version checks of feature N.

### Safety

- Every script works on its own kubeconfig file, `.e2e/<profile>/kubeconfig`,
  written by `kind create cluster --kubeconfig`, and passes it explicitly to
  every `kubectl`, `helm` and `ko` call; `KUBECONFIG` is unset in the
  scripts, and the user's kubeconfig is neither read nor written.
- `lib.sh` refuses to run when the kubeconfig's context is not
  `kind-karpenter-lab-<profile>` or its server is not on `127.0.0.1`.
- Karpenter's own `make apply-with-kind` is not used: it applies to the
  current context of `~/.kube/config`.
- Freelens is started for checks with a user store that syncs only the lab's
  kubeconfig, in a user data directory under `/tmp`, because the default
  kubeconfig sync reads the real `~/.kube` whatever `HOME` is.

### Test levels

| Level | Tool | Where | Covers |
| --- | --- | --- | --- |
| Type check | `tsc`, per environment | `pnpm type:check` | the v2 API surface, no Node in the renderer |
| Unit | Vitest, jsdom where needed, the `test/freelens-extensions.ts` stub | `pnpm test:unit` | models, helpers, layout, classification, page states (SPEC-0001) |
| Build checks | scripts on `dist/` | after `pnpm build` | one CSS asset, no bare host modules, no `require(` in the renderer, `dist/main.js` loads in Node with a stand-in global |
| Lint | Biome, knip, Trunk | `pnpm lint:check`, `knip:check`, `trunk:check` | dead code, unused dependencies, formatting |
| Integration | the Freelens harness (Playwright, Electron), template style | inside a Freelens checkout, against the `static` lab | install, every tab renders its fixture content, no error in either process |
| Functional | Playwright over CDP against Freelens dev, started in the sandbox | the `static` and `live` labs | the functional checks of the issues, screenshots per tab, console and main log filtered for errors |
| Parity | the same CDP script against Freelens 1.10.3 with the 1.0.1 extension | the `static` lab | the baseline the functional checks compare with |
| Manual | the maintainer | real clusters, other platforms | SPEC-0001 "Manual verification" |

## Tests (non-regression list)

- `lab-up.sh static` on a clean machine ends with every fixture in its
  expected state, twice in a row (idempotent); `lab-down.sh static` removes
  only that cluster.
- `lab-up.sh live` ends with Karpenter Ready; `lab-scale.sh 10` yields
  NodeClaims and KWOK nodes, `lab-scale.sh 0` yields their disruption.
- The safety check refuses a kubeconfig whose context or server is not the
  lab's.

## Notes and deviations

None yet.
